import { describe, test, expect } from "vitest";
import {
  getLockfile,
  saveLockfile,
  createEmptyLockfile,
  lockfileExists,
} from "./lockfile";
import { createMockFileSystem } from "#/test-utils/mocks";
import { stringify, parse } from "yaml";
import type { Lockfile } from "#/schemas";

describe("lockfile", () => {
  describe("createEmptyLockfile", () => {
    test("returns valid lockfile structure", () => {
      const result = createEmptyLockfile();

      expect(result.version).toBe(1);
      expect(result.artifacts).toEqual({});
    });

    test("returns new object each call", () => {
      const result1 = createEmptyLockfile();
      const result2 = createEmptyLockfile();

      expect(result1).not.toBe(result2);
      result1.artifacts["test"] = {
        version: "1.0.0",
        integrity: "sha256:abc",
        files: {},
        agents: [],
        skills: [],
        commands: [],
      };
      expect(result2.artifacts["test"]).toBeUndefined();
    });
  });

  describe("lockfileExists", () => {
    test("returns false when file does not exist", () => {
      const fs = createMockFileSystem();

      const result = lockfileExists(fs, "/project/grekt.lock");

      expect(result).toBe(false);
    });

    test("returns true when file exists", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify({ version: 1, artifacts: {} }),
      });

      const result = lockfileExists(fs, "/project/grekt.lock");

      expect(result).toBe(true);
    });
  });

  describe("getLockfile", () => {
    test("returns empty lockfile when file does not exist", () => {
      const fs = createMockFileSystem();

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.artifacts).toEqual({});
      }
    });

    test("parses existing lockfile", () => {
      const lockfileData: Lockfile = {
        version: 1,
        artifacts: {
          "@scope/artifact": {
            version: "1.0.0",
            integrity: "sha256:abc123def456",
            resolved: "https://registry.grekt.com/@scope/artifact/1.0.0.tar.gz",
            files: {
              "agent.md": "sha256:file1hash",
              "skills/skill.md": "sha256:file2hash",
            },
          },
        },
      };
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify(lockfileData),
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.version).toBe(1);
        expect(result.data.artifacts["@scope/artifact"]).toBeDefined();
        expect(result.data.artifacts["@scope/artifact"].version).toBe("1.0.0");
        expect(result.data.artifacts["@scope/artifact"].integrity).toBe("sha256:abc123def456");
      }
    });

    test("parses lockfile with multiple artifacts", () => {
      const lockfileData: Lockfile = {
        version: 1,
        artifacts: {
          "@org/artifact1": {
            version: "1.0.0",
            integrity: "sha256:hash1",
            files: {},
          },
          "@org/artifact2": {
            version: "2.0.0",
            integrity: "sha256:hash2",
            files: {},
          },
        },
      };
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify(lockfileData),
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(Object.keys(result.data.artifacts)).toHaveLength(2);
        expect(result.data.artifacts["@org/artifact1"].version).toBe("1.0.0");
        expect(result.data.artifacts["@org/artifact2"].version).toBe("2.0.0");
      }
    });

    test("applies default values for optional fields", () => {
      // Minimal lockfile with only required fields
      const minimalLockfile = {
        version: 1,
        artifacts: {
          "@scope/minimal": {
            version: "1.0.0",
            integrity: "sha256:abc",
          },
        },
      };
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify(minimalLockfile),
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.artifacts["@scope/minimal"].files).toEqual({});
      }
    });

    test("returns yaml error for corrupted YAML content", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": "version: [invalid: yaml: broken",
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("yaml");
        expect(result.error.message).toContain("Invalid YAML syntax");
      }
    });

    test("returns validation error for empty file content", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": "",
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("returns validation error for YAML with wrong structure", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": "just_a_string",
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("returns validation error for missing version field", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify({ artifacts: {} }),
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
        expect(result.error.details).toBeDefined();
      }
    });

    test("returns validation error for invalid artifact entry", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify({
          version: 1,
          artifacts: {
            "@scope/bad": {
              // missing version and integrity
              files: {},
            },
          },
        }),
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("includes filepath in error message", () => {
      const fs = createMockFileSystem({
        "/project/grekt.lock": "version: [broken",
      });

      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("/project/grekt.lock");
      }
    });
  });

  describe("saveLockfile", () => {
    test("writes lockfile to disk as YAML", () => {
      const fs = createMockFileSystem();
      const lockfile: Lockfile = {
        version: 1,
        artifacts: {
          "@scope/test": {
            version: "1.0.0",
            integrity: "sha256:abc",
            files: {},
            skills: [],
            commands: [],
          },
        },
      };

      saveLockfile(fs, "/project/grekt.lock", lockfile);

      expect(fs.exists("/project/grekt.lock")).toBe(true);
      const content = fs.readFile("/project/grekt.lock");
      const parsed = parse(content);
      expect(parsed.version).toBe(1);
      expect(parsed.artifacts["@scope/test"].version).toBe("1.0.0");
    });

    test("overwrites existing lockfile", () => {
      const initialLockfile: Lockfile = {
        version: 1,
        artifacts: {
          "@scope/old": {
            version: "0.1.0",
            integrity: "sha256:old",
            files: {},
            skills: [],
            commands: [],
          },
        },
      };
      const fs = createMockFileSystem({
        "/project/grekt.lock": stringify(initialLockfile),
      });
      const newLockfile: Lockfile = {
        version: 1,
        artifacts: {
          "@scope/new": {
            version: "2.0.0",
            integrity: "sha256:new",
            files: {},
            skills: [],
            commands: [],
          },
        },
      };

      saveLockfile(fs, "/project/grekt.lock", newLockfile);

      const content = fs.readFile("/project/grekt.lock");
      const parsed = parse(content);
      expect(parsed.artifacts["@scope/old"]).toBeUndefined();
      expect(parsed.artifacts["@scope/new"]).toBeDefined();
      expect(parsed.artifacts["@scope/new"].version).toBe("2.0.0");
    });

    test("synced hashes survive lockfile round-trip", () => {
      const fs = createMockFileSystem();
      const lockfile: Lockfile = {
        version: 1,
        artifacts: {
          "@author/foo": {
            version: "1.0.0",
            integrity: "sha256:abc123",
            mode: "core",
            files: {
              "rules/coding.md": "sha256:filehash1",
            },
            synced: {
              claude: {
                ".claude/rules/author-foo_coding.md": "sha256:filehash1",
              },
              cursor: {
                ".cursor/rules/author-foo_coding.md": "sha256:transformed2",
              },
            },
          },
        },
      };

      saveLockfile(fs, "/project/grekt.lock", lockfile);
      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        const synced = result.data.artifacts["@author/foo"].synced;
        expect(synced).toBeDefined();
        expect(synced!.claude[".claude/rules/author-foo_coding.md"]).toBe("sha256:filehash1");
        expect(synced!.cursor[".cursor/rules/author-foo_coding.md"]).toBe("sha256:transformed2");
      }
    });

    test("lockfile without synced field loads correctly after upgrade", () => {
      const fs = createMockFileSystem();
      const legacyLockfile = {
        version: 1,
        artifacts: {
          "@author/old": {
            version: "1.0.0",
            integrity: "sha256:abc",
            files: { "agent.md": "sha256:hash1" },
          },
        },
      };

      saveLockfile(fs, "/project/grekt.lock", legacyLockfile as Lockfile);
      const result = getLockfile(fs, "/project/grekt.lock");

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.artifacts["@author/old"].synced).toBeUndefined();
        expect(result.data.artifacts["@author/old"].files["agent.md"]).toBe("sha256:hash1");
      }
    });

    test("preserves all artifact data", () => {
      const fs = createMockFileSystem();
      const lockfile: Lockfile = {
        version: 1,
        artifacts: {
          "@scope/complete": {
            version: "3.0.0",
            integrity: "sha256:complete",
            source: "github:owner/repo",
            resolved: "https://api.github.com/repos/owner/repo/tarball/v3.0.0",
            files: {
              "agent.md": "sha256:agentfile",
              "skills/s1.md": "sha256:skill1",
              "commands/c1.md": "sha256:cmd1",
            },
          },
        },
      };

      saveLockfile(fs, "/project/grekt.lock", lockfile);

      const result = getLockfile(fs, "/project/grekt.lock");
      expect(result.success).toBe(true);
      if (result.success) {
        const artifact = result.data.artifacts["@scope/complete"];
        expect(artifact.version).toBe("3.0.0");
        expect(artifact.integrity).toBe("sha256:complete");
        expect(artifact.source).toBe("github:owner/repo");
        expect(artifact.resolved).toBe("https://api.github.com/repos/owner/repo/tarball/v3.0.0");
        expect(artifact.files["agent.md"]).toBe("sha256:agentfile");
      }
    });
  });
});
