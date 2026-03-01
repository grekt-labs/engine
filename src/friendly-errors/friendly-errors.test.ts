import { describe, test, expect } from "vitest";
import { z } from "zod";
import { safeParseYaml } from "./friendly-errors";

const SimpleSchema = z.object({
  name: z.string(),
  version: z.string(),
});

const SchemaWithDefaults = z.object({
  name: z.string(),
  count: z.number().default(0),
  tags: z.array(z.string()).default([]),
});

describe("safeParseYaml", () => {
  describe("valid YAML + valid schema", () => {
    test("returns success with parsed data", () => {
      const result = safeParseYaml("name: test\nversion: 1.0.0", SimpleSchema);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("test");
        expect(result.data.version).toBe("1.0.0");
      }
    });

    test("applies Zod defaults for missing optional fields", () => {
      const result = safeParseYaml("name: test", SchemaWithDefaults);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.count).toBe(0);
        expect(result.data.tags).toEqual([]);
      }
    });
  });

  describe("invalid YAML syntax", () => {
    test("returns yaml error for broken YAML", () => {
      const result = safeParseYaml("name: [invalid: yaml", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("yaml");
        expect(result.error.message).toContain("Invalid YAML syntax");
        expect(result.error.details).toBeDefined();
        expect(result.error.details!.length).toBeGreaterThan(0);
      }
    });

    test("includes filepath in yaml error message", () => {
      const result = safeParseYaml("invalid: [yaml", SimpleSchema, "grekt.yaml");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("grekt.yaml");
      }
    });

    test("extracts first line of YAML error for details", () => {
      const result = safeParseYaml("key: [broken: yaml\n  nested: bad", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.details![0]).not.toContain("\n");
      }
    });
  });

  describe("valid YAML but invalid schema", () => {
    test("returns validation error for missing required fields", () => {
      const result = safeParseYaml("name: test", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
        expect(result.error.message).toContain("Invalid configuration");
        expect(result.error.details).toBeDefined();
        expect(result.error.details!.some((d) => d.includes("version"))).toBe(true);
      }
    });

    test("returns validation error for wrong type", () => {
      const result = safeParseYaml("name: 123\nversion: true", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("includes filepath in validation error message", () => {
      const result = safeParseYaml("invalid: true", SimpleSchema, "/path/to/config.yaml");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("/path/to/config.yaml");
      }
    });

    test("formats nested path in Zod issues", () => {
      const NestedSchema = z.object({
        outer: z.object({
          inner: z.string(),
        }),
      });

      const result = safeParseYaml("outer:\n  inner: 123", NestedSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.details!.some((d) => d.includes("outer.inner"))).toBe(true);
      }
    });
  });

  describe("edge cases", () => {
    test("returns validation error for empty string (YAML parses to null)", () => {
      const result = safeParseYaml("", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("returns validation error for whitespace-only content", () => {
      const result = safeParseYaml("   \n  \n  ", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("returns validation error for plain string YAML", () => {
      const result = safeParseYaml("just a string", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
      }
    });

    test("omits filepath context when not provided", () => {
      const result = safeParseYaml("invalid: [yaml", SimpleSchema);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Invalid YAML syntax");
      }
    });
  });
});
