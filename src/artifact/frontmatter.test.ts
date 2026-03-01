import { describe, test, expect } from "vitest";
import { parseFrontmatter } from "./frontmatter";

describe("frontmatter", () => {
  test("parseFrontmatter extracts YAML from markdown", () => {
    const content = `---
grk-type: agents
grk-name: Test Agent
grk-description: A test agent
---

# Agent content here`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed.frontmatter["grk-type"]).toBe("agents");
      expect(result.parsed.frontmatter["grk-name"]).toBe("Test Agent");
      expect(result.parsed.content).toContain("# Agent content here");
    }
  });

  test("parseFrontmatter validates against schema", () => {
    const content = `---
grk-type: skills
grk-name: Test Skill
grk-description: A test skill
grk-agents: my-agent
---

Skill content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed.frontmatter["grk-type"]).toBe("skills");
      expect(result.parsed.frontmatter["grk-agents"]).toBe("my-agent");
    }
  });

  test("parseFrontmatter returns error for invalid type", () => {
    const content = `---
grk-type: invalid-type
grk-name: Test
grk-description: A test
---

Content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("invalid-frontmatter");
    }
  });

  test("parseFrontmatter returns error for missing required fields", () => {
    const content = `---
grk-type: agents
---

Content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("missing-name");
      expect(result.missingFields).toContain("grk-name");
      expect(result.missingFields).toContain("grk-description");
    }
  });

  test("parseFrontmatter returns error for empty frontmatter", () => {
    const content = `---
---

Content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("no-frontmatter");
    }
  });

  test("parseFrontmatter returns error for no frontmatter", () => {
    const content = `Just some content without frontmatter`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toBe("no-frontmatter");
    }
  });

  test("parseFrontmatter falls back to unprefixed fields", () => {
    const content = `---
type: skills
name: My Skill
description: A skill from another tool
---

Skill content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed.frontmatter["grk-type"]).toBe("skills");
      expect(result.parsed.frontmatter["grk-name"]).toBe("My Skill");
      expect(result.parsed.frontmatter["grk-description"]).toBe("A skill from another tool");
    }
  });

  test("parseFrontmatter prefers grk-prefixed over unprefixed", () => {
    const content = `---
grk-type: agents
grk-name: Grekt Agent
grk-description: The grekt version
type: skills
name: Other Name
description: Other description
---

Content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed.frontmatter["grk-type"]).toBe("agents");
      expect(result.parsed.frontmatter["grk-name"]).toBe("Grekt Agent");
      expect(result.parsed.frontmatter["grk-description"]).toBe("The grekt version");
    }
  });

  test("parseFrontmatter handles partial fallback", () => {
    const content = `---
grk-type: agents
name: Fallback Name
description: Fallback Description
---

Content`;

    const result = parseFrontmatter(content);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.parsed.frontmatter["grk-type"]).toBe("agents");
      expect(result.parsed.frontmatter["grk-name"]).toBe("Fallback Name");
      expect(result.parsed.frontmatter["grk-description"]).toBe("Fallback Description");
    }
  });
});
