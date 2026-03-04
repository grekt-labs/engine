import { describe, test, expect } from "vitest";
import { discoverEvals } from "./eval.discovery";
import { createMockFileSystem } from "#/test-utils/mocks";
import { stringify } from "yaml";

const VALID_SKILL_MD = `---
grk-type: skills
name: tone-checker
description: Checks tone of responses
---
You are a tone checker. Always be empathetic.`;

const VALID_AGENT_MD = `---
grk-type: agents
name: support-agent
description: Customer support agent
---
You are a support agent. Be helpful and kind.`;

const VALID_COMMAND_MD = `---
grk-type: commands
name: summarize
description: Summarizes text
---
Summarize the given text concisely.`;

const VALID_EVAL_YAML = stringify({
  tests: [
    {
      description: "handles angry customer",
      vars: { input: "Your product sucks" },
      assert: [{ type: "contains", value: "understand" }],
    },
  ],
});

const EVAL_WITH_PROVIDER = stringify({
  provider: "openai:gpt-4.1-mini",
  tests: [
    {
      vars: { input: "test" },
      assert: [{ type: "contains", value: "ok" }],
    },
  ],
});

describe("eval discovery", () => {
  describe("discoverEvals", () => {
    // --- Error paths first ---

    test("returns empty when artifact directory has no files", () => {
      const fs = createMockFileSystem({});

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test("returns empty when no .eval.yaml files exist", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    test("warns when .eval.yaml has no matching .md sibling", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/orphan.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("no matching .md file");
      expect(result.warnings[0].message).toContain("orphan.eval.yaml");
    });

    test("warns when .eval.yaml is next to a non-evaluable type (mcp is json-only)", () => {
      const mcpJson = JSON.stringify({
        "grk-type": "mcps",
        "grk-name": "my-mcp",
        "grk-description": "An MCP server",
        url: "https://example.com",
      });
      const fs = createMockFileSystem({
        "/artifact/mcps/my-mcp.json": mcpJson,
        "/artifact/mcps/my-mcp.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("no matching .md file");
    });

    test("warns when .eval.yaml is next to a rule (not evaluable)", () => {
      const ruleMd = `---
grk-type: rules
name: my-rule
description: A rule
---
Always use TypeScript.`;
      const fs = createMockFileSystem({
        "/artifact/rules/my-rule.md": ruleMd,
        "/artifact/rules/my-rule.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("not evaluable");
      expect(result.warnings[0].message).toContain("only agents, skills, commands");
    });

    test("warns when .eval.yaml is next to a hook (not evaluable)", () => {
      const hookMd = `---
grk-type: hooks
name: my-hook
description: A hook
---
Hook content.`;
      const fs = createMockFileSystem({
        "/artifact/hooks/my-hook.md": hookMd,
        "/artifact/hooks/my-hook.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("not evaluable");
    });

    test("warns on invalid YAML syntax in .eval.yaml", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": "invalid: [yaml: broken",
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].evalFilePath).toBe("skills/tone-checker.eval.yaml");
      expect(result.warnings[0].message).toContain("Skipped");
    });

    test("warns on .eval.yaml that fails schema validation (empty tests)", () => {
      const invalidEval = stringify({ tests: [] });
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": invalidEval,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("Skipped");
    });

    test("warns when sibling .md has no frontmatter", () => {
      const badMd = `# No frontmatter here`;
      const fs = createMockFileSystem({
        "/artifact/skills/bad.md": badMd,
        "/artifact/skills/bad.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(0);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0].message).toContain("invalid or missing frontmatter");
    });

    // --- Happy paths ---

    test("discovers eval for a valid skill", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(1);
      expect(result.warnings).toHaveLength(0);

      const discovered = result.evals[0];
      expect(discovered.artifactId).toBe("@acme/support");
      expect(discovered.elementName).toBe("tone-checker");
      expect(discovered.elementType).toBe("skills");
      expect(discovered.elementPath).toBe("skills/tone-checker.md");
      expect(discovered.systemPrompt).toBe("You are a tone checker. Always be empathetic.");
      expect(discovered.evalConfig.tests).toHaveLength(1);
      expect(discovered.evalFilePath).toBe("skills/tone-checker.eval.yaml");
    });

    test("discovers eval for a valid agent", () => {
      const fs = createMockFileSystem({
        "/artifact/agents/support-agent.md": VALID_AGENT_MD,
        "/artifact/agents/support-agent.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementType).toBe("agents");
      expect(result.evals[0].elementName).toBe("support-agent");
    });

    test("discovers eval for a valid command", () => {
      const fs = createMockFileSystem({
        "/artifact/commands/summarize.md": VALID_COMMAND_MD,
        "/artifact/commands/summarize.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementType).toBe("commands");
    });

    test("discovers multiple evals across categories", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
        "/artifact/agents/support-agent.md": VALID_AGENT_MD,
        "/artifact/agents/support-agent.eval.yaml": VALID_EVAL_YAML,
        "/artifact/commands/summarize.md": VALID_COMMAND_MD,
        "/artifact/commands/summarize.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(3);
    });

    test("preserves provider override from eval.yaml", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": EVAL_WITH_PROVIDER,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals[0].evalConfig.provider).toBe("openai:gpt-4.1-mini");
    });

    test("discovers evals in nested directories", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/advanced/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/advanced/tone-checker.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementPath).toBe("skills/advanced/tone-checker.md");
      expect(result.evals[0].evalFilePath).toBe("skills/advanced/tone-checker.eval.yaml");
    });

    test("ignores .md files without .eval.yaml (no false positives)", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/other-skill.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, { artifactDir: "/artifact", artifactId: "@acme/support" });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementName).toBe("tone-checker");
    });

    // --- Filtering ---

    test("filters by element name", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
        "/artifact/agents/support-agent.md": VALID_AGENT_MD,
        "/artifact/agents/support-agent.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, {
        artifactDir: "/artifact",
        artifactId: "@acme/support",
        filter: { elementName: "tone-checker" },
      });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementName).toBe("tone-checker");
    });

    test("filters by element type", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
        "/artifact/agents/support-agent.md": VALID_AGENT_MD,
        "/artifact/agents/support-agent.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, {
        artifactDir: "/artifact",
        artifactId: "@acme/support",
        filter: { elementType: "agents" },
      });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementType).toBe("agents");
    });

    test("filters by both name and type", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
        "/artifact/agents/support-agent.md": VALID_AGENT_MD,
        "/artifact/agents/support-agent.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, {
        artifactDir: "/artifact",
        artifactId: "@acme/support",
        filter: { elementName: "tone-checker", elementType: "skills" },
      });

      expect(result.evals).toHaveLength(1);
      expect(result.evals[0].elementName).toBe("tone-checker");
    });

    test("returns empty when filter matches nothing", () => {
      const fs = createMockFileSystem({
        "/artifact/skills/tone-checker.md": VALID_SKILL_MD,
        "/artifact/skills/tone-checker.eval.yaml": VALID_EVAL_YAML,
      });

      const result = discoverEvals(fs, {
        artifactDir: "/artifact",
        artifactId: "@acme/support",
        filter: { elementName: "nonexistent" },
      });

      expect(result.evals).toHaveLength(0);
    });
  });
});
