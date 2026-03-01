import { describe, test, expect } from "vitest";
import { createRegistryClient } from "./factory";
import { DefaultRegistryClient } from "./clients/default";
import { GitLabRegistryClient } from "./clients/gitlab";
import {
  createMockHttpClient,
  createMockFileSystem,
  createMockShellExecutor,
  createMockTarOperations,
} from "#/test-utils/mocks";
import type { ResolvedRegistry } from "./registry.types";

import { REGISTRY_HOST } from "#/constants";

describe("factory", () => {
  describe("createRegistryClient", () => {
    const http = createMockHttpClient();
    const fs = createMockFileSystem();
    const shell = createMockShellExecutor();
    const tar = createMockTarOperations();

    test("returns DefaultRegistryClient for default type", () => {
      const registry: ResolvedRegistry = {
        type: "default",
        host: REGISTRY_HOST,
      };

      const client = createRegistryClient(registry, http, fs, shell, tar);

      expect(client).toBeInstanceOf(DefaultRegistryClient);
    });

    test("returns GitLabRegistryClient for gitlab type", () => {
      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
      };

      const client = createRegistryClient(registry, http, fs, shell, tar);

      expect(client).toBeInstanceOf(GitLabRegistryClient);
    });

    test("returns DefaultRegistryClient for unknown type", () => {
      const registry: ResolvedRegistry = {
        type: "unknown" as "default",
        host: "example.com",
      };

      const client = createRegistryClient(registry, http, fs, shell, tar);

      expect(client).toBeInstanceOf(DefaultRegistryClient);
    });

    test("throws when gitlab registry missing project", () => {
      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        // project is missing
      };

      expect(() => createRegistryClient(registry, http, fs, shell, tar)).toThrow(
        "GitLab registry requires 'project' field in config"
      );
    });

    test("passes token to gitlab client", () => {
      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.mycompany.com",
        project: "team/artifacts",
        token: "my-token",
      };

      // Should not throw
      const client = createRegistryClient(registry, http, fs, shell, tar);
      expect(client).toBeInstanceOf(GitLabRegistryClient);
    });
  });
});
