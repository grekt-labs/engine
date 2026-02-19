/**
 * Registry types and interfaces
 *
 * Core abstraction layer for registry operations.
 * The core NEVER knows what GitLab/GitHub is - only that there's
 * "a registry client" with download/publish methods.
 */

// Re-export types from schemas to avoid duplication
export type { LocalConfig, RegistryEntry } from "#/schemas";

export type RegistryType = "gitlab" | "github" | "default";

/**
 * Normalized registry configuration.
 * Created by resolver from raw config, used by factory to create clients.
 */
export interface ResolvedRegistry {
  type: RegistryType;
  host: string;
  project?: string;
  token?: string;
  prefix?: string; // Package name prefix (e.g., "frontend" → "frontend-artifact-name")
  apiBasePath?: string; // REST API base path for default registry (e.g., "/functions/v1")
}

/**
 * Result from download operation
 */
export interface DownloadResult {
  success: boolean;
  version?: string;
  resolved?: string;
  deprecationMessage?: string;
  /** Integrity hash of the extracted artifact (sha256:...) */
  integrity?: string;
  /** Per-file hashes for lockfile storage */
  fileHashes?: Record<string, string>;
  /** Error message if success is false */
  error?: string;
}

/**
 * Result from publish operation
 */
export interface PublishResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Options for client download operation
 */
export interface ArtifactDownloadOptions {
  version?: string;
  targetDir: string;
}

/**
 * Options for client publish operation
 */
export interface ArtifactPublishOptions {
  artifactId: string;
  version: string;
  tarballPath: string;
}

/**
 * Registry client interface.
 * All registry implementations must implement this interface.
 */
export interface RegistryClient {
  /**
   * Download an artifact to the target directory
   */
  download(
    artifactId: string,
    options: ArtifactDownloadOptions
  ): Promise<DownloadResult>;

  /**
   * Publish an artifact tarball
   */
  publish(options: ArtifactPublishOptions): Promise<PublishResult>;

  /**
   * Get the latest version of an artifact
   */
  getLatestVersion(artifactId: string): Promise<string | null>;

  /**
   * Check if a specific version exists
   */
  versionExists(artifactId: string, version: string): Promise<boolean>;

  /**
   * List all versions of an artifact (sorted by semver descending)
   */
  listVersions(artifactId: string): Promise<string[]>;

  /**
   * Get full artifact information (optional, for info command)
   */
  getArtifactInfo?(artifactId: string): Promise<RegistryArtifactInfo | null>;
}

/**
 * Source types for artifact origins
 */
export type SourceType = "registry" | "github" | "gitlab" | "local";

/**
 * Parsed source information
 */
export interface ParsedSource {
  /** Source type */
  type: SourceType;
  /** For registry: artifact ID. For git: owner/repo. For local: file path */
  identifier: string;
  /** Git ref (tag, branch, commit). Defaults to HEAD/main */
  ref?: string;
  /** For self-hosted GitLab: the host */
  host?: string;
  /** Original source string */
  raw: string;
}

/**
 * Publisher result
 */
export interface PublisherResult {
  success: boolean;
  url?: string;
  error?: string;
}

/**
 * Publisher context with all necessary information
 */
export interface PublishContext {
  artifactId: string;
  version: string;
  tarballPath: string;
  scope: string;
  projectRoot: string;
}

/**
 * Publisher interface - Strategy pattern for different registry types
 */
export interface Publisher {
  readonly type: string;
  versionExists(ctx: PublishContext): Promise<boolean>;
  publish(ctx: PublishContext): Promise<PublisherResult>;
}

/**
 * Options for tarball download and extraction
 */
export interface DownloadOptions {
  headers?: Record<string, string>;
  stripComponents?: number;
  /** Temporary file path for tarball. Caller should generate a secure random path. */
  tempTarballPath?: string;
}

/**
 * Result from tarball download operation
 */
export interface TarballDownloadResult {
  success: boolean;
  error?: string;
}

/**
 * Version information for artifact info
 */
export interface VersionInfo {
  version: string;
  deprecated?: string;
  publishedAt?: string;
}

/**
 * Full artifact information (for info/versions commands)
 */
export interface RegistryArtifactInfo {
  artifactId: string;
  latestVersion: string;
  versions: VersionInfo[];
  createdAt?: string;
  updatedAt?: string;
}

// ============================================================================
// Default registry specific operations
// ============================================================================

/**
 * Request payload for publishing to the default registry.
 * Includes metadata fields that the default registry requires beyond the tarball.
 */
export interface DefaultPublishRequest {
  artifactId: string;
  version: string;
  categories: string[];
  description?: string;
  keywords?: string[];
  private?: boolean;
  license?: string;
  repository?: string;
}

/**
 * Result from the default registry publish endpoint.
 * Returns a signed upload URL for the tarball.
 */
export interface DefaultPublishResult {
  uploadUrl: string;
  expiresAt: string;
}

/**
 * Options for confirming a publish after tarball upload.
 * Triggers server-side extraction for file browsing in the web UI.
 */
export interface ConfirmPublishOptions {
  artifactId: string;
  version: string;
  license?: string;
  repositoryUrl?: string;
}

/**
 * Options for deprecating an artifact version.
 */
export interface DeprecateOptions {
  version: string;
  message: string;
}

/**
 * Error response from the default registry API.
 */
export interface RegistryErrorResponse {
  error: string;
  code: string;
  details?: string;
}

/**
 * Operations specific to the default grekt registry.
 * Separated from RegistryClient to avoid polluting the universal interface
 * with operations that only the default registry supports.
 */
export interface DefaultRegistryOperations {
  /**
   * Publish artifact metadata and get a signed upload URL.
   * Caller is responsible for uploading the tarball to the URL.
   */
  requestPublish(request: DefaultPublishRequest): Promise<DefaultPublishResult>;

  /**
   * Confirm a publish after the tarball has been uploaded.
   * Triggers server-side tarball extraction for file browsing.
   */
  confirmPublish(options: ConfirmPublishOptions): Promise<void>;

  /**
   * Deprecate an artifact version with a message.
   */
  deprecate(artifactId: string, options: DeprecateOptions): Promise<void>;

  /**
   * Remove deprecation from an artifact version.
   */
  undeprecate(artifactId: string, version: string): Promise<void>;
}
