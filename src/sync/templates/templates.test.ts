import { describe, test, expect } from "vitest";
import { getSkillRouterTemplate } from "./index";

describe("templates", () => {
  describe("getSkillRouterTemplate", () => {
    test("returns the skill router markdown content", () => {
      const template = getSkillRouterTemplate();

      expect(template).toBeTypeOf("string");
      expect(template.length).toBeGreaterThan(0);
    });

    test("contains the expected sections", () => {
      const template = getSkillRouterTemplate();

      expect(template).toContain("# Grekt Skill Loader");
      expect(template).toContain("## Direct mode:");
      expect(template).toContain("## Search mode:");
      expect(template).toContain("## Remote fallback");
      expect(template).toContain("## Rules");
    });

    test("does not contain frontmatter", () => {
      const template = getSkillRouterTemplate();

      expect(template).not.toMatch(/^---/);
    });
  });
});
