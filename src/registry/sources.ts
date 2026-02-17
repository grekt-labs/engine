/**
 * Source parsing utilities
 *
 * Pure functions for parsing artifact source strings.
 * Downloading logic stays in CLI (uses config lookup).
 */

import type { ParsedSource } from "./registry.types";

/**
 * Parse artifact source string into structured format
 *
 * Supported formats:
 * - `./path`, `../path`, `/absolute`, `~/home` → local
 * - `@author/name` or `name` → registry
 * - `github:owner/repo` → GitHub
 * - `github:owner/repo#v1.0.0` → GitHub with tag
 * - `gitlab:owner/repo` → GitLab.com
 * - `gitlab:host.com/owner/repo` → Self-hosted GitLab
 * - `gitlab:host.com/owner/repo#main` → Self-hosted with ref
 */
export function parseSource(source: string): ParsedSource {
  // Local paths: ./relative, ../parent, /absolute, ~/home
  if (source.startsWith("./") || source.startsWith("../") || source.startsWith("/") || source.startsWith("~/")) {
    return {
      type: "local",
      identifier: source,
      raw: source,
    };
  }

  // GitHub: github:owner/repo or github:owner/repo#ref
  if (source.startsWith("github:")) {
    const rest = source.slice(7); // Remove "github:"
    const hashIndex = rest.indexOf("#");
    const repoPath = hashIndex === -1 ? rest : rest.slice(0, hashIndex);
    const ref = hashIndex === -1 ? undefined : rest.slice(hashIndex + 1);
    return {
      type: "github",
      identifier: repoPath,
      ref: ref || undefined,
      raw: source,
    };
  }

  // GitLab: gitlab:owner/repo or gitlab:host/owner/repo
  if (source.startsWith("gitlab:")) {
    const rest = source.slice(7); // Remove "gitlab:"
    const hashIndex = rest.indexOf("#");
    const pathPart = hashIndex === -1 ? rest : rest.slice(0, hashIndex);
    const ref = hashIndex === -1 ? undefined : rest.slice(hashIndex + 1);
    const parts = pathPart.split("/");

    // If 3+ parts and first part looks like a host (has dot), it's self-hosted
    if (parts.length >= 3 && parts[0]!.includes(".")) {
      const host = parts[0]!;
      const identifier = parts.slice(1).join("/");
      return {
        type: "gitlab",
        identifier,
        ref: ref || undefined,
        host,
        raw: source,
      };
    }

    // Otherwise it's gitlab.com
    return {
      type: "gitlab",
      identifier: pathPart,
      ref: ref || undefined,
      host: "gitlab.com",
      raw: source,
    };
  }

  // Default: registry
  return {
    type: "registry",
    identifier: source,
    raw: source,
  };
}

/**
 * Get a display name for a source
 */
export function getSourceDisplayName(source: ParsedSource): string {
  switch (source.type) {
    case "github":
      return `github:${source.identifier}${source.ref ? `#${source.ref}` : ""}`;
    case "gitlab": {
      const host = source.host === "gitlab.com" ? "" : `${source.host}/`;
      return `gitlab:${host}${source.identifier}${source.ref ? `#${source.ref}` : ""}`;
    }
    case "registry":
    case "local":
      return source.identifier;
    default:
      return source.raw;
  }
}
