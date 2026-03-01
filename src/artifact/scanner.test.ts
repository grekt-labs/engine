import { describe, test, expect } from "vitest";
import { scanArtifact, generateComponents } from "./scanner";
import { createMockFileSystem } from "#/test-utils/mocks";
import { stringify } from "yaml";

describe("scanner", () => {
  describe("scanArtifact", () => {
    test("returns null when no grekt.yaml exists", () => {
      const fs = createMockFileSystem({
        "/artifact/README.md": "# Hello",
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).toBeNull();
    });

    test("returns null when grekt.yaml is invalid", () => {
      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": "invalid: [yaml: content",
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).toBeNull();
    });

    test("returns null when grekt.yaml has invalid schema", () => {
      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify({
          name: "test",
          // Missing required fields: version, description
        }),
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).toBeNull();
    });

    test("parses valid manifest correctly", () => {
      const manifest = {
        name: "@test-scope/test-artifact",
        version: "1.0.0",
        description: "Test description",
      };
      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.manifest.name).toBe("@test-scope/test-artifact");
      expect(result!.manifest.version).toBe("1.0.0");
      expect(result!.manifest.description).toBe("Test description");
    });

    test("parses manifest with optional author", () => {
      const manifest = {
        name: "@scope/artifact",
        author: "John Doe",
        version: "1.0.0",
        description: "Test",
      };
      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.manifest.author).toBe("John Doe");
    });

    test("finds agent file", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const agentContent = `---
grk-type: agents
grk-name: My Agent
grk-description: An agent
---
# Agent content`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/agent.md": agentContent,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(1);
      expect(result!.agents[0].path).toBe("agent.md");
      expect(result!.agents[0].parsed.frontmatter["grk-type"]).toBe("agents");
      expect(result!.agents[0].parsed.frontmatter["grk-name"]).toBe("My Agent");
    });

    test("finds skills in nested directories", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const skill1 = `---
grk-type: skills
grk-name: Skill 1
grk-description: First skill
---
# Skill 1`;
      const skill2 = `---
grk-type: skills
grk-name: Skill 2
grk-description: Second skill
---
# Skill 2`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/skills/skill1.md": skill1,
        "/artifact/skills/advanced/skill2.md": skill2,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.skills).toHaveLength(2);
      expect(result!.skills.some((s) => s.path === "skills/skill1.md")).toBe(true);
      expect(result!.skills.some((s) => s.path === "skills/advanced/skill2.md")).toBe(true);
    });

    test("finds commands", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const command = `---
grk-type: commands
grk-name: My Command
grk-description: A command
---
# Command content`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/commands/cmd.md": command,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.commands).toHaveLength(1);
      expect(result!.commands[0].path).toBe("commands/cmd.md");
      expect(result!.commands[0].parsed.frontmatter["grk-type"]).toBe("commands");
    });

    test("handles invalid frontmatter gracefully and tracks invalid files", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const validSkill = `---
grk-type: skills
grk-name: Valid Skill
grk-description: A valid skill
---
# Valid`;
      const invalidMd = `---
invalid: yaml
but: no type
---
# Invalid frontmatter`;
      const noFrontmatter = `# Just markdown
No frontmatter here`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/valid.md": validSkill,
        "/artifact/invalid.md": invalidMd,
        "/artifact/plain.md": noFrontmatter,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.skills).toHaveLength(1);
      expect(result!.skills[0].path).toBe("valid.md");

      expect(result!.invalidFiles).toHaveLength(2);
      const invalidPaths = result!.invalidFiles.map((f) => f.path);
      expect(invalidPaths).toContain("invalid.md");
      expect(invalidPaths).toContain("plain.md");
    });

    test("returns empty arrays when no components found", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/README.md": "# Just a readme",
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.agent).toBeUndefined();
      expect(result!.skills).toHaveLength(0);
      expect(result!.commands).toHaveLength(0);
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].reason).toBe("no-frontmatter");
    });

    test("tracks missing fields in invalid files", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const missingName = `---
grk-type: skill
grk-description: Missing name
---
# Content`;
      const missingDesc = `---
grk-type: agents
grk-name: Has name
---
# Content`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/no-name.md": missingName,
        "/artifact/no-desc.md": missingDesc,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.invalidFiles).toHaveLength(2);

      const noName = result!.invalidFiles.find((f) => f.path === "no-name.md");
      expect(noName).toBeDefined();
      expect(noName!.reason).toBe("missing-name");
      expect(noName!.missingFields).toContain("grk-name");

      const noDesc = result!.invalidFiles.find((f) => f.path === "no-desc.md");
      expect(noDesc).toBeDefined();
      expect(noDesc!.reason).toBe("missing-description");
      expect(noDesc!.missingFields).toContain("grk-description");
    });

    test("finds hook JSON file", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const hookJson = JSON.stringify({
        "grk-type": "hooks",
        "grk-name": "format-on-save",
        "grk-description": "Auto-format files after edit",
        target: "claude",
        hooks: {
          PostToolUse: [
            {
              matcher: "Edit|Write",
              hooks: [{ type: "command", command: "./format.sh" }],
            },
          ],
        },
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/format-on-save.json": hookJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(1);
      expect(result!.hooks[0].path).toBe("hooks/format-on-save.json");
      expect(result!.hooks[0].parsed.frontmatter["grk-type"]).toBe("hooks");
      expect(result!.hooks[0].parsed.frontmatter["grk-name"]).toBe("format-on-save");
    });

    test("parses hook JSON content without grk-* metadata fields", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const hookJson = JSON.stringify({
        "grk-type": "hooks",
        "grk-name": "lint-hook",
        "grk-description": "Run linter on save",
        target: "claude",
        hooks: { PostToolUse: [] },
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/lint.json": hookJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(1);

      const content = result!.hooks[0].parsed.content as Record<string, unknown>;
      expect(content.target).toBe("claude");
      expect(content.hooks).toBeDefined();
      // grk-* fields should be stripped from content
      expect(content["grk-type"]).toBeUndefined();
      expect(content["grk-name"]).toBeUndefined();
      expect(content["grk-description"]).toBeUndefined();
    });

    test("ignores hook type in MD file (hooks are JSON-only)", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const hookMd = `---
grk-type: hooks
grk-name: Bad Hook
grk-description: Hooks cannot be markdown
---
# This should be ignored`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/bad.md": hookMd,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(0);
    });

    // --- JSON unprefixed field fallback ---

    test("parses JSON with unprefixed fields (name, type, description)", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const mcpJson = JSON.stringify({
        type: "mcps",
        name: "my-mcp-server",
        description: "An MCP server",
        url: "https://example.com/mcp",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/mcps/server.json": mcpJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.mcps).toHaveLength(1);
      expect(result!.mcps[0].parsed.frontmatter["grk-type"]).toBe("mcps");
      expect(result!.mcps[0].parsed.frontmatter["grk-name"]).toBe("my-mcp-server");
      expect(result!.mcps[0].parsed.frontmatter["grk-description"]).toBe("An MCP server");
    });

    test("prefixed grk-* fields take priority over unprefixed when both present", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const hookJson = JSON.stringify({
        "grk-type": "hooks",
        "grk-name": "prefixed-name",
        "grk-description": "prefixed-desc",
        type: "mcps",
        name: "unprefixed-name",
        description: "unprefixed-desc",
        target: "claude",
        hooks: {},
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/hook.json": hookJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(1);
      // Prefixed wins
      expect(result!.hooks[0].parsed.frontmatter["grk-name"]).toBe("prefixed-name");
      expect(result!.hooks[0].parsed.frontmatter["grk-description"]).toBe("prefixed-desc");
      expect(result!.hooks[0].parsed.frontmatter["grk-type"]).toBe("hooks");
    });

    test("unprefixed fields still fail if value is empty string", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const json = JSON.stringify({
        type: "hooks",
        name: "",
        description: "Has desc but empty name",
        target: "claude",
        hooks: {},
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/bad.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(0);
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].reason).toBe("missing-name");
    });

    test("mixed: some fields prefixed, some unprefixed", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const json = JSON.stringify({
        "grk-type": "mcps",
        name: "server-from-unprefixed",
        "grk-description": "desc-from-prefixed",
        url: "https://example.com",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/mcps/mixed.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.mcps).toHaveLength(1);
      expect(result!.mcps[0].parsed.frontmatter["grk-type"]).toBe("mcps");
      expect(result!.mcps[0].parsed.frontmatter["grk-name"]).toBe("server-from-unprefixed");
      expect(result!.mcps[0].parsed.frontmatter["grk-description"]).toBe("desc-from-prefixed");
    });

    test("unprefixed type with invalid category still fails validation", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const json = JSON.stringify({
        type: "banana",
        name: "bad-type",
        description: "Invalid category via unprefixed",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/data/bad.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].reason).toBe("missing-type");
      expect(result!.invalidFiles[0].details).toContain("banana");
    });

    test("unprefixed type valid as category but invalid for JSON format fails", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      // "agents" is a valid category but not allowed for JSON files
      const json = JSON.stringify({
        type: "agents",
        name: "should-fail",
        description: "Agents are MD-only",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/data/agent.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(0);
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].reason).toBe("invalid-type-for-format");
    });

    test("unprefixed fields are stripped from parsed content", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const json = JSON.stringify({
        type: "mcps",
        name: "stripped-test",
        description: "Should be in frontmatter not content",
        url: "https://example.com",
        customField: "should-remain",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/mcps/strip.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.mcps).toHaveLength(1);

      const content = result!.mcps[0].parsed.content as Record<string, unknown>;
      // Both grk-* and unprefixed metadata are stripped from content
      expect(content["grk-type"]).toBeUndefined();
      expect(content["grk-name"]).toBeUndefined();
      expect(content["grk-description"]).toBeUndefined();
      expect(content["type"]).toBeUndefined();
      expect(content["name"]).toBeUndefined();
      expect(content["description"]).toBeUndefined();
      // Domain fields remain
      expect(content.url).toBe("https://example.com");
      expect(content.customField).toBe("should-remain");
    });

    test("prefixed JSON also strips unprefixed equivalents if they happen to exist", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const hookJson = JSON.stringify({
        "grk-type": "hooks",
        "grk-name": "real-name",
        "grk-description": "real-desc",
        name: "collision-name",
        description: "collision-desc",
        target: "claude",
        hooks: {},
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/hooks/collision.json": hookJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.hooks).toHaveLength(1);

      const content = result!.hooks[0].parsed.content as Record<string, unknown>;
      // Even when grk-* was used, unprefixed should not leak into content
      expect(content["name"]).toBeUndefined();
      expect(content["description"]).toBeUndefined();
      expect(content["type"]).toBeUndefined();
      // Actual content remains
      expect(content.target).toBe("claude");
    });

    test("JSON with no fields at all still reports all missing", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const json = JSON.stringify({
        url: "https://example.com",
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/data/empty.json": json,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].reason).toBe("missing-type");
      expect(result!.invalidFiles[0].missingFields).toContain("grk-type");
      expect(result!.invalidFiles[0].missingFields).toContain("grk-name");
      expect(result!.invalidFiles[0].missingFields).toContain("grk-description");
    });

    test("finds hooks alongside other component types", () => {
      const manifest = {
        name: "@scope/mixed",
        version: "1.0.0",
        description: "Mixed artifact",
      };
      const agent = `---
grk-type: agents
grk-name: My Agent
grk-description: An agent
---
# Agent`;
      const hookJson = JSON.stringify({
        "grk-type": "hooks",
        "grk-name": "my-hook",
        "grk-description": "A hook",
        target: "claude",
        events: {},
      });

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/agent.md": agent,
        "/artifact/hooks/hook.json": hookJson,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(1);
      expect(result!.hooks).toHaveLength(1);
    });

    test("handles complete artifact structure", () => {
      const manifest = {
        name: "@grekt/complete-artifact",
        version: "2.0.0",
        description: "A complete artifact",
      };
      const agent = `---
grk-type: agents
grk-name: Main Agent
grk-description: The main agent
---
# Main Agent`;
      const skill1 = `---
grk-type: skills
grk-name: Skill A
grk-description: First skill
grk-agents: Main Agent
---
# Skill A`;
      const skill2 = `---
grk-type: skills
grk-name: Skill B
grk-description: Second skill
grk-agents: Main Agent
---
# Skill B`;
      const command = `---
grk-type: commands
grk-name: My Command
grk-description: A command
---
# Command`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/agent.md": agent,
        "/artifact/skills/skill-a.md": skill1,
        "/artifact/skills/skill-b.md": skill2,
        "/artifact/commands/cmd.md": command,
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.manifest.name).toBe("@grekt/complete-artifact");
      expect(result!.agents).toHaveLength(1);
      expect(result!.agents[0].parsed.frontmatter["grk-name"]).toBe("Main Agent");
      expect(result!.skills).toHaveLength(2);
      expect(result!.commands).toHaveLength(1);
    });

    test("handles invalid JSON file content", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/data/broken.json": "{ not valid json",
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.invalidFiles).toHaveLength(1);
      expect(result!.invalidFiles[0].path).toBe("data/broken.json");
      expect(result!.invalidFiles[0].reason).toBe("invalid-json");
    });

    test("ignores package.json files", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/package.json": JSON.stringify({ name: "pkg", version: "1.0.0" }),
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.invalidFiles).toHaveLength(0);
    });

    test("handles artifact with only manifest and no other files", () => {
      const manifest = {
        name: "@scope/empty",
        version: "1.0.0",
        description: "Empty artifact",
      };

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
      });

      const result = scanArtifact(fs, "/artifact");

      expect(result).not.toBeNull();
      expect(result!.agents).toHaveLength(0);
      expect(result!.skills).toHaveLength(0);
      expect(result!.commands).toHaveLength(0);
      expect(result!.hooks).toHaveLength(0);
      expect(result!.invalidFiles).toHaveLength(0);
    });
  });

  describe("generateComponents", () => {
    test("returns undefined when no components found", () => {
      const manifest = {
        name: "@scope/empty",
        version: "1.0.0",
        description: "desc",
      };
      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
      });

      const info = scanArtifact(fs, "/artifact");
      const components = generateComponents(info!);

      expect(components).toBeUndefined();
    });

    test("generates components summary from scanned files", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const agent = `---
grk-type: agents
grk-name: My Agent
grk-description: An agent
---
# Agent`;
      const skill = `---
grk-type: skills
grk-name: My Skill
grk-description: A skill
---
# Skill`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/agent.md": agent,
        "/artifact/skills/skill.md": skill,
      });

      const info = scanArtifact(fs, "/artifact");
      const components = generateComponents(info!);

      expect(components).toBeDefined();
      expect(components!.agents).toHaveLength(1);
      expect(components!.agents![0].name).toBe("My Agent");
      expect(components!.agents![0].file).toBe("agent.md");
      expect(components!.agents![0].description).toBe("An agent");
      expect(components!.skills).toHaveLength(1);
      expect(components!.skills![0].name).toBe("My Skill");
    });

    test("only includes categories that have files", () => {
      const manifest = {
        name: "@scope/test",
        version: "1.0.0",
        description: "desc",
      };
      const skill = `---
grk-type: skills
grk-name: Only Skill
grk-description: The only component
---
# Content`;

      const fs = createMockFileSystem({
        "/artifact/grekt.yaml": stringify(manifest),
        "/artifact/skills/only.md": skill,
      });

      const info = scanArtifact(fs, "/artifact");
      const components = generateComponents(info!);

      expect(components).toBeDefined();
      expect(components!.skills).toHaveLength(1);
      expect(components!.agents).toBeUndefined();
      expect(components!.commands).toBeUndefined();
    });
  });
});
