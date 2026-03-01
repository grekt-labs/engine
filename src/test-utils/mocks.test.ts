import { describe, test, expect } from "vitest";
import {
  createMockFileSystem,
  createMockHttpClient,
  createMockShellExecutor,
  createMockTarOperations,
  createMockTokenProvider,
  jsonResponse,
  errorResponse,
  binaryResponse,
} from "./mocks";

describe("createMockFileSystem", () => {
  describe("readFile", () => {
    test("returns content for existing file", () => {
      const fs = createMockFileSystem({ "/file.txt": "hello" });
      expect(fs.readFile("/file.txt")).toBe("hello");
    });

    test("throws ENOENT for missing file", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.readFile("/missing.txt")).toThrow("ENOENT");
    });

    test("throws ENOENT when path is a directory", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/dir");
      expect(() => fs.readFile("/dir")).toThrow("ENOENT");
    });

    test("converts Buffer content to string", () => {
      const fs = createMockFileSystem({ "/bin.txt": Buffer.from("binary") });
      expect(fs.readFile("/bin.txt")).toBe("binary");
    });
  });

  describe("readFileBinary", () => {
    test("returns Buffer for string content", () => {
      const fs = createMockFileSystem({ "/file.txt": "hello" });
      const result = fs.readFileBinary("/file.txt");
      expect(result).toBeInstanceOf(Buffer);
      expect(result.toString("utf-8")).toBe("hello");
    });

    test("returns Buffer as-is for Buffer content", () => {
      const buf = Buffer.from([0x00, 0x01, 0x02]);
      const fs = createMockFileSystem({ "/file.bin": buf });
      expect(fs.readFileBinary("/file.bin")).toEqual(buf);
    });

    test("throws ENOENT for missing file", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.readFileBinary("/missing")).toThrow("ENOENT");
    });
  });

  describe("writeFile", () => {
    test("creates new file", () => {
      const fs = createMockFileSystem({});
      fs.writeFile("/new.txt", "content");
      expect(fs.readFile("/new.txt")).toBe("content");
    });

    test("overwrites existing file", () => {
      const fs = createMockFileSystem({ "/file.txt": "old" });
      fs.writeFile("/file.txt", "new");
      expect(fs.readFile("/file.txt")).toBe("new");
    });
  });

  describe("writeFileBinary", () => {
    test("creates file with Buffer content", () => {
      const fs = createMockFileSystem({});
      const buf = Buffer.from([0xff, 0xfe]);
      fs.writeFileBinary("/file.bin", buf);
      expect(fs.readFileBinary("/file.bin")).toEqual(buf);
    });
  });

  describe("exists", () => {
    test("returns true for existing file", () => {
      const fs = createMockFileSystem({ "/file.txt": "x" });
      expect(fs.exists("/file.txt")).toBe(true);
    });

    test("returns false for missing path", () => {
      const fs = createMockFileSystem({});
      expect(fs.exists("/nope")).toBe(false);
    });

    test("returns true for directory created with mkdir", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/dir");
      expect(fs.exists("/dir")).toBe(true);
    });
  });

  describe("mkdir", () => {
    test("creates directory entry", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/dir");
      expect(fs.exists("/dir")).toBe(true);
      expect(fs.stat("/dir").isDirectory).toBe(true);
    });

    test("does not overwrite existing directory", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/dir");
      fs.writeFile("/dir/file.txt", "content");
      fs.mkdir("/dir");
      expect(fs.readFile("/dir/file.txt")).toBe("content");
    });
  });

  describe("readdir", () => {
    test("lists direct children of directory", () => {
      const fs = createMockFileSystem({
        "/root/a.txt": "a",
        "/root/b.txt": "b",
        "/root/sub/c.txt": "c",
      });
      const entries = fs.readdir("/root");
      expect(entries.sort()).toEqual(["a.txt", "b.txt", "sub"]);
    });

    test("returns empty array for empty directory", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/empty");
      expect(fs.readdir("/empty")).toEqual([]);
    });

    test("handles trailing slash in path", () => {
      const fs = createMockFileSystem({ "/dir/file.txt": "x" });
      expect(fs.readdir("/dir/")).toEqual(["file.txt"]);
    });

    test("does not duplicate nested children as top-level entries", () => {
      const fs = createMockFileSystem({
        "/root/sub/deep/file.txt": "x",
      });
      expect(fs.readdir("/root")).toEqual(["sub"]);
      expect(fs.readdir("/root/sub")).toEqual(["deep"]);
    });
  });

  describe("stat", () => {
    test("returns file stats for existing file", () => {
      const fs = createMockFileSystem({ "/file.txt": "hello" });
      const s = fs.stat("/file.txt");
      expect(s.isFile).toBe(true);
      expect(s.isDirectory).toBe(false);
      expect(s.size).toBe(5);
    });

    test("returns directory stats for mkdir directory", () => {
      const fs = createMockFileSystem({});
      fs.mkdir("/dir");
      const s = fs.stat("/dir");
      expect(s.isDirectory).toBe(true);
      expect(s.isFile).toBe(false);
    });

    test("infers directory from children when not explicitly created", () => {
      const fs = createMockFileSystem({ "/parent/child.txt": "x" });
      const s = fs.stat("/parent");
      expect(s.isDirectory).toBe(true);
    });

    test("throws ENOENT for non-existent path with no children", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.stat("/nothing")).toThrow("ENOENT");
    });

    test("reports correct size for Buffer content", () => {
      const buf = Buffer.from([0x00, 0x01, 0x02]);
      const fs = createMockFileSystem({ "/file.bin": buf });
      expect(fs.stat("/file.bin").size).toBe(3);
    });
  });

  describe("unlink", () => {
    test("removes existing file", () => {
      const fs = createMockFileSystem({ "/file.txt": "x" });
      fs.unlink("/file.txt");
      expect(fs.exists("/file.txt")).toBe(false);
    });

    test("does not throw for non-existent file", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.unlink("/missing")).not.toThrow();
    });
  });

  describe("rmdir", () => {
    test("removes directory and all contents", () => {
      const fs = createMockFileSystem({
        "/dir/a.txt": "a",
        "/dir/sub/b.txt": "b",
      });
      fs.rmdir("/dir");
      expect(fs.exists("/dir")).toBe(false);
      expect(fs.exists("/dir/a.txt")).toBe(false);
      expect(fs.exists("/dir/sub/b.txt")).toBe(false);
    });

    test("handles trailing slash", () => {
      const fs = createMockFileSystem({ "/dir/file.txt": "x" });
      fs.rmdir("/dir/");
      expect(fs.exists("/dir/file.txt")).toBe(false);
    });

    test("does not remove sibling directories", () => {
      const fs = createMockFileSystem({
        "/a/file.txt": "a",
        "/b/file.txt": "b",
      });
      fs.rmdir("/a");
      expect(fs.exists("/a/file.txt")).toBe(false);
      expect(fs.exists("/b/file.txt")).toBe(true);
    });
  });

  describe("copyFile", () => {
    test("copies file content to new path", () => {
      const fs = createMockFileSystem({ "/src.txt": "data" });
      fs.copyFile("/src.txt", "/dest.txt");
      expect(fs.readFile("/dest.txt")).toBe("data");
    });

    test("copy is independent of original", () => {
      const fs = createMockFileSystem({ "/src.txt": "original" });
      fs.copyFile("/src.txt", "/dest.txt");
      fs.writeFile("/src.txt", "modified");
      expect(fs.readFile("/dest.txt")).toBe("original");
    });

    test("throws ENOENT for missing source", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.copyFile("/missing", "/dest")).toThrow("ENOENT");
    });
  });

  describe("rename", () => {
    test("moves file to new path", () => {
      const fs = createMockFileSystem({ "/old.txt": "data" });
      fs.rename("/old.txt", "/new.txt");
      expect(fs.exists("/old.txt")).toBe(false);
      expect(fs.readFile("/new.txt")).toBe("data");
    });

    test("throws ENOENT for missing source", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.rename("/missing", "/dest")).toThrow("ENOENT");
    });
  });

  describe("symlink", () => {
    test("rejects relative target path", () => {
      const fs = createMockFileSystem({ "/source.md": "content" });
      expect(() => fs.symlink("relative/path", "/link")).toThrow(
        "Symlink requires absolute paths"
      );
    });

    test("rejects relative link path", () => {
      const fs = createMockFileSystem({ "/source.md": "content" });
      expect(() => fs.symlink("/source.md", "relative/link")).toThrow(
        "Symlink requires absolute paths"
      );
    });

    test("throws on missing target", () => {
      const fs = createMockFileSystem({});
      expect(() => fs.symlink("/missing.md", "/link.md")).toThrow("ENOENT");
    });

    test("creates symlink for valid absolute paths", () => {
      const fs = createMockFileSystem({ "/source.md": "content" });
      fs.symlink("/source.md", "/link.md");
      expect(fs.exists("/link.md")).toBe(true);
      expect(fs.readFile("/link.md")).toBe("content");
    });
  });
});

describe("createMockHttpClient", () => {
  test("returns 404 for unregistered URL", async () => {
    const http = createMockHttpClient();
    const response = await http.fetch("https://unknown.test/path");
    expect(response.status).toBe(404);
  });

  test("returns registered response for matching URL", async () => {
    const http = createMockHttpClient(
      new Map([["https://api.test/data", jsonResponse({ name: "test" })]])
    );
    const response = await http.fetch("https://api.test/data");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.name).toBe("test");
  });

  test("calls factory function for dynamic responses", async () => {
    let callCount = 0;
    const http = createMockHttpClient(
      new Map([
        [
          "https://api.test/counter",
          () => {
            callCount++;
            return jsonResponse({ count: callCount });
          },
        ],
      ])
    );
    const r1 = await http.fetch("https://api.test/counter");
    const r2 = await http.fetch("https://api.test/counter");
    expect((await r1.json()).count).toBe(1);
    expect((await r2.json()).count).toBe(2);
  });
});

describe("createMockShellExecutor", () => {
  test("returns predefined output for matching command", () => {
    const shell = createMockShellExecutor({ git: "main" });
    expect(shell.execFile("git", ["branch"])).toBe("main");
  });

  test("returns empty string for unmatched command", () => {
    const shell = createMockShellExecutor({});
    expect(shell.execFile("ls", ["-la"])).toBe("");
  });

  test("throws when result is an Error", () => {
    const shell = createMockShellExecutor({
      npm: new Error("not found"),
    });
    expect(() => shell.execFile("npm", ["install"])).toThrow("not found");
  });

  test("records calls with command and args", () => {
    const shell = createMockShellExecutor({});
    shell.execFile("git", ["status"]);
    shell.execFile("git", ["diff", "--cached"]);
    expect(shell.calls).toEqual([
      { command: "git", args: ["status"] },
      { command: "git", args: ["diff", "--cached"] },
    ]);
  });

  test("records full command strings for backwards compat", () => {
    const shell = createMockShellExecutor({});
    shell.execFile("git", ["log", "--oneline"]);
    expect(shell.commands).toEqual(["git log --oneline"]);
  });
});

describe("createMockTarOperations", () => {
  test("list returns predefined entries", () => {
    const entries = [
      { path: "grekt.yaml", size: 100, type: "file" as const },
    ];
    const tar = createMockTarOperations(entries);
    expect(tar.list("/path/to/tar.gz")).toEqual(entries);
  });

  test("list returns empty array by default", () => {
    const tar = createMockTarOperations();
    expect(tar.list("/any.tar.gz")).toEqual([]);
  });

  test("records all operations", () => {
    const tar = createMockTarOperations();
    tar.create({ outputPath: "/out.tar.gz", sourceDir: "/src" } as any);
    tar.extract({ tarballPath: "/out.tar.gz", targetDir: "/dest" } as any);
    tar.list("/out.tar.gz");
    expect(tar.calls).toHaveLength(3);
    expect(tar.calls[0].operation).toBe("create");
    expect(tar.calls[1].operation).toBe("extract");
    expect(tar.calls[2].operation).toBe("list");
  });
});

describe("createMockTokenProvider", () => {
  test("returns registry token for matching scope", () => {
    const tokens = createMockTokenProvider({
      registry: { "@myorg": "tok-123" },
    });
    expect(tokens.getRegistryToken("@myorg")).toBe("tok-123");
  });

  test("returns undefined for unmatched scope", () => {
    const tokens = createMockTokenProvider({});
    expect(tokens.getRegistryToken("@unknown")).toBeUndefined();
  });

  test("returns github token", () => {
    const tokens = createMockTokenProvider({
      git: { github: "ghp_xxx" },
    });
    expect(tokens.getGitToken("github")).toBe("ghp_xxx");
  });

  test("returns gitlab token for specific host", () => {
    const tokens = createMockTokenProvider({
      git: { gitlab: { "gl.corp.com": "glpat-xxx" } },
    });
    expect(tokens.getGitToken("gitlab", "gl.corp.com")).toBe("glpat-xxx");
  });

  test("falls back to gitlab.com when no host specified", () => {
    const tokens = createMockTokenProvider({
      git: { gitlab: { "gitlab.com": "default-tok" } },
    });
    expect(tokens.getGitToken("gitlab")).toBe("default-tok");
  });
});

describe("response helpers", () => {
  test("jsonResponse creates 200 JSON response by default", async () => {
    const r = jsonResponse({ key: "value" });
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/json");
    expect(await r.json()).toEqual({ key: "value" });
  });

  test("jsonResponse accepts custom status", async () => {
    const r = jsonResponse({ error: "bad" }, 400);
    expect(r.status).toBe(400);
  });

  test("errorResponse creates empty response with status", () => {
    const r = errorResponse(500, "Internal Error");
    expect(r.status).toBe(500);
    expect(r.statusText).toBe("Internal Error");
  });

  test("binaryResponse creates octet-stream response", async () => {
    const data = Buffer.from([0x01, 0x02, 0x03]);
    const r = binaryResponse(data);
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
