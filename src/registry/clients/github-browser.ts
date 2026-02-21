/**
 * GitHub Repository Browser
 *
 * Discovers artifacts in a GitHub repository by reading the file tree
 * and parsing grekt.yaml manifests.
 *
 * Uses the Git Trees API for efficient full-tree retrieval in a single call,
 * then fetches individual grekt.yaml files via the Contents API.
 *
 * @see https://docs.github.com/en/rest/git/trees#get-a-tree
 * @see https://docs.github.com/en/rest/repos/contents#get-repository-content
 */

import type { HttpClient } from "#/core";
import type { ResolvedRegistry } from "../registry.types";
import type { RegistryBrowser, BrowseResult, BrowsedArtifact } from "../browse.types";
import { ArtifactManifestSchema } from "#/schemas";
import { parse as parseYaml } from "yaml";

const MANIFEST_FILENAME = "grekt.yaml";
const DEFAULT_API_HOST = "api.github.com";

interface GitTreeEntry {
  path: string;
  mode: string;
  type: string;
  sha: string;
  size?: number;
  url: string;
}

interface GitTreeResponse {
  sha: string;
  url: string;
  tree: GitTreeEntry[];
  truncated: boolean;
}

interface GitContentsResponse {
  content: string;
  encoding: string;
}

export class GitHubRepositoryBrowser implements RegistryBrowser {
  private apiHost: string;
  private owner: string;
  private repo: string;
  private token?: string;
  private http: HttpClient;

  constructor(registry: ResolvedRegistry, http: HttpClient) {
    if (!registry.project) {
      throw new Error("GitHub browser requires 'project' field (owner/repo format)");
    }

    this.apiHost = resolveApiHost(registry.host);
    this.token = registry.token;
    this.http = http;

    const parts = registry.project.split("/");
    if (parts.length !== 2) {
      throw new Error(
        `Invalid GitHub project format: "${registry.project}". Expected "owner/repo".`
      );
    }
    this.owner = parts[0]!;
    this.repo = parts[1]!;
  }

  async browse(): Promise<BrowseResult> {
    const treeResult = await this.fetchTree();

    if (!treeResult.success) {
      return {
        success: false,
        artifacts: [],
        error: treeResult.error,
      };
    }

    const manifestPaths = treeResult.tree
      .filter((entry) => entry.type === "blob" && entry.path.endsWith(MANIFEST_FILENAME))
      .map((entry) => entry.path);

    if (manifestPaths.length === 0) {
      return { success: true, artifacts: [] };
    }

    const artifacts: BrowsedArtifact[] = [];

    for (const manifestPath of manifestPaths) {
      const artifact = await this.fetchAndParseManifest(manifestPath);
      if (artifact) {
        artifacts.push(artifact);
      }
    }

    return {
      success: true,
      artifacts,
      truncated: treeResult.truncated,
    };
  }

  private async fetchTree(): Promise<{
    success: boolean;
    tree: GitTreeEntry[];
    truncated: boolean;
    error?: string;
  }> {
    const url = `https://${this.apiHost}/repos/${this.owner}/${this.repo}/git/trees/main?recursive=1`;

    try {
      const response = await this.http.fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          return {
            success: false,
            tree: [],
            truncated: false,
            error: "Authentication failed. Configure a token in .grekt/config.yaml or set GITHUB_TOKEN.",
          };
        }
        if (response.status === 404) {
          return {
            success: false,
            tree: [],
            truncated: false,
            error: `Repository not found: ${this.owner}/${this.repo}`,
          };
        }
        return {
          success: false,
          tree: [],
          truncated: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
        };
      }

      const data: GitTreeResponse = await response.json();
      return {
        success: true,
        tree: data.tree,
        truncated: data.truncated,
      };
    } catch (err) {
      return {
        success: false,
        tree: [],
        truncated: false,
        error: err instanceof Error ? err.message : "Unknown error fetching tree",
      };
    }
  }

  private async fetchAndParseManifest(manifestPath: string): Promise<BrowsedArtifact | null> {
    const url = `https://${this.apiHost}/repos/${this.owner}/${this.repo}/contents/${manifestPath}`;

    try {
      const response = await this.http.fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return null;
      }

      const data: GitContentsResponse = await response.json();

      if (data.encoding !== "base64") {
        return null;
      }

      const content = Buffer.from(data.content, "base64").toString("utf-8");
      const raw = parseYaml(content);
      const result = ArtifactManifestSchema.safeParse(raw);

      if (!result.success) {
        return null;
      }

      const folderPath = manifestPath.replace(`/${MANIFEST_FILENAME}`, "").replace(MANIFEST_FILENAME, "");

      return {
        name: result.data.name,
        version: result.data.version,
        description: result.data.description ?? "",
        path: folderPath || ".",
      };
    } catch {
      return null;
    }
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "grekt-cli",
    };

    if (this.token) {
      headers.Authorization = `Bearer ${this.token}`;
    }

    return headers;
  }
}

/**
 * Resolve the GitHub API host from the registry host.
 *
 * - ghcr.io or empty → api.github.com (public GitHub)
 * - Custom GHE host → host/api/v3 equivalent
 */
function resolveApiHost(host: string): string {
  if (!host || host === "ghcr.io") {
    return DEFAULT_API_HOST;
  }

  // GitHub Enterprise: api is at the same host
  const normalized = host.replace(/^https?:\/\//, "");
  return normalized;
}
