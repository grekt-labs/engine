import { describe, test, expect } from "vitest";
import {
  SemverSchema,
  ArtifactManifestSchema,
  ArtifactFrontmatterSchema,
  CustomTargetSchema,
  ArtifactEntrySchema,
  ProjectConfigSchema,
  S3CredentialsSchema,
  TokenCredentialsSchema,
  ApiCredentialsSchema,
  RegistryCredentialsSchema,
  CredentialsSchema,
  LockfileEntrySchema,
  LockfileSchema,
  ArtifactMetadataSchema,
  RegistryEntrySchema,
  LocalConfigSchema,
  DashboardConfigSchema,
} from "./index";
import { REGISTRY_HOST } from "#/constants";

describe("schemas", () => {
  describe("SemverSchema", () => {
    test("accepts valid semver versions", () => {
      expect(SemverSchema.parse("1.0.0")).toBe("1.0.0");
      expect(SemverSchema.parse("2.1.0-beta.1")).toBe("2.1.0-beta.1");
      expect(SemverSchema.parse("1.0.0+build")).toBe("1.0.0+build");
    });

    test("rejects invalid versions", () => {
      expect(() => SemverSchema.parse("banana")).toThrow();
      expect(() => SemverSchema.parse("v1.0.0")).toThrow();
      expect(() => SemverSchema.parse("1.0")).toThrow();
      expect(() => SemverSchema.parse("")).toThrow();
    });
  });

  describe("ArtifactManifestSchema", () => {
    test("parses scoped name manifest", () => {
      const manifest = {
        name: "@grekt/my-artifact",
        version: "1.0.0",
        description: "A test artifact",
      };

      const result = ArtifactManifestSchema.parse(manifest);

      expect(result.name).toBe("@grekt/my-artifact");
      expect(result.version).toBe("1.0.0");
      expect(result.description).toBe("A test artifact");
    });

    test("parses unscoped name manifest", () => {
      const manifest = {
        name: "my-local-tool",
        version: "1.0.0",
        description: "A local tool",
      };

      const result = ArtifactManifestSchema.parse(manifest);

      expect(result.name).toBe("my-local-tool");
    });

    test("parses manifest with optional author", () => {
      const manifest = {
        name: "@grekt/my-artifact",
        author: "John Doe",
        version: "1.0.0",
        description: "A test artifact",
      };

      const result = ArtifactManifestSchema.parse(manifest);

      expect(result.author).toBe("John Doe");
    });

    test("author is optional", () => {
      const manifest = {
        name: "@grekt/my-artifact",
        version: "1.0.0",
        description: "A test artifact",
      };

      const result = ArtifactManifestSchema.parse(manifest);

      expect(result.author).toBeUndefined();
    });

    test("rejects missing required fields", () => {
      const invalid = { name: "test" };

      expect(() => ArtifactManifestSchema.parse(invalid)).toThrow();
    });

    test("rejects invalid semver version", () => {
      const invalid = {
        name: "@grekt/my-artifact",
        version: "banana",
        description: "A test artifact",
      };

      expect(() => ArtifactManifestSchema.parse(invalid)).toThrow();
    });

    test("rejects v-prefixed version", () => {
      const invalid = {
        name: "@grekt/my-artifact",
        version: "v1.0.0",
        description: "A test artifact",
      };

      expect(() => ArtifactManifestSchema.parse(invalid)).toThrow();
    });
  });

  describe("ArtifactFrontmatterSchema", () => {
    test("parses agents frontmatter", () => {
      const frontmatter = {
        "grk-type": "agents",
        "grk-name": "Code Reviewer",
        "grk-description": "Reviews code for best practices",
      };

      const result = ArtifactFrontmatterSchema.parse(frontmatter);

      expect(result["grk-type"]).toBe("agents");
      expect(result["grk-name"]).toBe("Code Reviewer");
    });

    test("parses skills with agents reference", () => {
      const frontmatter = {
        "grk-type": "skills",
        "grk-name": "Testing Skill",
        "grk-description": "Helps with testing",
        "grk-agents": "code-reviewer",
      };

      const result = ArtifactFrontmatterSchema.parse(frontmatter);

      expect(result["grk-type"]).toBe("skills");
      expect(result["grk-agents"]).toBe("code-reviewer");
    });

    test("rejects invalid type", () => {
      const invalid = {
        "grk-type": "invalid",
        "grk-name": "Test",
        "grk-description": "Test",
      };

      expect(() => ArtifactFrontmatterSchema.parse(invalid)).toThrow();
    });

    test("accepts all valid types", () => {
      const types = ["agents", "skills", "commands"] as const;

      for (const type of types) {
        const result = ArtifactFrontmatterSchema.parse({
          "grk-type": type,
          "grk-name": "Test",
          "grk-description": "Test",
        });
        expect(result["grk-type"]).toBe(type);
      }
    });
  });

  describe("CustomTargetSchema", () => {
    test("parses valid custom target", () => {
      const target = {
        name: "My Tool",
        contextEntryPoint: ".my-tool/instructions.md",
      };

      const result = CustomTargetSchema.parse(target);

      expect(result.name).toBe("My Tool");
      expect(result.contextEntryPoint).toBe(".my-tool/instructions.md");
    });

    test("parses custom target with paths", () => {
      const target = {
        name: "My Tool",
        contextEntryPoint: ".my-tool/instructions.md",
        paths: {
          agents: ".my-tool/agents",
          skills: ".my-tool/skills",
        },
      };

      const result = CustomTargetSchema.parse(target);

      expect(result.paths?.agents).toBe(".my-tool/agents");
      expect(result.paths?.skills).toBe(".my-tool/skills");
      expect(result.paths?.commands).toBeUndefined();
    });
  });

  describe("ArtifactEntrySchema", () => {
    test("parses version string", () => {
      const result = ArtifactEntrySchema.parse("1.0.0");

      expect(result).toBe("1.0.0");
    });

    test("parses object with selected components", () => {
      const entry = {
        version: "1.0.0",
        agents: ["agents/coder.md"],
        skills: ["skills/testing.md"],
        commands: ["commands/review.md"],
      };

      const result = ArtifactEntrySchema.parse(entry);

      expect(result).toEqual({ ...entry, mode: "lazy" });
    });

    test("parses object with only version", () => {
      const entry = { version: "2.0.0" };

      const result = ArtifactEntrySchema.parse(entry);

      expect(result).toEqual({ version: "2.0.0", mode: "lazy" });
    });

    test("parses object with core mode", () => {
      const entry = { version: "1.0.0", mode: "core" as const };

      const result = ArtifactEntrySchema.parse(entry);

      expect(result).toEqual({ version: "1.0.0", mode: "core" });
    });

    test("rejects invalid semver string", () => {
      expect(() => ArtifactEntrySchema.parse("banana")).toThrow();
      expect(() => ArtifactEntrySchema.parse("v1.0.0")).toThrow();
    });

    test("rejects invalid semver in object", () => {
      const invalid = { version: "banana" };
      expect(() => ArtifactEntrySchema.parse(invalid)).toThrow();
    });

    test("parses object with core-sym mode", () => {
      const entry = { version: "1.0.0", mode: "core-sym" as const };

      const result = ArtifactEntrySchema.parse(entry);

      expect(result).toEqual({ version: "1.0.0", mode: "core-sym" });
    });

    test("rejects invalid mode", () => {
      const entry = { version: "1.0.0", mode: "invalid-mode" };

      expect(() => ArtifactEntrySchema.parse(entry)).toThrow();
    });
  });

  describe("ProjectConfigSchema", () => {
    test("applies all defaults for empty object", () => {
      const result = ProjectConfigSchema.parse({});

      expect(result.targets).toEqual([]);
      expect(result.artifacts).toEqual({});
      expect(result.customTargets).toEqual({});
    });

    test("parses full config", () => {
      const config = {
        targets: ["claude", "cursor"],
        registry: "https://custom.registry.com",
        artifacts: {
          "@grekt/test": "1.0.0",
        },
      };

      const result = ProjectConfigSchema.parse(config);

      expect(result.targets).toEqual(["claude", "cursor"]);
      expect(result.registry).toBe("https://custom.registry.com");
      expect(result.artifacts["@grekt/test"]).toBe("1.0.0");
    });

    test("parses config with custom targets", () => {
      const config = {
        targets: ["my-tool"],
        customTargets: {
          "my-tool": {
            name: "My Tool",
            contextEntryPoint: ".my-tool/instructions.md",
          },
        },
      };

      const result = ProjectConfigSchema.parse(config);

      expect(result.customTargets["my-tool"].name).toBe("My Tool");
    });
  });

  describe("S3CredentialsSchema", () => {
    test("parses valid S3 credentials", () => {
      const creds = {
        type: "s3" as const,
        endpoint: "https://s3.amazonaws.com",
        accessKeyId: "AKIAIOSFODNN7EXAMPLE",
        secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
        bucket: "my-bucket",
      };

      const result = S3CredentialsSchema.parse(creds);

      expect(result.type).toBe("s3");
      expect(result.bucket).toBe("my-bucket");
    });

    test("accepts optional publicUrl", () => {
      const creds = {
        type: "s3" as const,
        endpoint: "https://s3.amazonaws.com",
        accessKeyId: "test",
        secretAccessKey: "test",
        bucket: "my-bucket",
        publicUrl: "https://cdn.example.com",
      };

      const result = S3CredentialsSchema.parse(creds);

      expect(result.publicUrl).toBe("https://cdn.example.com");
    });
  });

  describe("TokenCredentialsSchema", () => {
    test("parses token credentials", () => {
      const creds = { token: "ghp_xxxxxxxxxxxx" };

      const result = TokenCredentialsSchema.parse(creds);

      expect(result.token).toBe("ghp_xxxxxxxxxxxx");
    });
  });

  describe("ApiCredentialsSchema", () => {
    test("parses API credentials", () => {
      const creds = {
        url: "https://api.registry.com",
        token: "grk_xxxxxxxxxxxx",
      };

      const result = ApiCredentialsSchema.parse(creds);

      expect(result.url).toBe("https://api.registry.com");
      expect(result.token).toBe("grk_xxxxxxxxxxxx");
    });
  });

  describe("RegistryCredentialsSchema", () => {
    test("accepts S3 credentials", () => {
      const creds = {
        type: "s3" as const,
        endpoint: "https://s3.amazonaws.com",
        accessKeyId: "test",
        secretAccessKey: "test",
        bucket: "bucket",
      };

      const result = RegistryCredentialsSchema.parse(creds);

      expect(result).toHaveProperty("type", "s3");
    });

    test("accepts token credentials", () => {
      const creds = { token: "test-token" };

      const result = RegistryCredentialsSchema.parse(creds);

      expect(result).toHaveProperty("token", "test-token");
    });

    test("accepts API credentials via ApiCredentialsSchema directly", () => {
      const creds = { url: "https://api.test.com", token: "test" };

      // Note: RegistryCredentialsSchema union matches TokenCredentials first
      // because it only requires 'token'. Use ApiCredentialsSchema directly
      // when you need both url and token preserved.
      const result = ApiCredentialsSchema.parse(creds);

      expect(result).toHaveProperty("url");
      expect(result).toHaveProperty("token");
    });
  });

  describe("CredentialsSchema", () => {
    test("parses credentials record with tokens", () => {
      const creds = {
        github: { token: "ghp_xxx" },
        gitlab: { token: "glpat_xxx" },
      };

      const result = CredentialsSchema.parse(creds);

      expect(result.github).toHaveProperty("token", "ghp_xxx");
      expect(result.gitlab).toHaveProperty("token", "glpat_xxx");
    });

    test("parses S3 credentials in record", () => {
      const creds = {
        s3registry: {
          type: "s3" as const,
          endpoint: "https://s3.example.com",
          accessKeyId: "key",
          secretAccessKey: "secret",
          bucket: "artifacts",
        },
      };

      const result = CredentialsSchema.parse(creds);

      expect(result.s3registry).toHaveProperty("type", "s3");
      expect(result.s3registry).toHaveProperty("bucket", "artifacts");
    });
  });

  describe("LockfileEntrySchema", () => {
    test("parses minimal entry", () => {
      const entry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
      };

      const result = LockfileEntrySchema.parse(entry);

      expect(result.version).toBe("1.0.0");
      expect(result.integrity).toBe("sha256:abc123");
      expect(result.files).toEqual({});
    });

    test("parses full entry", () => {
      const entry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
        resolve: "registry",
        resolved: `https://${REGISTRY_HOST}/artifacts/test/1.0.0.tar.gz`,
        files: {
          "agents/main.md": "sha256:def456",
          "skills/testing.md": "sha256:ghi789",
        },
      };

      const result = LockfileEntrySchema.parse(entry);

      expect(result.resolved).toBe(
        `https://${REGISTRY_HOST}/artifacts/test/1.0.0.tar.gz`
      );
      expect(result.files["agents/main.md"]).toBe("sha256:def456");
    });

    test("lockfile from older CLI version (without synced) remains valid", () => {
      const legacyEntry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
        mode: "core",
        files: { "rules/coding.md": "sha256:abc123" },
      };

      const result = LockfileEntrySchema.parse(legacyEntry);

      expect(result.synced).toBeUndefined();
      expect(result.files["rules/coding.md"]).toBe("sha256:abc123");
    });

    test("core artifact synced to multiple targets preserves per-plugin hashes", () => {
      const entry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
        mode: "core",
        files: { "rules/coding.md": "sha256:abc123" },
        synced: {
          claude: { ".claude/rules/author-foo_coding.md": "sha256:abc123" },
          cursor: { ".cursor/rules/author-foo_coding.md": "sha256:abc123" },
        },
      };

      const result = LockfileEntrySchema.parse(entry);

      expect(Object.keys(result.synced!)).toEqual(["claude", "cursor"]);
      expect(result.synced!.claude[".claude/rules/author-foo_coding.md"]).toBe("sha256:abc123");
      expect(result.synced!.cursor[".cursor/rules/author-foo_coding.md"]).toBe("sha256:abc123");
    });

    test("core-sym artifact stores symlink targets instead of hashes", () => {
      const entry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
        mode: "core-sym",
        files: { "rules/coding.md": "sha256:abc123" },
        synced: {
          claude: {
            ".claude/rules/author-foo_coding.md": "link:/project/.grekt/artifacts/@author/foo/rules/coding.md",
          },
        },
      };

      const result = LockfileEntrySchema.parse(entry);

      const syncedValue = result.synced!.claude[".claude/rules/author-foo_coding.md"];
      expect(syncedValue.startsWith("link:")).toBe(true);
    });

    test("transformed plugin produces different synced hash than source file hash", () => {
      const entry = {
        version: "1.0.0",
        integrity: "sha256:abc123",
        mode: "core",
        files: { "rules/coding.md": "sha256:original111" },
        synced: {
          claude: { ".claude/rules/author-foo_coding.md": "sha256:transformed222" },
        },
      };

      const result = LockfileEntrySchema.parse(entry);

      expect(result.files["rules/coding.md"]).not.toBe(
        result.synced!.claude[".claude/rules/author-foo_coding.md"]
      );
    });

    test("rejects invalid semver version", () => {
      const invalid = {
        version: "banana",
        integrity: "sha256:abc123",
      };

      expect(() => LockfileEntrySchema.parse(invalid)).toThrow();
    });
  });

  describe("LockfileSchema", () => {
    test("parses empty lockfile", () => {
      const lockfile = { version: 1 as const };

      const result = LockfileSchema.parse(lockfile);

      expect(result.version).toBe(1);
      expect(result.artifacts).toEqual({});
    });

    test("parses lockfile with artifacts", () => {
      const lockfile = {
        version: 1 as const,
        artifacts: {
          "@grekt/test": {
            version: "1.0.0",
            integrity: "sha256:abc",
          },
        },
      };

      const result = LockfileSchema.parse(lockfile);

      expect(result.artifacts["@grekt/test"].version).toBe("1.0.0");
    });

    test("rejects invalid version", () => {
      const invalid = { version: 2 };

      expect(() => LockfileSchema.parse(invalid)).toThrow();
    });
  });

  describe("ArtifactMetadataSchema", () => {
    test("parses valid metadata", () => {
      const metadata = {
        name: "@author/artifact",
        latest: "1.2.0",
        deprecated: {},
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      };

      const result = ArtifactMetadataSchema.parse(metadata);

      expect(result.name).toBe("@author/artifact");
      expect(result.latest).toBe("1.2.0");
    });

    test("parses metadata with deprecations", () => {
      const metadata = {
        name: "@author/artifact",
        latest: "2.0.0",
        deprecated: {
          "1.0.0": "Security vulnerability, upgrade to 2.x",
        },
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-06-01T00:00:00Z",
      };

      const result = ArtifactMetadataSchema.parse(metadata);

      expect(result.deprecated["1.0.0"]).toBe(
        "Security vulnerability, upgrade to 2.x"
      );
    });
  });

  describe("RegistryEntrySchema", () => {
    test("parses gitlab registry", () => {
      const entry = {
        type: "gitlab" as const,
        project: "myteam/artifacts",
      };

      const result = RegistryEntrySchema.parse(entry);

      expect(result.type).toBe("gitlab");
      expect(result.project).toBe("myteam/artifacts");
    });

    test("parses self-hosted gitlab", () => {
      const entry = {
        type: "gitlab" as const,
        project: "team/artifacts",
        host: "gitlab.company.com",
        token: "glpat-xxx",
      };

      const result = RegistryEntrySchema.parse(entry);

      expect(result.host).toBe("gitlab.company.com");
    });

    test("accepts all valid types", () => {
      const types = ["gitlab", "github", "default"] as const;

      for (const type of types) {
        const result = RegistryEntrySchema.parse({ type });
        expect(result.type).toBe(type);
      }
    });
  });

  describe("LocalConfigSchema", () => {
    test("parses empty config", () => {
      const result = LocalConfigSchema.parse({});

      expect(result.registries).toBeUndefined();
    });

    test("parses config with registries", () => {
      const config = {
        registries: {
          "@myteam": {
            type: "gitlab" as const,
            project: "myteam/artifacts",
          },
          "@backend": {
            type: "gitlab" as const,
            project: "backend/artifacts",
            host: "gitlab.internal.com",
          },
        },
      };

      const result = LocalConfigSchema.parse(config);

      expect(result.registries?.["@myteam"].project).toBe("myteam/artifacts");
      expect(result.registries?.["@backend"].host).toBe("gitlab.internal.com");
    });

    test("rejects registry scope without @", () => {
      const invalid = {
        registries: {
          myteam: {
            type: "gitlab" as const,
            project: "test",
          },
        },
      };

      expect(() => LocalConfigSchema.parse(invalid)).toThrow();
    });

    test("parses config with dashboard block", () => {
      const config = {
        dashboard: {
          url: "http://127.0.0.1:8090",
          token: "gdk_test-token-123",
        },
      };

      const result = LocalConfigSchema.parse(config);

      expect(result.dashboard).toEqual({
        url: "http://127.0.0.1:8090",
        token: "gdk_test-token-123",
      });
    });

    test("parses config without dashboard block", () => {
      const result = LocalConfigSchema.parse({});

      expect(result.dashboard).toBeUndefined();
    });
  });

  describe("DashboardConfigSchema", () => {
    test("parses valid config", () => {
      const config = {
        url: "http://127.0.0.1:8090",
        token: "gdk_test-token",
      };

      const result = DashboardConfigSchema.parse(config);

      expect(result.url).toBe("http://127.0.0.1:8090");
      expect(result.token).toBe("gdk_test-token");
    });

    test("rejects invalid url", () => {
      const invalid = {
        url: "not-a-url",
        token: "gdk_test-token",
      };

      expect(() => DashboardConfigSchema.parse(invalid)).toThrow();
    });

    test("rejects token without gdk_ prefix", () => {
      const invalid = {
        url: "http://127.0.0.1:8090",
        token: "pb_wrong-prefix",
      };

      expect(() => DashboardConfigSchema.parse(invalid)).toThrow();
    });

    test("rejects empty token", () => {
      const invalid = {
        url: "http://127.0.0.1:8090",
        token: "",
      };

      expect(() => DashboardConfigSchema.parse(invalid)).toThrow();
    });

    test("rejects missing token", () => {
      const invalid = {
        url: "http://127.0.0.1:8090",
      };

      expect(() => DashboardConfigSchema.parse(invalid)).toThrow();
    });
  });
});
