import { describe, test, expect } from "vitest";
import {
  buildGitHubTarballUrl,
  buildGitLabArchiveUrl,
  getGitHubHeaders,
  getGitLabHeaders,
  downloadAndExtractTarball,
} from "./download";
import {
  createMockFileSystem,
  createMockHttpClient,
  createMockTarOperations,
  binaryResponse,
  errorResponse,
} from "#/test-utils/mocks";

describe("download", () => {
  describe("buildGitHubTarballUrl", () => {
    test("constructs correct URL with owner and repo", () => {
      const url = buildGitHubTarballUrl("owner", "repo");

      expect(url).toBe("https://api.github.com/repos/owner/repo/tarball/HEAD");
    });

    test("constructs URL with specific ref", () => {
      const url = buildGitHubTarballUrl("owner", "repo", "v1.0.0");

      expect(url).toBe("https://api.github.com/repos/owner/repo/tarball/v1.0.0");
    });

    test("constructs URL with branch ref", () => {
      const url = buildGitHubTarballUrl("owner", "repo", "main");

      expect(url).toBe("https://api.github.com/repos/owner/repo/tarball/main");
    });
  });

  describe("buildGitLabArchiveUrl", () => {
    test("constructs correct URL with host and project", () => {
      const url = buildGitLabArchiveUrl("gitlab.com", "owner/repo");

      expect(url).toBe(
        "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/archive.tar.gz?sha=main"
      );
    });

    test("constructs URL with specific ref", () => {
      const url = buildGitLabArchiveUrl("gitlab.com", "owner/repo", "v1.0.0");

      expect(url).toBe(
        "https://gitlab.com/api/v4/projects/owner%2Frepo/repository/archive.tar.gz?sha=v1.0.0"
      );
    });

    test("encodes nested project paths", () => {
      const url = buildGitLabArchiveUrl("gitlab.mycompany.com", "group/subgroup/project", "main");

      expect(url).toBe(
        "https://gitlab.mycompany.com/api/v4/projects/group%2Fsubgroup%2Fproject/repository/archive.tar.gz?sha=main"
      );
    });

    test("uses custom host", () => {
      const url = buildGitLabArchiveUrl("gitlab.mycompany.com", "team/project");

      expect(url).toContain("gitlab.mycompany.com");
    });
  });

  describe("getGitHubHeaders", () => {
    test("returns base headers without token", () => {
      const headers = getGitHubHeaders();

      expect(headers.Accept).toBe("application/vnd.github+json");
      expect(headers["User-Agent"]).toBe("grekt-cli");
      expect(headers.Authorization).toBeUndefined();
    });

    test("includes Authorization when token provided", () => {
      const headers = getGitHubHeaders("my-github-token");

      expect(headers.Authorization).toBe("Bearer my-github-token");
      expect(headers.Accept).toBe("application/vnd.github+json");
      expect(headers["User-Agent"]).toBe("grekt-cli");
    });
  });

  describe("getGitLabHeaders", () => {
    test("returns base headers without token", () => {
      const headers = getGitLabHeaders();

      expect(headers["User-Agent"]).toBe("grekt-cli");
      expect(headers["PRIVATE-TOKEN"]).toBeUndefined();
    });

    test("includes PRIVATE-TOKEN when token provided", () => {
      const headers = getGitLabHeaders("my-gitlab-token");

      expect(headers["PRIVATE-TOKEN"]).toBe("my-gitlab-token");
      expect(headers["User-Agent"]).toBe("grekt-cli");
    });
  });

  describe("downloadAndExtractTarball", () => {
    test("downloads and extracts tarball successfully", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const targetDir = "/target/dir";
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      const result = await downloadAndExtractTarball(http, fs, tar, url, targetDir);

      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();
      const extractCall = tar.calls.find((call) => call.operation === "extract");
      expect(extractCall).toBeDefined();
    });

    test("calls tar.extract with correct options", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const targetDir = "/target/dir";
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, targetDir);

      const extractCall = tar.calls.find((call) => call.operation === "extract");
      expect(extractCall).toBeDefined();
      const extractOptions = extractCall!.options as { tarballPath: string; targetDir: string; gzip: boolean; stripComponents?: number };
      expect(extractOptions.targetDir).toBe(targetDir);
      expect(extractOptions.gzip).toBe(true);
      expect(extractOptions.stripComponents).toBe(1);
    });

    test("validates tarball contents before extraction", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, "/target");

      // list() should be called before extract()
      const listCallIndex = tar.calls.findIndex((call) => call.operation === "list");
      const extractCallIndex = tar.calls.findIndex((call) => call.operation === "extract");
      expect(listCallIndex).toBeLessThan(extractCallIndex);
    });

    test("returns error on HTTP failure", async () => {
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, errorResponse(404, "Not Found")]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      const result = await downloadAndExtractTarball(http, fs, tar, url, "/target");

      expect(result.success).toBe(false);
      expect(result.error).toBe("HTTP 404: Not Found");
    });

    test("returns error on network failure", async () => {
      const http = createMockHttpClient(); // No responses configured = 404
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      const result = await downloadAndExtractTarball(
        http,
        fs,
        tar,
        "https://example.com/artifact.tar.gz",
        "/target"
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain("404");
    });

    test("cleans up temp file after successful extraction", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, "/target");

      // Temp file should be deleted after extraction
      const tempFiles = Array.from(fs.files.keys()).filter((k) =>
        k.includes("grekt-")
      );
      expect(tempFiles.length).toBe(0);
    });

    test("uses custom headers", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";
      let capturedHeaders: Record<string, string> | undefined;

      const http: ReturnType<typeof createMockHttpClient> = {
        responses: new Map(),
        async fetch(fetchUrl: string, options?: RequestInit): Promise<Response> {
          if (fetchUrl === url) {
            capturedHeaders = options?.headers as Record<string, string>;
            return binaryResponse(tarballData);
          }
          return errorResponse(404, "Not Found");
        },
      };
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, "/target", {
        headers: { Authorization: "Bearer token" },
      });

      expect(capturedHeaders?.Authorization).toBe("Bearer token");
      expect(capturedHeaders?.["User-Agent"]).toBe("grekt-cli");
    });

    test("uses custom stripComponents value", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, "/target", {
        stripComponents: 2,
      });

      const extractCall = tar.calls.find((call) => call.operation === "extract");
      expect(extractCall).toBeDefined();
      const extractOptions = extractCall!.options as { stripComponents?: number };
      expect(extractOptions.stripComponents).toBe(2);
    });

    test("uses no strip-components when set to 0", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations();

      await downloadAndExtractTarball(http, fs, tar, url, "/target", {
        stripComponents: 0,
      });

      const extractCall = tar.calls.find((call) => call.operation === "extract");
      expect(extractCall).toBeDefined();
      const extractOptions = extractCall!.options as { stripComponents?: number };
      expect(extractOptions.stripComponents).toBeUndefined();
    });

    test("rejects tarball with path traversal entries", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations([
        { path: "prefix/../../../etc/passwd", type: "file" },
      ]);

      const result = await downloadAndExtractTarball(http, fs, tar, url, "/target");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe tarball");
      expect(result.error).toContain("Path traversal");
    });

    test("rejects tarball with symlinks escaping target", async () => {
      const tarballData = Buffer.from("fake-tarball-data");
      const url = "https://example.com/artifact.tar.gz";

      const http = createMockHttpClient(
        new Map([[url, binaryResponse(tarballData)]])
      );
      const fs = createMockFileSystem();
      const tar = createMockTarOperations([
        { path: "prefix/evil-link", type: "symlink", linkTarget: "../../../etc/shadow" },
      ]);

      const result = await downloadAndExtractTarball(http, fs, tar, url, "/target");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Unsafe tarball");
      expect(result.error).toContain("Symlink escapes");
    });
  });
});
