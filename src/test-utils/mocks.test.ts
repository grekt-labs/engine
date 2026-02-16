import { describe, test, expect } from "bun:test";
import { createMockFileSystem } from "./mocks";

describe("createMockFileSystem", () => {
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
