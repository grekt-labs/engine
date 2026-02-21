/**
 * Registry browser factory
 *
 * Creates RegistryBrowser instances based on registry type.
 * Only self-hosted registries (GitHub/GitLab) support browsing,
 * since they expose their repository tree via Git APIs.
 */

import type { HttpClient } from "#/core";
import type { ResolvedRegistry } from "./registry.types";
import type { RegistryBrowser } from "./browse.types";
import { GitHubRepositoryBrowser } from "./clients/github-browser";
import { GitLabRepositoryBrowser } from "./clients/gitlab-browser";

/**
 * Create a registry browser for the resolved registry.
 *
 * @throws Error if the registry type doesn't support browsing (e.g., default registry)
 */
export function createRegistryBrowser(
  registry: ResolvedRegistry,
  http: HttpClient
): RegistryBrowser {
  switch (registry.type) {
    case "github":
      return new GitHubRepositoryBrowser(registry, http);
    case "gitlab":
      return new GitLabRepositoryBrowser(registry, http);
    case "default":
    default:
      throw new Error(
        "Listing remote artifacts is only supported for self-hosted registries (GitHub/GitLab). " +
        "Use the web interface to browse the default registry."
      );
  }
}
