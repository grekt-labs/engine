import { describe, test, expect } from "bun:test";
import {
  hashContent,
  hashFile,
  hashDirectory,
  calculateIntegrity,
  compareHashes,
  verifyIntegrity,
  getDirectorySize,
} from "./integrity";
import { createMockFileSystem } from "#/test-utils/mocks";

const HASH_PATTERN = /^sha256:[a-f0-9]{32}$/;

describe("integrity", () => {
  describe("hashContent", () => {
    test("returns sha256 prefixed hash with 32 hex chars", () => {
      const result = hashContent("hello");

      expect(result).toMatch(HASH_PATTERN);
    });

    test("produces same hash for same content", () => {
      expect(hashContent("same")).toBe(hashContent("same"));
    });

    test("produces different hash for different content", () => {
      expect(hashContent("a")).not.toBe(hashContent("b"));
    });

    test("handles empty string", () => {
      const result = hashContent("");

      expect(result).toMatch(HASH_PATTERN);
    });
  });

  describe("hashFile", () => {
    test("file hash matches content hash for the same artifact file", () => {
      const artifactContent = "---\ngrk-type: rule\n---\n# Coding standards";
      const fs = createMockFileSystem({
        "/artifacts/@author/rules/coding.md": artifactContent,
      });

      const fileHash = hashFile(fs, "/artifacts/@author/rules/coding.md");
      const contentHash = hashContent(artifactContent);

      expect(fileHash).toBe(contentHash);
    });

    test("detects when artifact file content changes after install", () => {
      const originalContent = "# Original rule";
      const originalHash = hashContent(originalContent);

      const fs = createMockFileSystem({
        "/artifacts/@author/rules/coding.md": "# Modified by user",
      });

      const currentHash = hashFile(fs, "/artifacts/@author/rules/coding.md");

      expect(currentHash).not.toBe(originalHash);
    });
  });

  describe("hashDirectory", () => {
    test("returns empty object for empty directory", () => {
      const fs = createMockFileSystem();
      fs.files.set("/dir", { content: "", isDirectory: true });

      const result = hashDirectory(fs, "/dir");

      expect(result).toEqual({});
    });

    test("returns hashes for files in directory", () => {
      const fs = createMockFileSystem({
        "/dir/file1.txt": "content1",
        "/dir/file2.txt": "content2",
      });

      const result = hashDirectory(fs, "/dir");

      expect(Object.keys(result)).toHaveLength(2);
      expect(result["file1.txt"]).toMatch(HASH_PATTERN);
      expect(result["file2.txt"]).toMatch(HASH_PATTERN);
    });

    test("produces consistent hashes for same content", () => {
      const fs1 = createMockFileSystem({
        "/dir/file.txt": "same content",
      });
      const fs2 = createMockFileSystem({
        "/dir/file.txt": "same content",
      });

      const result1 = hashDirectory(fs1, "/dir");
      const result2 = hashDirectory(fs2, "/dir");

      expect(result1["file.txt"]).toBe(result2["file.txt"]);
    });

    test("produces different hashes for different content", () => {
      const fs = createMockFileSystem({
        "/dir/file1.txt": "content A",
        "/dir/file2.txt": "content B",
      });

      const result = hashDirectory(fs, "/dir");

      expect(result["file1.txt"]).not.toBe(result["file2.txt"]);
    });

    test("walks directories recursively", () => {
      const fs = createMockFileSystem({
        "/dir/root.txt": "root",
        "/dir/sub/nested.txt": "nested",
        "/dir/sub/deep/file.txt": "deep",
      });

      const result = hashDirectory(fs, "/dir");

      expect(Object.keys(result)).toHaveLength(3);
      expect(result["root.txt"]).toBeDefined();
      expect(result["sub/nested.txt"]).toBeDefined();
      expect(result["sub/deep/file.txt"]).toBeDefined();
    });

    test("uses relative paths as keys", () => {
      const fs = createMockFileSystem({
        "/some/long/path/dir/file.txt": "content",
      });

      const result = hashDirectory(fs, "/some/long/path/dir");

      expect(result["file.txt"]).toBeDefined();
      expect(result["/some/long/path/dir/file.txt"]).toBeUndefined();
    });
  });

  describe("calculateIntegrity", () => {
    test("returns hash for file hashes", () => {
      const fileHashes = {
        "file1.txt": "sha256:abc123",
        "file2.txt": "sha256:def456",
      };

      const result = calculateIntegrity(fileHashes);

      expect(result).toMatch(HASH_PATTERN);
    });

    test("produces deterministic hash regardless of object key order", () => {
      const hashes1 = {
        "a.txt": "sha256:aaa",
        "b.txt": "sha256:bbb",
        "c.txt": "sha256:ccc",
      };
      const hashes2 = {
        "c.txt": "sha256:ccc",
        "a.txt": "sha256:aaa",
        "b.txt": "sha256:bbb",
      };

      const result1 = calculateIntegrity(hashes1);
      const result2 = calculateIntegrity(hashes2);

      expect(result1).toBe(result2);
    });

    test("returns different hash for different file hashes", () => {
      const hashes1 = { "file.txt": "sha256:aaa" };
      const hashes2 = { "file.txt": "sha256:bbb" };

      const result1 = calculateIntegrity(hashes1);
      const result2 = calculateIntegrity(hashes2);

      expect(result1).not.toBe(result2);
    });

    test("returns different hash when files differ", () => {
      const hashes1 = { "file1.txt": "sha256:aaa" };
      const hashes2 = { "file2.txt": "sha256:aaa" };

      const result1 = calculateIntegrity(hashes1);
      const result2 = calculateIntegrity(hashes2);

      expect(result1).not.toBe(result2);
    });

    test("handles empty file hashes", () => {
      const result = calculateIntegrity({});

      expect(result).toMatch(HASH_PATTERN);
    });
  });

  describe("compareHashes", () => {
    test("returns valid when expected and actual match exactly", () => {
      const hashes = { "file.txt": "sha256:abc" };

      const result = compareHashes(hashes, hashes);

      expect(result.valid).toBe(true);
      expect(result.missingFiles).toHaveLength(0);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.extraFiles).toHaveLength(0);
    });

    test("detects missing file in actual", () => {
      const expected = { "a.txt": "sha256:aaa", "b.txt": "sha256:bbb" };
      const actual = { "a.txt": "sha256:aaa" };

      const result = compareHashes(expected, actual);

      expect(result.valid).toBe(false);
      expect(result.missingFiles).toEqual(["b.txt"]);
    });

    test("detects modified file hash", () => {
      const expected = { "file.txt": "sha256:original" };
      const actual = { "file.txt": "sha256:changed" };

      const result = compareHashes(expected, actual);

      expect(result.valid).toBe(false);
      expect(result.modifiedFiles).toHaveLength(1);
      expect(result.modifiedFiles[0].expected).toBe("sha256:original");
      expect(result.modifiedFiles[0].actual).toBe("sha256:changed");
    });

    test("extra files do not set valid to false", () => {
      const expected = { "a.txt": "sha256:aaa" };
      const actual = { "a.txt": "sha256:aaa", "extra.txt": "sha256:xxx" };

      const result = compareHashes(expected, actual);

      expect(result.valid).toBe(true);
      expect(result.extraFiles).toEqual(["extra.txt"]);
    });

    test("handles both empty expected and actual", () => {
      const result = compareHashes({}, {});

      expect(result.valid).toBe(true);
    });
  });

  describe("verifyIntegrity", () => {
    test("returns valid:true when files match expected", () => {
      const fs = createMockFileSystem({
        "/dir/file.txt": "content",
      });
      const fileHashes = hashDirectory(fs, "/dir");

      const result = verifyIntegrity(fs, "/dir", fileHashes);

      expect(result.valid).toBe(true);
      expect(result.missingFiles).toHaveLength(0);
      expect(result.modifiedFiles).toHaveLength(0);
      expect(result.extraFiles).toHaveLength(0);
    });

    test("detects missing files", () => {
      const fs = createMockFileSystem({
        "/dir/existing.txt": "content",
      });
      const expectedFiles = {
        "existing.txt": "sha256:somehash",
        "missing.txt": "sha256:anotherhash",
      };

      const result = verifyIntegrity(fs, "/dir", expectedFiles);

      expect(result.valid).toBe(false);
      expect(result.missingFiles).toContain("missing.txt");
    });

    test("detects modified files", () => {
      const fs = createMockFileSystem({
        "/dir/file.txt": "modified content",
      });
      const expectedFiles = {
        "file.txt": "sha256:originalHash",
      };

      const result = verifyIntegrity(fs, "/dir", expectedFiles);

      expect(result.valid).toBe(false);
      expect(result.modifiedFiles).toHaveLength(1);
      expect(result.modifiedFiles[0].path).toBe("file.txt");
      expect(result.modifiedFiles[0].expected).toBe("sha256:originalHash");
      expect(result.modifiedFiles[0].actual).toMatch(/^sha256:/);
    });

    test("reports extra files", () => {
      const fs = createMockFileSystem({
        "/dir/expected.txt": "content",
        "/dir/extra.txt": "extra content",
      });
      const expectedFiles = {
        "expected.txt": hashDirectory(fs, "/dir")["expected.txt"],
      };

      const result = verifyIntegrity(fs, "/dir", expectedFiles);

      // Extra files don't invalidate by default
      expect(result.extraFiles).toContain("extra.txt");
    });

    test("handles multiple issues", () => {
      const fs = createMockFileSystem({
        "/dir/modified.txt": "changed",
        "/dir/extra.txt": "new file",
      });
      const expectedFiles = {
        "modified.txt": "sha256:originalhash",
        "missing.txt": "sha256:missinghash",
      };

      const result = verifyIntegrity(fs, "/dir", expectedFiles);

      expect(result.valid).toBe(false);
      expect(result.missingFiles).toContain("missing.txt");
      expect(result.modifiedFiles.some((m) => m.path === "modified.txt")).toBe(true);
      expect(result.extraFiles).toContain("extra.txt");
    });

    test("returns valid:true for empty expected files and empty directory", () => {
      const fs = createMockFileSystem();
      fs.files.set("/dir", { content: "", isDirectory: true });

      const result = verifyIntegrity(fs, "/dir", {});

      expect(result.valid).toBe(true);
    });
  });

  describe("getDirectorySize", () => {
    test("returns 0 for empty directory", () => {
      const fs = createMockFileSystem();
      fs.files.set("/dir", { content: "", isDirectory: true });

      const result = getDirectorySize(fs, "/dir");

      expect(result).toBe(0);
    });

    test("returns size of single file", () => {
      const content = "hello world";
      const fs = createMockFileSystem({
        "/dir/file.txt": content,
      });

      const result = getDirectorySize(fs, "/dir");

      expect(result).toBe(content.length);
    });

    test("sums sizes of all files", () => {
      const fs = createMockFileSystem({
        "/dir/file1.txt": "12345",
        "/dir/file2.txt": "1234567890",
      });

      const result = getDirectorySize(fs, "/dir");

      expect(result).toBe(15);
    });

    test("includes files in subdirectories", () => {
      const fs = createMockFileSystem({
        "/dir/root.txt": "aaaa",
        "/dir/sub/nested.txt": "bbbbbb",
      });

      const result = getDirectorySize(fs, "/dir");

      expect(result).toBe(10);
    });

    test("handles deeply nested structures", () => {
      const fs = createMockFileSystem({
        "/dir/a/b/c/d/file.txt": "deep",
      });

      const result = getDirectorySize(fs, "/dir");

      expect(result).toBe(4);
    });
  });
});
