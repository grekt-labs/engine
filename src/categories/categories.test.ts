import { describe, test, expect } from "bun:test";
import {
  CATEGORIES,
  CATEGORY_CONFIG,
  isValidCategory,
  getCategoriesForFormat,
  getSingular,
  getDefaultPath,
  createCategoryRecord,
} from "./categories";

describe("categories", () => {
  describe("CATEGORIES", () => {
    test("contains all expected categories", () => {
      expect(CATEGORIES).toContain("agents");
      expect(CATEGORIES).toContain("skills");
      expect(CATEGORIES).toContain("commands");
      expect(CATEGORIES).toContain("mcps");
      expect(CATEGORIES).toContain("rules");
      expect(CATEGORIES).toContain("hooks");
    });

    test("all categories are plural", () => {
      for (const cat of CATEGORIES) {
        expect(cat.endsWith("s")).toBe(true);
      }
    });
  });

  describe("CATEGORY_CONFIG", () => {
    test("every category has a config entry", () => {
      for (const cat of CATEGORIES) {
        expect(CATEGORY_CONFIG[cat]).toBeDefined();
        expect(CATEGORY_CONFIG[cat].singular).toBeDefined();
        expect(CATEGORY_CONFIG[cat].defaultPath).toBeDefined();
        expect(CATEGORY_CONFIG[cat].allowedFormats.length).toBeGreaterThan(0);
      }
    });

    test("md-only categories include agents, skills, commands, rules", () => {
      const mdOnly = CATEGORIES.filter(
        (cat) =>
          CATEGORY_CONFIG[cat].allowedFormats.length === 1 &&
          CATEGORY_CONFIG[cat].allowedFormats[0] === "md"
      );
      expect(mdOnly).toContain("agents");
      expect(mdOnly).toContain("skills");
      expect(mdOnly).toContain("commands");
      expect(mdOnly).toContain("rules");
    });

    test("json-only categories include mcps, hooks", () => {
      const jsonOnly = CATEGORIES.filter(
        (cat) =>
          CATEGORY_CONFIG[cat].allowedFormats.length === 1 &&
          CATEGORY_CONFIG[cat].allowedFormats[0] === "json"
      );
      expect(jsonOnly).toContain("mcps");
      expect(jsonOnly).toContain("hooks");
    });
  });

  describe("isValidCategory", () => {
    test("returns true for valid categories", () => {
      for (const cat of CATEGORIES) {
        expect(isValidCategory(cat)).toBe(true);
      }
    });

    test("returns false for invalid string", () => {
      expect(isValidCategory("banana")).toBe(false);
    });

    test("returns false for singular form", () => {
      expect(isValidCategory("agent")).toBe(false);
    });

    test("returns false for empty string", () => {
      expect(isValidCategory("")).toBe(false);
    });
  });

  describe("getCategoriesForFormat", () => {
    test("returns md categories", () => {
      const mdCategories = getCategoriesForFormat("md");

      expect(mdCategories).toContain("agents");
      expect(mdCategories).toContain("skills");
      expect(mdCategories).not.toContain("mcps");
      expect(mdCategories).not.toContain("hooks");
    });

    test("returns json categories", () => {
      const jsonCategories = getCategoriesForFormat("json");

      expect(jsonCategories).toContain("mcps");
      expect(jsonCategories).toContain("hooks");
      expect(jsonCategories).not.toContain("agents");
      expect(jsonCategories).not.toContain("skills");
    });
  });

  describe("getSingular", () => {
    test("returns singular form for each category", () => {
      expect(getSingular("agents")).toBe("agent");
      expect(getSingular("skills")).toBe("skill");
      expect(getSingular("mcps")).toBe("mcp");
      expect(getSingular("hooks")).toBe("hook");
    });
  });

  describe("getDefaultPath", () => {
    test("returns default path for each category", () => {
      expect(getDefaultPath("agents")).toBe("agents");
      expect(getDefaultPath("mcps")).toBe("mcps");
    });
  });

  describe("createCategoryRecord", () => {
    test("creates record with all categories as keys", () => {
      const record = createCategoryRecord(() => []);

      for (const cat of CATEGORIES) {
        expect(record[cat]).toBeDefined();
      }
    });

    test("calls factory for each category independently", () => {
      const record = createCategoryRecord<string[]>(() => []);

      record.agents.push("test");

      expect(record.agents).toEqual(["test"]);
      expect(record.skills).toEqual([]);
    });

    test("supports different value types", () => {
      const numRecord = createCategoryRecord(() => 0);
      const boolRecord = createCategoryRecord(() => false);

      expect(numRecord.agents).toBe(0);
      expect(boolRecord.agents).toBe(false);
    });
  });
});
