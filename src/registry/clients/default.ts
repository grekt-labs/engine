/**
 * Default registry client
 *
 * Implementation for the public registry.grekt.com.
 * Fetches metadata and tarballs via REST API endpoints (edge functions).
 * Zero dependency on any specific backend — just HTTP.
 */

import { validateTarballContents, type FileSystem, type HttpClient, type ShellExecutor } from "#/core";
import type {
  RegistryClient,
  ResolvedRegistry,
  DownloadResult,
  PublishResult,
  RegistryArtifactInfo,
  VersionInfo,
  DefaultRegistryOperations,
  DefaultPublishRequest,
  DefaultPublishResult,
  ConfirmPublishOptions,
  DeprecateOptions,
  RegistryErrorResponse,
} from "../registry.types";
import { hashDirectory, calculateIntegrity } from "#/artifact";
import { sortVersionsDesc, getHighestVersion } from "#/version";

/**
 * Shape of a version entry returned by the artifact API endpoint
 */
interface ApiVersionEntry {
  version: string;
  publishedAt: string;
  downloads: number;
  deprecated: string | null;
}

/**
 * Shape of the artifact API response
 */
interface ApiArtifactResponse {
  id: string;
  description: string;
  keywords: string[];
  isPublic: boolean;
  owner: { type: "user" | "org"; name: string };
  versions: ApiVersionEntry[];
  totalDownloads: number;
  createdAt: string;
}

/**
 * Shape of the download API response (JSON mode)
 */
interface ApiDownloadResponse {
  url: string;
  deprecated: string | null;
}

export class DefaultRegistryClient implements RegistryClient, DefaultRegistryOperations {
  private host: string;
  private apiBasePath: string;
  private token?: string;
  private http: HttpClient;
  private fs: FileSystem;
  private shell: ShellExecutor;

  constructor(
    registry: ResolvedRegistry,
    http: HttpClient,
    fs: FileSystem,
    shell: ShellExecutor
  ) {
    this.host = registry.host;
    this.apiBasePath = registry.apiBasePath || "";
    this.token = registry.token;
    this.http = http;
    this.fs = fs;
    this.shell = shell;
  }

  private getApiUrl(): string {
    if (this.apiBasePath.startsWith("http")) {
      return this.apiBasePath;
    }
    return `https://${this.host}${this.apiBasePath}`;
  }

  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.token) {
      headers["Authorization"] = `Bearer ${this.token}`;
    }
    return headers;
  }

  /**
   * Fetch artifact metadata from registry REST API
   */
  private async fetchMetadata(artifactId: string): Promise<{ data: ApiArtifactResponse | null; error?: string }> {
    const url = `${this.getApiUrl()}/artifact?id=${encodeURIComponent(artifactId)}`;

    try {
      const response = await this.http.fetch(url, {
        headers: this.getAuthHeaders(),
      });

      if (!response.ok) {
        if (response.status === 404) {
          return { data: null, error: `Artifact not found: ${artifactId}` };
        }
        return {
          data: null,
          error: `Failed to fetch metadata: ${response.status} ${response.statusText}`,
        };
      }

      return { data: await response.json() };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { data: null, error: `Failed to fetch metadata: ${message}` };
    }
  }

  /**
   * Build a stable resolved URL for the lockfile.
   * Public artifacts get a direct R2 URL, private get a canonical API URL.
   */
  private buildResolvedUrl(artifactId: string, version: string, downloadUrl: string, isPublic: boolean): string {
    // For public artifacts, the download URL from the API is a stable R2 public URL
    if (isPublic && !downloadUrl.includes("X-Amz-Signature")) {
      return downloadUrl;
    }

    // For private artifacts, store a canonical API URL (not the signed URL which expires)
    return `${this.getApiUrl()}/download?artifact=${encodeURIComponent(artifactId)}&version=${encodeURIComponent(version)}`;
  }

  async download(
    artifactId: string,
    options: { version?: string; targetDir: string }
  ): Promise<DownloadResult> {
    const { version, targetDir } = options;

    // Resolve version if not specified
    let resolvedVersion = version;
    if (!resolvedVersion) {
      const { data: metadata, error: metadataError } = await this.fetchMetadata(artifactId);
      if (!metadata) {
        return { success: false, error: metadataError || `Artifact not found: ${artifactId}` };
      }
      const versionStrings = metadata.versions.map(v => v.version);
      resolvedVersion = getHighestVersion(versionStrings) ?? undefined;
      if (!resolvedVersion) {
        return { success: false, error: "No versions available for this artifact" };
      }
    }

    try {
      // Get download URL from API
      const downloadApiUrl = `${this.getApiUrl()}/download?artifact=${encodeURIComponent(artifactId)}&version=${encodeURIComponent(resolvedVersion)}`;

      const response = await this.http.fetch(downloadApiUrl, {
        headers: {
          ...this.getAuthHeaders(),
          "Accept": "application/json",
        },
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => null);
        const errorCode = errorBody?.code;

        if (response.status === 404) {
          if (errorCode === "ARTIFACT_NOT_FOUND") {
            return { success: false, error: `Artifact not found: ${artifactId}` };
          }
          if (errorCode === "VERSION_NOT_FOUND") {
            return { success: false, error: `Version ${resolvedVersion} not found` };
          }
          if (errorCode === "FILE_NOT_FOUND") {
            return { success: false, error: "Artifact file not found in storage" };
          }
          return { success: false, error: errorBody?.error || "Not found" };
        }

        if (response.status === 429) {
          return { success: false, error: "Rate limited. Please try again later." };
        }

        return {
          success: false,
          error: errorBody?.error || `Registry returned ${response.status}`,
        };
      }

      const downloadData: ApiDownloadResponse = await response.json();
      const tarballUrl = downloadData.url;
      const deprecationMessage = downloadData.deprecated || undefined;

      // Download the actual tarball
      const tarballResponse = await this.http.fetch(tarballUrl);
      if (!tarballResponse.ok) {
        return {
          success: false,
          error: `Failed to download tarball: ${tarballResponse.status} ${tarballResponse.statusText}`,
        };
      }

      const buffer = await tarballResponse.arrayBuffer();
      const tempTarball = generateSecureTempPath();
      this.fs.writeFileBinary(tempTarball, Buffer.from(buffer));

      // Validate tarball contents BEFORE extraction (prevents path traversal)
      const validation = validateTarballContents(this.shell, tempTarball, targetDir, 1);
      if (!validation.safe) {
        this.fs.unlink(tempTarball);
        return {
          success: false,
          error: `Unsafe tarball: ${validation.violations.join(", ")}`,
        };
      }

      this.fs.mkdir(targetDir, { recursive: true });

      // Use array-based args to prevent shell injection
      const tarArgs = ["-xzf", tempTarball, "-C", targetDir, "--strip-components=1"];
      this.shell.execFile("tar", tarArgs);

      // Clean up temp file
      if (this.fs.exists(tempTarball)) {
        this.fs.unlink(tempTarball);
      }

      // Calculate integrity after extraction
      const fileHashes = hashDirectory(this.fs, targetDir);
      const integrity = calculateIntegrity(fileHashes);

      // Determine if artifact is public by checking if we got a non-signed URL
      const isPublic = !tarballUrl.includes("X-Amz-Signature");
      const resolved = this.buildResolvedUrl(artifactId, resolvedVersion, tarballUrl, isPublic);

      return {
        success: true,
        version: resolvedVersion,
        resolved,
        deprecationMessage,
        integrity,
        fileHashes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      return { success: false, error: `Download failed: ${message}` };
    }
  }

  async publish(
    options: { artifactId: string; version: string; tarballPath: string }
  ): Promise<PublishResult> {
    if (!this.token) {
      return {
        success: false,
        error: "Publishing to default registry requires authentication. Run 'grekt login' first.",
      };
    }

    try {
      // Request signed upload URL from registry
      const { uploadUrl } = await this.requestPublish({
        artifactId: options.artifactId,
        version: options.version,
        categories: [],
      });

      // Upload tarball to signed URL
      const fileBuffer = this.fs.readFileBinary(options.tarballPath);
      const uploadResponse = await this.http.fetch(uploadUrl, {
        method: "PUT",
        body: new Uint8Array(fileBuffer),
        headers: { "Content-Type": "application/gzip" },
      });

      if (!uploadResponse.ok) {
        return {
          success: false,
          error: `Upload failed: ${uploadResponse.status}`,
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  }

  // ============================================================================
  // DefaultRegistryOperations — specific to the grekt default registry
  // ============================================================================

  private async parseErrorResponse(response: Response): Promise<RegistryErrorResponse> {
    try {
      const body = await response.json();
      if (body && typeof body.error === "string" && typeof body.code === "string") {
        return body as RegistryErrorResponse;
      }
    } catch {
      // Failed to parse error body
    }

    return {
      error: `Request failed with status ${response.status}`,
      code: "UNKNOWN",
    };
  }

  async requestPublish(request: DefaultPublishRequest): Promise<DefaultPublishResult> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    const response = await this.http.fetch(`${this.getApiUrl()}/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new RegistryApiError(errorData.error, errorData.code, errorData.details);
    }

    return await response.json();
  }

  async confirmPublish(options: ConfirmPublishOptions): Promise<void> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    const response = await this.http.fetch(`${this.getApiUrl()}/publish-confirm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        artifactId: options.artifactId,
        version: options.version,
        license: options.license,
        repository: options.repositoryUrl,
      }),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new RegistryApiError(errorData.error, errorData.code, errorData.details);
    }
  }

  async deprecate(artifactId: string, options: DeprecateOptions): Promise<void> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    const response = await this.http.fetch(`${this.getApiUrl()}/deprecate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({
        artifactId,
        version: options.version,
        message: options.message,
      }),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new RegistryApiError(errorData.error, errorData.code, errorData.details);
    }
  }

  async undeprecate(artifactId: string, version: string): Promise<void> {
    if (!this.token) {
      throw new Error("Not authenticated");
    }

    const response = await this.http.fetch(`${this.getApiUrl()}/undeprecate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.getAuthHeaders(),
      },
      body: JSON.stringify({ artifactId, version }),
    });

    if (!response.ok) {
      const errorData = await this.parseErrorResponse(response);
      throw new RegistryApiError(errorData.error, errorData.code, errorData.details);
    }
  }

  async getLatestVersion(artifactId: string): Promise<string | null> {
    const { data: metadata } = await this.fetchMetadata(artifactId);
    if (!metadata) return null;
    const versionStrings = metadata.versions.map(v => v.version);
    return getHighestVersion(versionStrings) ?? null;
  }

  async versionExists(artifactId: string, version: string): Promise<boolean> {
    const { data: metadata } = await this.fetchMetadata(artifactId);
    if (!metadata) return false;
    return metadata.versions.some(v => v.version === version);
  }

  async listVersions(artifactId: string): Promise<string[]> {
    const { data: metadata } = await this.fetchMetadata(artifactId);
    if (!metadata) return [];
    const versionStrings = metadata.versions.map(v => v.version);
    return sortVersionsDesc(versionStrings);
  }

  async getArtifactInfo(artifactId: string): Promise<RegistryArtifactInfo | null> {
    const { data: metadata } = await this.fetchMetadata(artifactId);
    if (!metadata) return null;

    const versionStrings = metadata.versions.map(v => v.version);
    const sortedVersions = sortVersionsDesc(versionStrings);

    // Build a lookup map for version details
    const versionMap = new Map<string, ApiVersionEntry>();
    for (const v of metadata.versions) {
      versionMap.set(v.version, v);
    }

    const versions: VersionInfo[] = sortedVersions.map(ver => {
      const entry = versionMap.get(ver);
      return {
        version: ver,
        deprecated: entry?.deprecated || undefined,
        publishedAt: entry?.publishedAt,
      };
    });

    return {
      artifactId: metadata.id,
      latestVersion: getHighestVersion(sortedVersions) ?? sortedVersions[0] ?? "",
      versions,
      createdAt: metadata.createdAt,
    };
  }
}

/**
 * Error thrown by the default registry API operations.
 * Carries structured error code and optional details from the server response.
 */
export class RegistryApiError extends Error {
  readonly code: string;
  readonly details?: string;

  constructor(message: string, code: string, details?: string) {
    super(message);
    this.name = "RegistryApiError";
    this.code = code;
    this.details = details;
  }
}

/**
 * Generate a secure temporary file path using crypto.randomUUID.
 */
function generateSecureTempPath(): string {
  const crypto = require("crypto");
  const uuid = crypto.randomUUID();
  return `/tmp/grekt-${uuid}.tar.gz`;
}
