/**
 * Types for browsing artifacts in remote registries.
 *
 * Separate from RegistryClient because browsing uses different APIs
 * (Git repo API) than package operations (Package Registry API).
 */

/**
 * An artifact discovered by browsing a remote registry repository.
 */
export interface BrowsedArtifact {
  name: string;
  version: string;
  description: string;
  path: string;
}

/**
 * Result from browsing a remote registry.
 */
export interface BrowseResult {
  success: boolean;
  artifacts: BrowsedArtifact[];
  truncated?: boolean;
  error?: string;
}

/**
 * Interface for browsing artifacts in a remote registry repository.
 *
 * Unlike RegistryClient (which operates on published packages),
 * RegistryBrowser reads the repository's file tree to discover
 * artifacts by their grekt.yaml manifests.
 */
export interface RegistryBrowser {
  browse(): Promise<BrowseResult>;
}
