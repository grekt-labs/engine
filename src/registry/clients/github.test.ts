import { describe, test, expect } from "vitest";
import { GitHubRegistryClient } from "./github";
import {
  createMockHttpClient,
  createMockFileSystem,
  createMockShellExecutor,
  createMockTarOperations,
  jsonResponse,
} from "#/test-utils/mocks";
import type { ResolvedRegistry } from "../registry.types";

describe("GitHubRegistryClient", () => {
  const createClient = (registry: Partial<ResolvedRegistry> = {}) => {
    const fullRegistry: ResolvedRegistry = {
      type: "github",
      host: "ghcr.io",
      project: "myorg",
      ...registry,
    };
    const http = createMockHttpClient();
    const fs = createMockFileSystem();
    const shell = createMockShellExecutor({ oras: "" });
    const tar = createMockTarOperations();

    return {
      client: new GitHubRegistryClient(fullRegistry, http, fs, shell, tar),
      http,
      fs,
      shell,
      tar,
    };
  };

  describe("constructor", () => {
    test("throws when project field is missing", () => {
      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        // project is missing
      };
      const http = createMockHttpClient();
      const fs = createMockFileSystem();
      const shell = createMockShellExecutor();

      expect(
        () => new GitHubRegistryClient(registry, http, fs, shell, createMockTarOperations())
      ).toThrow("GitHub registry requires 'project' field in config");
    });

    test("accepts registry with project field", () => {
      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
      };
      const http = createMockHttpClient();
      const fs = createMockFileSystem();
      const shell = createMockShellExecutor();

      expect(
        () => new GitHubRegistryClient(registry, http, fs, shell, createMockTarOperations())
      ).not.toThrow();
    });
  });

  describe("prefix configuration", () => {
    test("prepends prefix to repository name when configured", async () => {
      let requestedRepo = "";

      const http = createMockHttpClient();
      // Mock OCI listTags endpoint
      http.fetch = async (url: string) => {
        // Extract repo name from URL: /v2/{repo}/tags/list
        const match = url.match(/\/v2\/(.+)\/tags\/list/);
        if (match) {
          requestedRepo = match[1]!;
        }
        return jsonResponse({ tags: [] });
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        prefix: "frontend",
      };

      const client = new GitHubRegistryClient(registry, http, createMockFileSystem(), createMockShellExecutor(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Repository name should be "myorg/frontend-utils"
      expect(requestedRepo).toBe("myorg/frontend-utils");
    });

    test("supports prefix with hyphen", async () => {
      let requestedRepo = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        const match = url.match(/\/v2\/(.+)\/tags\/list/);
        if (match) {
          requestedRepo = match[1]!;
        }
        return jsonResponse({ tags: [] });
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        prefix: "packages-frontend",
      };

      const client = new GitHubRegistryClient(registry, http, createMockFileSystem(), createMockShellExecutor(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Repository name should be "myorg/packages-frontend-utils"
      expect(requestedRepo).toBe("myorg/packages-frontend-utils");
    });

    test("works without prefix (backwards compatible)", async () => {
      let requestedRepo = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        const match = url.match(/\/v2\/(.+)\/tags\/list/);
        if (match) {
          requestedRepo = match[1]!;
        }
        return jsonResponse({ tags: [] });
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        // no prefix
      };

      const client = new GitHubRegistryClient(registry, http, createMockFileSystem(), createMockShellExecutor(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Repository name should just be "myorg/utils" (no prefix)
      expect(requestedRepo).toBe("myorg/utils");
    });

    test("prefix appears in resolved OCI URL after download", async () => {
      const http = createMockHttpClient();
      // Mock OCI endpoints
      http.fetch = async (url: string) => {
        if (url.includes("/tags/list")) {
          return jsonResponse({ tags: ["1.0.0"] });
        }
        if (url.includes("/manifests/")) {
          return jsonResponse({
            schemaVersion: 2,
            mediaType: "application/vnd.oci.image.manifest.v1+json",
            layers: [{
              mediaType: "application/vnd.grekt.artifact.layer.v1.tar+gzip",
              digest: "sha256:abc123",
              size: 100,
            }],
          });
        }
        if (url.includes("/blobs/")) {
          return new Response(Buffer.from("fake-tarball"), {
            status: 200,
            headers: { "Content-Type": "application/octet-stream" },
          });
        }
        return jsonResponse({});
      };

      const fs = createMockFileSystem();
      const shell = createMockShellExecutor({ tar: "" });
      fs.files.set("/target/file.md", { content: "content", isDirectory: false });

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        prefix: "frontend",
      };

      const client = new GitHubRegistryClient(registry, http, fs, shell, createMockTarOperations());
      const result = await client.download("@scope/utils", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      // Resolved URL should include prefix in the path
      expect(result.resolved).toBe("oci://ghcr.io/myorg/frontend-utils:1.0.0");
    });
  });

  describe("listVersions", () => {
    test("returns versions sorted by semver descending", async () => {
      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        if (url.includes("/tags/list")) {
          return jsonResponse({ tags: ["1.0.0", "2.0.0", "10.0.0"] });
        }
        return jsonResponse({});
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
      };
      const client = new GitHubRegistryClient(registry, http, createMockFileSystem(), createMockShellExecutor(), createMockTarOperations());
      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual(["10.0.0", "2.0.0", "1.0.0"]);
    });

    test("filters out non-semver tags", async () => {
      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        if (url.includes("/tags/list")) {
          return jsonResponse({ tags: ["1.0.0", "latest", "main", "2.0.0"] });
        }
        return jsonResponse({});
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
      };
      const client = new GitHubRegistryClient(registry, http, createMockFileSystem(), createMockShellExecutor(), createMockTarOperations());
      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual(["2.0.0", "1.0.0"]);
    });
  });

  describe("token exchange", () => {
    const WWW_AUTHENTICATE_HEADER =
      'Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:myorg/utils:pull"';

    const TOKEN_RESPONSE = { token: "exchanged-registry-token" };

    function createTokenExchangeClient() {
      let fetchCallCount = 0;
      let tokenEndpointCalls = 0;

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        fetchCallCount++;

        // Token endpoint
        if (url.startsWith("https://ghcr.io/token")) {
          tokenEndpointCalls++;
          const authHeader = (options?.headers as Record<string, string>)?.Authorization;
          if (!authHeader?.startsWith("Basic ")) {
            return new Response("Unauthorized", { status: 401 });
          }
          return jsonResponse(TOKEN_RESPONSE);
        }

        // OCI registry endpoints - first call returns 401, retries succeed
        const authHeader = (options?.headers as Record<string, string>)?.Authorization;
        if (authHeader === "Bearer exchanged-registry-token") {
          // Authenticated with exchanged token - succeed
          if (url.includes("/tags/list")) {
            return jsonResponse({ tags: ["1.0.0", "2.0.0"] });
          }
          if (url.includes("/manifests/")) {
            return jsonResponse({
              schemaVersion: 2,
              mediaType: "application/vnd.oci.image.manifest.v1+json",
              layers: [{
                mediaType: "application/vnd.grekt.artifact.layer.v1.tar+gzip",
                digest: "sha256:abc123",
                size: 100,
              }],
            });
          }
          if (url.includes("/blobs/")) {
            return new Response(Buffer.from("fake-tarball"), {
              status: 200,
              headers: { "Content-Type": "application/octet-stream" },
            });
          }
        }

        // No token or PAT token - return 401 with challenge
        return new Response("Unauthorized", {
          status: 401,
          headers: { "WWW-Authenticate": WWW_AUTHENTICATE_HEADER },
        });
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        token: "ghp_test_pat",
      };

      const client = new GitHubRegistryClient(
        registry,
        http,
        createMockFileSystem(),
        createMockShellExecutor(),
        createMockTarOperations()
      );

      return { client, http, getFetchCallCount: () => fetchCallCount, getTokenEndpointCalls: () => tokenEndpointCalls };
    }

    test("exchanges PAT for registry token on 401 challenge", async () => {
      const { client } = createTokenExchangeClient();

      const result = await client.listVersions("@scope/utils");

      expect(result).toEqual(["2.0.0", "1.0.0"]);
    });

    test("caches exchanged token across requests with same scope", async () => {
      const { client, getTokenEndpointCalls } = createTokenExchangeClient();

      await client.listVersions("@scope/utils");
      await client.listVersions("@scope/utils");

      // Token endpoint should be called only once, cached for the second request
      expect(getTokenEndpointCalls()).toBe(1);
    });

    test("handles 403 by stripping auth to get 401 challenge (GHCR behavior)", async () => {
      let tokenEndpointCalls = 0;

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        // Token endpoint
        if (url.startsWith("https://ghcr.io/token")) {
          tokenEndpointCalls++;
          return jsonResponse(TOKEN_RESPONSE);
        }

        const authHeader = (options?.headers as Record<string, string>)?.Authorization;

        // Exchanged token - succeed
        if (authHeader === "Bearer exchanged-registry-token") {
          if (url.includes("/tags/list")) {
            return jsonResponse({ tags: ["1.0.0"] });
          }
        }

        // PAT sent as Bearer - GHCR returns 403 (not 401)
        if (authHeader?.startsWith("Bearer ghp_")) {
          return new Response("Forbidden", { status: 403 });
        }

        // No auth header (stripped) - return 401 with challenge
        if (!authHeader) {
          return new Response("Unauthorized", {
            status: 401,
            headers: { "WWW-Authenticate": WWW_AUTHENTICATE_HEADER },
          });
        }

        return new Response("Forbidden", { status: 403 });
      };

      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        token: "ghp_test_pat",
      };

      const client = new GitHubRegistryClient(
        registry,
        http,
        createMockFileSystem(),
        createMockShellExecutor(),
        createMockTarOperations()
      );

      const result = await client.listVersions("@scope/utils");

      expect(result).toEqual(["1.0.0"]);
      expect(tokenEndpointCalls).toBe(1);
    });
  });

  describe("publish", () => {
    test("returns error when no token provided", async () => {
      const { client } = createClient({ token: undefined });

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("authentication");
    });

    test("returns error when oras is not installed", async () => {
      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        token: "ghp_xxxx",
      };

      const http = createMockHttpClient();
      // versionExists checks if tag exists via OCI manifest endpoint
      http.fetch = async (url: string) => {
        if (url.includes("/manifests/")) {
          // Return 404 so versionExists returns false
          return new Response("Not Found", { status: 404 });
        }
        return jsonResponse({ tags: [] });
      };

      const fs = createMockFileSystem();
      // oras command throws = not installed
      const shell = createMockShellExecutor({
        oras: new Error("command not found: oras"),
      });

      const client = new GitHubRegistryClient(registry, http, fs, shell, createMockTarOperations());
      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("oras");
    });

    test("passes relative tarball path to oras", async () => {
      const registry: ResolvedRegistry = {
        type: "github",
        host: "ghcr.io",
        project: "myorg",
        token: "ghp_xxxx",
      };

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        if (url.includes("/manifests/")) {
          return new Response("Not Found", { status: 404 });
        }
        return jsonResponse({ tags: [] });
      };

      const fs = createMockFileSystem();
      const shell = createMockShellExecutor({ oras: "" });

      const client = new GitHubRegistryClient(registry, http, fs, shell, createMockTarOperations());
      const absolutePath = `${process.cwd()}/.grekt/tmp/artifact.tar.gz`;
      await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: absolutePath });

      const orasCall = shell.calls.find((c) => c.command === "oras" && c.args[0] === "push");
      expect(orasCall).toBeDefined();

      // The last arg contains the tarball path — it should be relative, not absolute
      const tarballArg = orasCall!.args[orasCall!.args.length - 1]!;
      expect(tarballArg.startsWith("/")).toBe(false);
      expect(tarballArg).toContain(".grekt/tmp/artifact.tar.gz");
    });
  });
});
