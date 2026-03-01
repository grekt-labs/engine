import { describe, test, expect } from "vitest";
import {
  getSafeFilename,
  resolveComponentFilename,
  toSafeName,
  buildArtifactId,
  isScoped,
  parseName,
  getArtifactIdFromManifest,
} from "./naming";
import type { ArtifactManifest } from "#/schemas";

describe("naming", () => {
  describe("isScoped", () => {
    test("returns true for scoped names", () => {
      expect(isScoped("@scope/name")).toBe(true);
      expect(isScoped("@my-org/my-artifact")).toBe(true);
    });

    test("returns false for unscoped names", () => {
      expect(isScoped("my-tool")).toBe(false);
      expect(isScoped("simple")).toBe(false);
    });
  });

  describe("parseName", () => {
    test("parses scoped names", () => {
      const result = parseName("@grekt/analyzer");
      expect(result.scope).toBe("@grekt");
      expect(result.baseName).toBe("analyzer");
      expect(result.artifactId).toBe("@grekt/analyzer");
    });

    test("parses unscoped names", () => {
      const result = parseName("my-tool");
      expect(result.scope).toBeNull();
      expect(result.baseName).toBe("my-tool");
      expect(result.artifactId).toBe("my-tool");
    });

    test("handles complex scope names", () => {
      const result = parseName("@my-org/my-artifact-name");
      expect(result.scope).toBe("@my-org");
      expect(result.baseName).toBe("my-artifact-name");
    });
  });

  describe("resolveComponentFilename", () => {
    test("returns basename for uniquely named files", () => {
      expect(resolveComponentFilename("analyze.md")).toBe("analyze.md");
      expect(resolveComponentFilename("skills/analyze.md")).toBe("analyze.md");
      expect(resolveComponentFilename("deep/nested/file.md")).toBe("file.md");
    });

    test("uses parent directory for generic SKILL.md files", () => {
      expect(resolveComponentFilename("lockfile-io/SKILL.md")).toBe("lockfile-io.md");
      expect(resolveComponentFilename("artifact-ops/integrity/SKILL.md")).toBe("integrity.md");
      expect(resolveComponentFilename("registry-ops/clients/SKILL.md")).toBe("clients.md");
    });

    test("uses parent directory for generic agent.md files", () => {
      expect(resolveComponentFilename("artifact-ops/agent.md")).toBe("artifact-ops.md");
      expect(resolveComponentFilename("core-ops/agent.md")).toBe("core-ops.md");
    });

    test("keeps generic filename when at root (no parent directory)", () => {
      expect(resolveComponentFilename("SKILL.md")).toBe("SKILL.md");
      expect(resolveComponentFilename("agent.md")).toBe("agent.md");
    });

    test("produces unique names for different skills with same filename", () => {
      const skill1 = resolveComponentFilename("artifact-ops/lockfile-io/SKILL.md");
      const skill2 = resolveComponentFilename("artifact-ops/integrity/SKILL.md");
      const skill3 = resolveComponentFilename("registry-ops/clients/SKILL.md");

      expect(skill1).toBe("lockfile-io.md");
      expect(skill2).toBe("integrity.md");
      expect(skill3).toBe("clients.md");
      expect(new Set([skill1, skill2, skill3]).size).toBe(3);
    });

    test("produces unique names for different agents with same filename", () => {
      const agent1 = resolveComponentFilename("artifact-ops/agent.md");
      const agent2 = resolveComponentFilename("core-ops/agent.md");
      const agent3 = resolveComponentFilename("formatter-ops/agent.md");

      expect(new Set([agent1, agent2, agent3]).size).toBe(3);
    });
  });

  describe("getSafeFilename", () => {
    test("removes @ and replaces / with -", () => {
      const result = getSafeFilename("@grekt/analyzer", "agent.md");
      expect(result).toBe("grekt-analyzer_agent.md");
    });

    test("extracts basename from filepath", () => {
      const result = getSafeFilename("@grekt/analyzer", "skills/analyze.md");
      expect(result).toBe("grekt-analyzer_analyze.md");
    });

    test("handles nested paths", () => {
      const result = getSafeFilename("@scope/name", "deep/nested/file.md");
      expect(result).toBe("scope-name_file.md");
    });

    test("handles unscoped names", () => {
      const result = getSafeFilename("my-artifact", "agent.md");
      expect(result).toBe("my-artifact_agent.md");
    });

    test("disambiguates generic SKILL.md files using parent directory", () => {
      const skill1 = getSafeFilename("@scope/art", "ops/lockfile-io/SKILL.md");
      const skill2 = getSafeFilename("@scope/art", "ops/integrity/SKILL.md");

      expect(skill1).toBe("scope-art_lockfile-io.md");
      expect(skill2).toBe("scope-art_integrity.md");
      expect(skill1).not.toBe(skill2);
    });

    test("disambiguates generic agent.md files using parent directory", () => {
      const agent1 = getSafeFilename("@scope/art", "artifact-ops/agent.md");
      const agent2 = getSafeFilename("@scope/art", "core-ops/agent.md");

      expect(agent1).toBe("scope-art_artifact-ops.md");
      expect(agent2).toBe("scope-art_core-ops.md");
      expect(agent1).not.toBe(agent2);
    });

    test("keeps root-level generic filenames as-is", () => {
      expect(getSafeFilename("@scope/art", "agent.md")).toBe("scope-art_agent.md");
      expect(getSafeFilename("@scope/art", "SKILL.md")).toBe("scope-art_SKILL.md");
    });
  });

  describe("toSafeName", () => {
    test("converts @scope/name to scope-name", () => {
      expect(toSafeName("@grekt/analyzer")).toBe("grekt-analyzer");
    });

    test("handles unscoped names", () => {
      expect(toSafeName("my-artifact")).toBe("my-artifact");
    });
  });

  describe("buildArtifactId", () => {
    test("builds artifact ID from scope and name", () => {
      expect(buildArtifactId("grekt", "analyzer")).toBe("@grekt/analyzer");
    });

    test("handles scope with @ prefix", () => {
      expect(buildArtifactId("@grekt", "analyzer")).toBe("@grekt/analyzer");
    });
  });

  describe("getArtifactIdFromManifest", () => {
    test("extracts scoped name directly", () => {
      const manifest = {
        name: "@grekt/analyzer",
        version: "1.0.0",
        description: "Test",
      } as ArtifactManifest;
      expect(getArtifactIdFromManifest(manifest)).toBe("@grekt/analyzer");
    });

    test("extracts unscoped name directly", () => {
      const manifest = {
        name: "my-tool",
        version: "1.0.0",
        description: "Test",
      } as ArtifactManifest;
      expect(getArtifactIdFromManifest(manifest)).toBe("my-tool");
    });
  });
});
