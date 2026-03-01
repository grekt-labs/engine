import { describe, test, expect } from "vitest";
import { DefaultRegistryClient, RegistryApiError } from "./default";
import {
  createMockHttpClient,
  createMockFileSystem,
  createMockTarOperations,
  jsonResponse,
  binaryResponse,
  errorResponse,
} from "#/test-utils/mocks";
import type { ResolvedRegistry } from "../registry.types";
import { REGISTRY_HOST } from "#/constants";

const API_BASE_PATH = "";
const API_BASE = `https://${REGISTRY_HOST}`;

/**
 * Helper to build an API artifact response matching the edge function shape
 */
function buildArtifactResponse(overrides: {
  id?: string;
  versions?: Array<{ version: string; deprecated?: string | null }>;
  isPublic?: boolean;
} = {}) {
  const versions = (overrides.versions ?? [{ version: "1.0.0" }]).map(v => ({
    version: v.version,
    publishedAt: "2024-01-01T00:00:00Z",
    downloads: 0,
    deprecated: v.deprecated ?? null,
  }));

  return {
    id: overrides.id ?? "@scope/artifact",
    description: "Test artifact",
    keywords: ["test"],
    isPublic: overrides.isPublic ?? true,
    owner: { type: "user" as const, name: "testuser" },
    versions,
    totalDownloads: 0,
    createdAt: "2024-01-01T00:00:00Z",
  };
}

describe("DefaultRegistryClient", () => {
  const createClient = (
    host = REGISTRY_HOST,
    httpResponses = new Map<string, Response>(),
    token?: string,
    apiBasePath = API_BASE_PATH
  ) => {
    const registry: ResolvedRegistry = {
      type: "default",
      host,
      apiBasePath,
      token,
    };
    const http = createMockHttpClient(httpResponses);
    const fs = createMockFileSystem();
    const tar = createMockTarOperations();

    return { client: new DefaultRegistryClient(registry, http, fs, tar), http, fs, tar };
  };

  describe("download", () => {
    test("downloads and extracts artifact successfully", async () => {
      const publicTarballUrl = "https://r2.example.com/artifacts/@scope/artifact/1.0.0.tar.gz";
      const tarballData = Buffer.from("fake-tarball");

      const { client, tar } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fartifact&version=1.0.0`, jsonResponse({ url: publicTarballUrl, deprecated: null })],
          [publicTarballUrl, binaryResponse(tarballData)],
        ])
      );

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.version).toBe("1.0.0");
      // Public URL (no signature) is stored as resolved
      expect(result.resolved).toBe(publicTarballUrl);
      const extractCall = tar.calls.find((c) => c.operation === "extract");
      expect(extractCall).toBeDefined();
    });

    test("resolves latest version when not specified", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [{ version: "1.0.0" }, { version: "2.0.0" }],
      });
      const publicTarballUrl = "https://r2.example.com/artifacts/@scope/artifact/2.0.0.tar.gz";
      const tarballData = Buffer.from("fake-tarball");

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
          [`${API_BASE}/download?artifact=%40scope%2Fartifact&version=2.0.0`, jsonResponse({ url: publicTarballUrl, deprecated: null })],
          [publicTarballUrl, binaryResponse(tarballData)],
        ])
      );

      const result = await client.download("@scope/artifact", { targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.version).toBe("2.0.0");
    });

    test("returns deprecation message when version is deprecated", async () => {
      const publicTarballUrl = "https://r2.example.com/artifacts/@scope/artifact/1.0.0.tar.gz";
      const tarballData = Buffer.from("fake-tarball");

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fartifact&version=1.0.0`, jsonResponse({
            url: publicTarballUrl,
            deprecated: "This version has security issues, please upgrade",
          })],
          [publicTarballUrl, binaryResponse(tarballData)],
        ])
      );

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.deprecationMessage).toBe("This version has security issues, please upgrade");
    });

    test("returns error when download API returns 404", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fmissing&version=1.0.0`, new Response(
            JSON.stringify({ error: "Artifact not found", code: "ARTIFACT_NOT_FOUND" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          )],
        ])
      );

      const result = await client.download("@scope/missing", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("not found");
    });

    test("returns error when tarball download fails", async () => {
      const brokenTarballUrl = "https://r2.example.com/broken.tar.gz";

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fartifact&version=1.0.0`, jsonResponse({ url: brokenTarballUrl, deprecated: null })],
          [brokenTarballUrl, errorResponse(500, "Server Error")],
        ])
      );

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });

    test("stores canonical API URL for private artifacts (signed URLs)", async () => {
      const signedUrl = "https://r2.example.com/artifacts/@scope/private/1.0.0.tar.gz?X-Amz-Signature=abc123";
      const tarballData = Buffer.from("fake-tarball");

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fprivate&version=1.0.0`, jsonResponse({ url: signedUrl, deprecated: null })],
          [signedUrl, binaryResponse(tarballData)],
        ]),
        "test-token"
      );

      const result = await client.download("@scope/private", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      // Private artifact: resolved URL should be the canonical API URL, not the signed URL
      expect(result.resolved).toBe(`${API_BASE}/download?artifact=%40scope%2Fprivate&version=1.0.0`);
    });

    test("calculates integrity after extraction", async () => {
      const publicTarballUrl = "https://r2.example.com/artifacts/@scope/artifact/1.0.0.tar.gz";
      const tarballData = Buffer.from("fake-tarball");

      const { client, fs } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/download?artifact=%40scope%2Fartifact&version=1.0.0`, jsonResponse({ url: publicTarballUrl, deprecated: null })],
          [publicTarballUrl, binaryResponse(tarballData)],
        ])
      );

      // Simulate extracted files
      fs.files.set("/target/agent.md", { content: "# Agent", isDirectory: false });

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.integrity).toMatch(/^sha256:/);
      expect(result.fileHashes).toBeDefined();
    });
  });

  describe("publish", () => {
    test("returns error when not authenticated", async () => {
      const { client } = createClient();

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("login");
    });

    test("uploads tarball to signed URL on success", async () => {
      const uploadUrl = "https://storage.example.com/upload/signed-url";

      const { client, fs } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish`, jsonResponse({ uploadUrl, expiresAt: "2025-01-01T00:00:00Z" })],
          [uploadUrl, jsonResponse({}, 200)],
        ]),
        "test-token"
      );

      fs.files.set("/path/to/tarball.tar.gz", { content: Buffer.from("tarball-data"), isDirectory: false });

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(true);
    });

    test("returns error when upload fails", async () => {
      const uploadUrl = "https://storage.example.com/upload/signed-url";

      const { client, fs } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish`, jsonResponse({ uploadUrl, expiresAt: "2025-01-01T00:00:00Z" })],
          [uploadUrl, errorResponse(500, "Internal Server Error")],
        ]),
        "test-token"
      );

      fs.files.set("/path/to/tarball.tar.gz", { content: Buffer.from("tarball-data"), isDirectory: false });

      const result = await client.publish({ artifactId: "@scope/artifact", version: "1.0.0", tarballPath: "/path/to/tarball.tar.gz" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("500");
    });
  });

  describe("requestPublish", () => {
    test("throws when not authenticated", async () => {
      const { client } = createClient();

      await expect(client.requestPublish({
        artifactId: "@scope/artifact",
        version: "1.0.0",
        categories: ["agents"],
      })).rejects.toThrow("Not authenticated");
    });

    test("returns upload URL on success", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish`, jsonResponse({ uploadUrl: "https://signed.url/upload", expiresAt: "2025-01-01T00:00:00Z" })],
        ]),
        "test-token"
      );

      const result = await client.requestPublish({
        artifactId: "@scope/artifact",
        version: "1.0.0",
        categories: ["agents"],
      });

      expect(result.uploadUrl).toBe("https://signed.url/upload");
      expect(result.expiresAt).toBe("2025-01-01T00:00:00Z");
    });

    test("throws RegistryApiError on failure", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish`, jsonResponse({ error: "Version already exists", code: "VERSION_EXISTS" }, 409)],
        ]),
        "test-token"
      );

      try {
        await client.requestPublish({
          artifactId: "@scope/artifact",
          version: "1.0.0",
          categories: [],
        });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryApiError);
        expect((err as RegistryApiError).code).toBe("VERSION_EXISTS");
        expect((err as RegistryApiError).message).toBe("Version already exists");
      }
    });
  });

  describe("confirmPublish", () => {
    test("throws when not authenticated", async () => {
      const { client } = createClient();

      await expect(client.confirmPublish({
        artifactId: "@scope/artifact",
        version: "1.0.0",
      })).rejects.toThrow("Not authenticated");
    });

    test("succeeds when API returns 200", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish-confirm`, jsonResponse({})],
        ]),
        "test-token"
      );

      await expect(client.confirmPublish({
        artifactId: "@scope/artifact",
        version: "1.0.0",
        license: "MIT",
        repositoryUrl: "https://github.com/org/repo",
      })).resolves.toBeUndefined();
    });

    test("throws RegistryApiError on failure", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/publish-confirm`, jsonResponse({ error: "Not found", code: "ARTIFACT_NOT_FOUND" }, 404)],
        ]),
        "test-token"
      );

      try {
        await client.confirmPublish({ artifactId: "@scope/missing", version: "1.0.0" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryApiError);
        expect((err as RegistryApiError).code).toBe("ARTIFACT_NOT_FOUND");
      }
    });
  });

  describe("deprecate", () => {
    test("throws when not authenticated", async () => {
      const { client } = createClient();

      await expect(
        client.deprecate("@scope/artifact", { version: "1.0.0", message: "Use v2" })
      ).rejects.toThrow("Not authenticated");
    });

    test("succeeds when API returns 200", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/deprecate`, jsonResponse({})],
        ]),
        "test-token"
      );

      await expect(
        client.deprecate("@scope/artifact", { version: "1.0.0", message: "Use v2 instead" })
      ).resolves.toBeUndefined();
    });

    test("throws RegistryApiError on failure", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/deprecate`, jsonResponse({ error: "Unauthorized", code: "UNAUTHORIZED" }, 403)],
        ]),
        "test-token"
      );

      try {
        await client.deprecate("@scope/artifact", { version: "1.0.0", message: "deprecated" });
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryApiError);
        expect((err as RegistryApiError).code).toBe("UNAUTHORIZED");
      }
    });
  });

  describe("undeprecate", () => {
    test("throws when not authenticated", async () => {
      const { client } = createClient();

      await expect(
        client.undeprecate("@scope/artifact", "1.0.0")
      ).rejects.toThrow("Not authenticated");
    });

    test("succeeds when API returns 200", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/undeprecate`, jsonResponse({})],
        ]),
        "test-token"
      );

      await expect(
        client.undeprecate("@scope/artifact", "1.0.0")
      ).resolves.toBeUndefined();
    });

    test("throws RegistryApiError on failure", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/undeprecate`, jsonResponse({ error: "Version not deprecated", code: "NOT_DEPRECATED" }, 400)],
        ]),
        "test-token"
      );

      try {
        await client.undeprecate("@scope/artifact", "1.0.0");
        expect.unreachable("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(RegistryApiError);
        expect((err as RegistryApiError).code).toBe("NOT_DEPRECATED");
      }
    });
  });

  describe("RegistryApiError", () => {
    test("has correct name, code, and message", () => {
      const err = new RegistryApiError("Something failed", "SOME_CODE", "extra details");

      expect(err).toBeInstanceOf(Error);
      expect(err).toBeInstanceOf(RegistryApiError);
      expect(err.name).toBe("RegistryApiError");
      expect(err.message).toBe("Something failed");
      expect(err.code).toBe("SOME_CODE");
      expect(err.details).toBe("extra details");
    });

    test("details is optional", () => {
      const err = new RegistryApiError("Failed", "CODE");

      expect(err.details).toBeUndefined();
    });
  });

  describe("getLatestVersion", () => {
    test("returns latest version from API metadata", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [{ version: "1.0.0" }, { version: "3.0.0" }, { version: "2.0.0" }],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.getLatestVersion("@scope/artifact");

      expect(result).toBe("3.0.0");
    });

    test("returns null when artifact not found", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fmissing`, new Response(
            JSON.stringify({ error: "Artifact not found", code: "ARTIFACT_NOT_FOUND" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          )],
        ])
      );

      const result = await client.getLatestVersion("@scope/missing");

      expect(result).toBeNull();
    });
  });

  describe("versionExists", () => {
    test("returns true when version exists in API response", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [{ version: "1.0.0" }, { version: "2.0.0" }],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.versionExists("@scope/artifact", "1.0.0");

      expect(result).toBe(true);
    });

    test("returns false when version does not exist", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [{ version: "1.0.0" }],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.versionExists("@scope/artifact", "2.0.0");

      expect(result).toBe(false);
    });

    test("returns false when artifact not found", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fmissing`, new Response(
            JSON.stringify({ error: "Not found", code: "ARTIFACT_NOT_FOUND" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          )],
        ])
      );

      const result = await client.versionExists("@scope/missing", "1.0.0");

      expect(result).toBe(false);
    });
  });

  describe("listVersions", () => {
    test("returns empty array when no versions", async () => {
      const artifactResponse = buildArtifactResponse({ versions: [] });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual([]);
    });

    test("returns versions sorted by semver descending", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [
          { version: "1.0.0" },
          { version: "2.0.0" },
          { version: "10.0.0" },
          { version: "1.5.0" },
        ],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual(["10.0.0", "2.0.0", "1.5.0", "1.0.0"]);
    });

    test("filters out invalid semver versions", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [
          { version: "1.0.0" },
          { version: "banana" },
          { version: "2.0.0" },
          { version: "v3.0.0" },
        ],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.listVersions("@scope/artifact");

      expect(result).toEqual(["2.0.0", "1.0.0"]);
    });
  });

  describe("getArtifactInfo", () => {
    test("returns null when artifact not found", async () => {
      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fmissing`, new Response(
            JSON.stringify({ error: "Not found", code: "ARTIFACT_NOT_FOUND" }),
            { status: 404, headers: { "Content-Type": "application/json" } }
          )],
        ])
      );

      const result = await client.getArtifactInfo("@scope/missing");

      expect(result).toBeNull();
    });

    test("returns artifact info with versions sorted by semver", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [
          { version: "1.0.0", deprecated: "Use 2.0.0 instead" },
          { version: "2.0.0" },
          { version: "10.0.0" },
        ],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.getArtifactInfo("@scope/artifact");

      expect(result).not.toBeNull();
      expect(result!.artifactId).toBe("@scope/artifact");
      expect(result!.latestVersion).toBe("10.0.0");
      expect(result!.versions).toHaveLength(3);
      expect(result!.versions[0].version).toBe("10.0.0");
      expect(result!.versions[2].version).toBe("1.0.0");
      expect(result!.versions[2].deprecated).toBe("Use 2.0.0 instead");
      expect(result!.createdAt).toBe("2024-01-01T00:00:00Z");
    });

    test("uses highest semver as latest even if versions are unordered", async () => {
      const artifactResponse = buildArtifactResponse({
        versions: [
          { version: "1.0.0" },
          { version: "5.0.0" },
          { version: "2.0.0" },
        ],
      });

      const { client } = createClient(
        REGISTRY_HOST,
        new Map([
          [`${API_BASE}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ])
      );

      const result = await client.getArtifactInfo("@scope/artifact");

      expect(result!.latestVersion).toBe("5.0.0");
    });
  });

  describe("apiBasePath full URL override", () => {
    test("uses full URL when apiBasePath starts with http", async () => {
      const localBase = "http://localhost:54321/functions/v1";
      const artifactResponse = buildArtifactResponse({
        versions: [{ version: "1.0.0" }],
      });

      const { client } = createClient(
        "",
        new Map([
          [`${localBase}/artifact?id=%40scope%2Fartifact`, jsonResponse(artifactResponse)],
        ]),
        undefined,
        localBase
      );

      const result = await client.getLatestVersion("@scope/artifact");

      expect(result).toBe("1.0.0");
    });

    test("downloads via full URL override", async () => {
      const localBase = "http://localhost:54321/functions/v1";
      const tarballUrl = "http://localhost:54321/storage/artifacts/1.0.0.tar.gz";
      const tarballData = Buffer.from("fake-tarball");

      const { client } = createClient(
        "",
        new Map([
          [`${localBase}/download?artifact=%40scope%2Fartifact&version=1.0.0`, jsonResponse({ url: tarballUrl, deprecated: null })],
          [tarballUrl, binaryResponse(tarballData)],
        ]),
        undefined,
        localBase
      );

      const result = await client.download("@scope/artifact", { version: "1.0.0", targetDir: "/target" });

      expect(result.success).toBe(true);
      expect(result.version).toBe("1.0.0");
    });
  });
});
