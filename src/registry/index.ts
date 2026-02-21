/**
 * Registry module
 *
 * Handles artifact resolution, download, and publishing
 * across different registry types (default, GitLab, GitHub).
 */

// Types
export * from "./registry.types";

// Resolver (parsing, resolution)
export * from "./resolver";

// Sources (source string parsing)
export * from "./sources";

// Download utilities (URL builders, headers)
export {
  buildGitHubTarballUrl,
  buildGitLabArchiveUrl,
  getGitHubHeaders,
  getGitLabHeaders,
  downloadAndExtractTarball,
} from "./download";

// Factory (client creation)
export { createRegistryClient } from "./factory";

// Browser (remote artifact discovery)
export * from "./browse.types";
export { createRegistryBrowser } from "./browser-factory";

// Clients (direct access if needed)
export { DefaultRegistryClient, RegistryApiError } from "./clients/default";
export { GitLabRegistryClient } from "./clients/gitlab";
