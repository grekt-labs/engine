import { describe, test, expect } from "vitest";
import { GitLabRegistryClient } from "./gitlab";
import {
  createMockHttpClient,
  createMockFileSystem,
  createMockTarOperations,
  jsonResponse,
  binaryResponse,
  errorResponse,
} from "#/test-utils/mocks";
import type { ResolvedRegistry } from "../registry.types";

describe("GitLabRegistryClient", () => {
  const createClient = (
    registry: Partial<ResolvedRegistry> = {},
    httpResponses = new Map<string, Response | (() => Response)>()
  ) => {
    const fullRegistry: ResolvedRegistry = {
      type: "gitlab",
      host: "gitlab.com",
      project: "group/project",
      ...registry,
    };
    const http = createMockHttpClient(httpResponses);
    const fs = createMockFileSystem();
    const tar = createMockTarOperations();

    return {
      client: new GitLabRegistryClient(fullRegistry, http, fs, tar),
      http,
      fs,
      tar,
    };
  };

  describe("constructor", () => {
    test("throws when project field is missing", () => {
      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        // project is missing
      };
      const http = createMockHttpClient();
      const fs = createMockFileSystem();
      expect(
        () => new GitLabRegistryClient(registry, http, fs, createMockTarOperations())
      ).toThrow("GitLab registry requires 'project' field in config");
    });

    test("accepts registry with project field", () => {
      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
      };
      const http = createMockHttpClient();
      const fs = createMockFileSystem();
      expect(
        () => new GitLabRegistryClient(registry, http, fs, createMockTarOperations())
      ).not.toThrow();
    });

    test("normalizes host by stripping https:// prefix", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "https://gitlab.example.com",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(requestedUrl).toContain("https://gitlab.example.com/api/v4");
      expect(requestedUrl).not.toContain("https://https://");
    });

    test("normalizes host by stripping http:// prefix", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "http://gitlab.internal",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(requestedUrl).toContain("https://gitlab.internal/api/v4");
      expect(requestedUrl).not.toContain("http://");
    });

    test("URL-encodes project path for API calls", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/subgroup/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(requestedUrl).toContain("group%2Fsubgroup%2Fproject");
    });

    test("normalizes project by stripping leading slash", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "/group/subgroup/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(requestedUrl).toContain("group%2Fsubgroup%2Fproject");
      expect(requestedUrl).not.toContain("%2Fgroup");
    });
  });

  describe("error handling", () => {
    test("returns clear error when connection fails", async () => {
      const http = createMockHttpClient();
      http.fetch = async () => {
        throw new Error("fetch failed");
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.unreachable.com",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Download failed");
    });

    test("returns clear error on 401 authentication failure", async () => {
      const http = createMockHttpClient();
      http.fetch = async () => errorResponse(401, "Unauthorized");

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "bad-token",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("401");
    });
  });

  describe("download", () => {
    test("downloads artifact successfully", async () => {
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01" },
      ];
      const tarballData = Buffer.from("fake-tarball");

      const { client, fs } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages/generic/artifact/1.0.0/artifact.tar.gz", binaryResponse(tarballData)],
        ])
      );

      // Simulate extracted file
      fs.files.set("/target/agent.md", { content: "# Agent", isDirectory: false });

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.version).toBe("1.0.0");
    });

    test("resolves latest version when not specified", async () => {
      const packages = [
        { id: 2, name: "artifact", version: "2.0.0", package_type: "generic", created_at: "2024-02-01" },
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01" },
      ];
      const tarballData = Buffer.from("fake-tarball");

      const { client, fs } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages/generic/artifact/2.0.0/artifact.tar.gz", binaryResponse(tarballData)],
        ])
      );

      fs.files.set("/target/agent.md", { content: "# Agent", isDirectory: false });

      const result = await client.download("@scope/artifact", { targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.version).toBe("2.0.0");
    });

    test("returns error when no versions found", async () => {
      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=missing", jsonResponse([])],
        ])
      );

      const result = await client.download("@scope/missing", { targetDir: "/target" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("No versions found");
    });

    test("uses correct API URL format with encoded project path", async () => {
      const packages = [
        { id: 1, name: "my-artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01" },
      ];
      const tarballData = Buffer.from("fake-tarball");
      let downloadUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        if (url.includes("/packages/generic/")) {
          downloadUrl = url;
          return binaryResponse(tarballData);
        }
        if (url.includes("/packages?")) {
          return jsonResponse(packages);
        }
        return errorResponse(404, "Not Found");
      };

      const fs = createMockFileSystem();

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.mycompany.com",
        project: "team/artifacts",
      };

      const client = new GitLabRegistryClient(registry, http, fs, createMockTarOperations());
      fs.files.set("/target/file.md", { content: "content", isDirectory: false });

      await client.download("@scope/my-artifact", { version: "1.0.0", targetDir: "/target" });

      expect(downloadUrl).toContain("gitlab.mycompany.com");
      expect(downloadUrl).toContain("team%2Fartifacts");
      expect(downloadUrl).toContain("/packages/generic/my-artifact/1.0.0/artifact.tar.gz");
    });

    test("calculates integrity after extraction", async () => {
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01" },
      ];
      const tarballData = Buffer.from("fake-tarball");

      const { client, fs } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages/generic/artifact/1.0.0/artifact.tar.gz", binaryResponse(tarballData)],
        ])
      );

      fs.files.set("/target/agent.md", { content: "# Agent content", isDirectory: false });

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.integrity).toMatch(/^sha256:/);
      expect(result.fileHashes).toBeDefined();
    });
  });

  describe("publish", () => {
    test("returns error when no token provided", async () => {
      const { client } = createClient({ token: undefined });

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("authentication");
    });

    test("prevents overwriting existing versions", async () => {
      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        if (options?.method === "HEAD") {
          return new Response(null, { status: 200 });
        }
        return errorResponse(404, "Not Found");
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "my-token",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("already exists");
    });

    test("uploads tarball when version does not exist", async () => {
      let uploadedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        if (options?.method === "HEAD") {
          return errorResponse(404, "Not Found");
        }
        if (url.includes("/packages/generic/") && options?.method === "PUT") {
          uploadedUrl = url;
          return jsonResponse({ message: "created" }, 201);
        }
        return errorResponse(404, "Not Found");
      };

      const fs = createMockFileSystem({
        "/path/to/tarball.tar.gz": Buffer.from("tarball content"),
      });

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "my-token",
      };

      const client = new GitLabRegistryClient(registry, http, fs, createMockTarOperations());

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(true);
      expect(uploadedUrl).toContain("group%2Fproject");
      expect(uploadedUrl).toContain("/packages/generic/artifact/1.0.0/artifact.tar.gz");
    });
  });

  describe("listVersions", () => {
    test("returns versions sorted by semver (not by created_at)", async () => {
      // created_at order: 1.0.0, 10.0.0, 2.0.0
      // semver order: 10.0.0, 2.0.0, 1.0.0
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01T00:00:00Z" },
        { id: 2, name: "artifact", version: "10.0.0", package_type: "generic", created_at: "2024-02-01T00:00:00Z" },
        { id: 3, name: "artifact", version: "2.0.0", package_type: "generic", created_at: "2024-03-01T00:00:00Z" },
      ];

      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
        ])
      );

      const result = await client.listVersions("@scope/artifact");

      // Should be sorted by semver, not created_at
      expect(result).toEqual(["10.0.0", "2.0.0", "1.0.0"]);
    });

    test("filters out invalid semver versions", async () => {
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01T00:00:00Z" },
        { id: 2, name: "artifact", version: "banana", package_type: "generic", created_at: "2024-02-01T00:00:00Z" },
        { id: 3, name: "artifact", version: "v2.0.0", package_type: "generic", created_at: "2024-03-01T00:00:00Z" },
      ];

      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
        ])
      );

      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual(["1.0.0"]);
    });

    test("returns empty array when no packages found", async () => {
      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=missing", jsonResponse([])],
        ])
      );

      const result = await client.listVersions("@scope/missing");

      expect(result).toEqual([]);
    });
  });

  describe("getLatestVersion", () => {
    test("returns highest semver version (not most recently published)", async () => {
      // 10.0.0 was published first, 2.0.0 was published last
      // Latest should be 10.0.0 (highest semver), not 2.0.0 (most recent)
      const packages = [
        { id: 1, name: "artifact", version: "10.0.0", package_type: "generic", created_at: "2024-01-01T00:00:00Z" },
        { id: 2, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-02-01T00:00:00Z" },
        { id: 3, name: "artifact", version: "2.0.0", package_type: "generic", created_at: "2024-03-01T00:00:00Z" },
      ];

      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
        ])
      );

      const result = await client.getLatestVersion("@scope/artifact");

      expect(result).toBe("10.0.0");
    });

    test("returns null when no versions exist", async () => {
      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=missing", jsonResponse([])],
        ])
      );

      const result = await client.getLatestVersion("@scope/missing");

      expect(result).toBeNull();
    });
  });

  describe("versionExists", () => {
    test("returns true when HEAD request succeeds", async () => {
      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        if (options?.method === "HEAD" && url.includes("/1.0.0/")) {
          return new Response(null, { status: 200 });
        }
        return errorResponse(404, "Not Found");
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      const result = await client.versionExists("@scope/artifact", "1.0.0");

      expect(result).toBe(true);
    });

    test("returns false when HEAD request returns 404", async () => {
      const http = createMockHttpClient();
      http.fetch = async () => errorResponse(404, "Not Found");

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      const result = await client.versionExists("@scope/artifact", "3.0.0");

      expect(result).toBe(false);
    });

    test("uses correct URL for HEAD request", async () => {
      let requestedUrl = "";
      let requestedMethod = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        requestedUrl = url;
        requestedMethod = options?.method ?? "GET";
        return new Response(null, { status: 200 });
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.versionExists("@scope/artifact", "1.0.0");

      expect(requestedMethod).toBe("HEAD");
      expect(requestedUrl).toBe("https://gitlab.com/api/v4/projects/group%2Fproject/packages/generic/artifact/1.0.0/artifact.tar.gz");
    });
  });

  describe("getArtifactInfo", () => {
    test("returns null when no packages found", async () => {
      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=missing", jsonResponse([])],
        ])
      );

      const result = await client.getArtifactInfo("@scope/missing");

      expect(result).toBeNull();
    });

    test("returns artifact info with versions sorted by semver", async () => {
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-01T00:00:00Z" },
        { id: 2, name: "artifact", version: "10.0.0", package_type: "generic", created_at: "2024-02-01T00:00:00Z" },
        { id: 3, name: "artifact", version: "2.0.0", package_type: "generic", created_at: "2024-03-01T00:00:00Z" },
      ];

      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
        ])
      );

      const result = await client.getArtifactInfo("@scope/artifact");

      expect(result).not.toBeNull();
      expect(result!.artifactId).toBe("@scope/artifact");
      expect(result!.latestVersion).toBe("10.0.0");
      expect(result!.versions).toHaveLength(3);
      expect(result!.versions[0].version).toBe("10.0.0");
      expect(result!.versions[1].version).toBe("2.0.0");
      expect(result!.versions[2].version).toBe("1.0.0");
    });

    test("includes publishedAt from created_at", async () => {
      const packages = [
        { id: 1, name: "artifact", version: "1.0.0", package_type: "generic", created_at: "2024-01-15T10:30:00Z" },
      ];

      const { client } = createClient(
        { host: "gitlab.com", project: "group/project" },
        new Map([
          ["https://gitlab.com/api/v4/projects/group%2Fproject/packages?package_type=generic&package_name=artifact", jsonResponse(packages)],
        ])
      );

      const result = await client.getArtifactInfo("@scope/artifact");

      expect(result!.versions[0].publishedAt).toBe("2024-01-15T10:30:00Z");
    });
  });

  describe("authentication headers", () => {
    test("uses PRIVATE-TOKEN header for personal access tokens", async () => {
      let capturedHeaders: Record<string, string> = {};

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        capturedHeaders = (options?.headers as Record<string, string>) ?? {};
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "glpat-xxxxxxxxxxxxxxxxxxxx",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(capturedHeaders["PRIVATE-TOKEN"]).toBe("glpat-xxxxxxxxxxxxxxxxxxxx");
      expect(capturedHeaders["Deploy-Token"]).toBeUndefined();
    });

    test("uses Deploy-Token header for deploy tokens", async () => {
      let capturedHeaders: Record<string, string> = {};

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        capturedHeaders = (options?.headers as Record<string, string>) ?? {};
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "gldt-xxxxxxxxxxxxxxxxxxxx",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(capturedHeaders["Deploy-Token"]).toBe("gldt-xxxxxxxxxxxxxxxxxxxx");
      expect(capturedHeaders["PRIVATE-TOKEN"]).toBeUndefined();
    });

    test("uses PRIVATE-TOKEN header for tokens without recognized prefix", async () => {
      let capturedHeaders: Record<string, string> = {};

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        capturedHeaders = (options?.headers as Record<string, string>) ?? {};
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "some-legacy-token",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/artifact");

      expect(capturedHeaders["PRIVATE-TOKEN"]).toBe("some-legacy-token");
      expect(capturedHeaders["Deploy-Token"]).toBeUndefined();
    });
  });

  describe("prefix configuration", () => {
    test("prepends prefix to package name when configured", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        prefix: "frontend",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Package name should be "frontend-utils" (using "-" separator, not "/")
      expect(requestedUrl).toContain("package_name=frontend-utils");
    });

    test("supports prefix with hyphen", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        prefix: "packages-frontend",
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Package name should be "packages-frontend-utils" (using "-" separator)
      expect(requestedUrl).toContain("package_name=packages-frontend-utils");
    });

    test("uses prefix in download URL", async () => {
      const packages = [
        { id: 1, name: "frontend-utils", version: "1.0.0", package_type: "generic", created_at: "2024-01-01" },
      ];
      const tarballData = Buffer.from("fake-tarball");
      let downloadUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        if (url.includes("/packages/generic/")) {
          downloadUrl = url;
          return binaryResponse(tarballData);
        }
        if (url.includes("/packages?")) {
          return jsonResponse(packages);
        }
        return errorResponse(404, "Not Found");
      };

      const fs = createMockFileSystem();
      fs.files.set("/target/file.md", { content: "content", isDirectory: false });

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        prefix: "frontend",
      };

      const client = new GitLabRegistryClient(registry, http, fs, createMockTarOperations());
      await client.download("@scope/utils", { version: "1.0.0", targetDir: "/target" });

      expect(downloadUrl).toContain("/packages/generic/frontend-utils/1.0.0/");
    });

    test("uses prefix in publish URL", async () => {
      let uploadUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string, options?: RequestInit) => {
        if (url.includes("/packages/generic/") && options?.method === "PUT") {
          uploadUrl = url;
          return jsonResponse({ message: "created" }, 201);
        }
        if (url.includes("/packages?")) {
          return jsonResponse([]);
        }
        return errorResponse(404, "Not Found");
      };

      const fs = createMockFileSystem({
        "/path/to/tarball.tar.gz": Buffer.from("tarball content"),
      });

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        token: "my-token",
        prefix: "frontend",
      };

      const client = new GitLabRegistryClient(registry, http, fs, createMockTarOperations());
      const result = await client.publish({ artifactId: "@scope/utils", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(true);
      expect(uploadUrl).toContain("/packages/generic/frontend-utils/1.0.0/");
    });

    test("works without prefix (backwards compatible)", async () => {
      let requestedUrl = "";

      const http = createMockHttpClient();
      http.fetch = async (url: string) => {
        requestedUrl = url;
        return jsonResponse([]);
      };

      const registry: ResolvedRegistry = {
        type: "gitlab",
        host: "gitlab.com",
        project: "group/project",
        // no prefix
      };

      const client = new GitLabRegistryClient(registry, http, createMockFileSystem(), createMockTarOperations());
      await client.listVersions("@scope/utils");

      // Package name should just be "utils" (no prefix)
      // Extract package_name query param and verify it's just "utils"
      const url = new URL(requestedUrl);
      expect(url.searchParams.get("package_name")).toBe("utils");
    });
  });
});
