/**
 * GitLab Repository Browser
 *
 * Discovers artifacts in a GitLab repository by reading the file tree
 * and parsing grekt.yaml manifests.
 *
 * Uses the Repository Tree API for directory listing (with pagination),
 * then fetches raw file contents for each grekt.yaml found.
 *
 * @see https://docs.gitlab.com/ee/api/repositories.html#list-repository-tree
 * @see https://docs.gitlab.com/ee/api/repository_files.html#get-raw-file-from-repository
 */

import type { HttpClient } from "#/core";
import type { ResolvedRegistry } from "../registry.types";
import type { RegistryBrowser, BrowseResult, BrowsedArtifact } from "../browse.types";
import { ArtifactManifestSchema } from "#/schemas";
import { parse as parseYaml } from "yaml";

const MANIFEST_FILENAME = "grekt.yaml";
const TREE_PAGE_SIZE = 100;

interface GitLabTreeEntry {
  id: string;
  name: string;
  type: string;
  path: string;
  mode: string;
}

export class GitLabRepositoryBrowser implements RegistryBrowser {
  private host: string;
  private encodedProject: string;
  private token?: string;
  private http: HttpClient;

  constructor(registry: ResolvedRegistry, http: HttpClient) {
    if (!registry.project) {
      throw new Error("GitLab browser requires 'project' field in config");
    }

    this.host = normalizeHost(registry.host);
    this.encodedProject = encodeURIComponent(normalizeProject(registry.project));
    this.token = registry.token;
    this.http = http;
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

    const manifestPaths = treeResult.entries
      .filter((entry) => entry.type === "blob" && entry.name === MANIFEST_FILENAME)
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
    };
  }

  private async fetchTree(): Promise<{
    success: boolean;
    entries: GitLabTreeEntry[];
    error?: string;
  }> {
    const allEntries: GitLabTreeEntry[] = [];
    let page = 1;

    try {
      while (true) {
        const url =
          `https://${this.host}/api/v4/projects/${this.encodedProject}/repository/tree` +
          `?recursive=true&per_page=${TREE_PAGE_SIZE}&page=${page}`;

        const response = await this.http.fetch(url, {
          headers: this.getHeaders(),
        });

        if (!response.ok) {
          if (response.status === 401 || response.status === 403) {
            return {
              success: false,
              entries: [],
              error: "Authentication failed. Configure a token in .grekt/config.yaml or set GITLAB_TOKEN.",
            };
          }
          if (response.status === 404) {
            return {
              success: false,
              entries: [],
              error: `Project not found: ${this.encodedProject}`,
            };
          }
          return {
            success: false,
            entries: [],
            error: `GitLab API error: ${response.status} ${response.statusText}`,
          };
        }

        const entries: GitLabTreeEntry[] = await response.json();
        allEntries.push(...entries);

        // Check pagination: GitLab returns x-next-page header
        const nextPage = response.headers.get("x-next-page");
        if (!nextPage || nextPage === "") {
          break;
        }

        page = parseInt(nextPage, 10);
      }

      return { success: true, entries: allEntries };
    } catch (err) {
      return {
        success: false,
        entries: [],
        error: err instanceof Error ? err.message : "Unknown error fetching tree",
      };
    }
  }

  private async fetchAndParseManifest(manifestPath: string): Promise<BrowsedArtifact | null> {
    const encodedPath = encodeURIComponent(manifestPath);
    const url =
      `https://${this.host}/api/v4/projects/${this.encodedProject}` +
      `/repository/files/${encodedPath}/raw?ref=main`;

    try {
      const response = await this.http.fetch(url, {
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        return null;
      }

      const content = await response.text();
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

  /**
   * Get request headers for GitLab API.
   *
   * Reuses the same token-type detection as GitLabRegistryClient:
   * - Deploy Token (gldt-*): Deploy-Token header
   * - Personal Access Token: PRIVATE-TOKEN header
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "User-Agent": "grekt-cli",
    };

    if (this.token) {
      const isDeployToken = this.token.startsWith("gldt-");
      const headerName = isDeployToken ? "Deploy-Token" : "PRIVATE-TOKEN";
      headers[headerName] = this.token;
    }

    return headers;
  }
}

/**
 * Normalize host by removing protocol prefix if present.
 */
function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, "");
}

/**
 * Normalize project path by removing leading slash if present.
 */
function normalizeProject(project: string): string {
  return project.replace(/^\//, "");
}
