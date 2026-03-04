import { describe, test, expect } from "vitest";
import { safeParseYaml } from "#/friendly-errors";
import { EvalFileConfigSchema } from "./eval.schemas";

describe("eval schemas", () => {
  describe("EvalFileConfigSchema", () => {
    // --- Error paths first ---

    test("rejects missing tests array", () => {
      const result = EvalFileConfigSchema.safeParse({});

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain("tests");
      }
    });

    test("rejects empty tests array", () => {
      const result = EvalFileConfigSchema.safeParse({ tests: [] });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("At least one test case");
      }
    });

    test("rejects test case missing vars", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ assert: [{ type: "contains", value: "hello" }] }],
      });

      expect(result.success).toBe(false);
    });

    test("rejects test case missing assert", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" } }],
      });

      expect(result.success).toBe(false);
    });

    test("rejects empty assert array", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" }, assert: [] }],
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("At least one assertion");
      }
    });

    test("rejects assertion missing type", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" }, assert: [{ value: "hello" }] }],
      });

      expect(result.success).toBe(false);
    });

    // --- safeParseYaml integration (friendly errors) ---

    test("produces friendly error via safeParseYaml for invalid YAML", () => {
      const result = safeParseYaml("invalid: [yaml: broken", EvalFileConfigSchema, "test.eval.yaml");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("yaml");
        expect(result.error.message).toContain("test.eval.yaml");
      }
    });

    test("produces friendly error via safeParseYaml for schema violation", () => {
      const result = safeParseYaml("tests: []", EvalFileConfigSchema, "test.eval.yaml");

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.type).toBe("validation");
        expect(result.error.details).toBeDefined();
        expect(result.error.details!.length).toBeGreaterThan(0);
      }
    });

    // --- Boundary cases ---

    test("allows provider as any string (not validated here)", () => {
      const result = EvalFileConfigSchema.safeParse({
        provider: "anything-goes:model-123",
        tests: [{ vars: { input: "test" }, assert: [{ type: "contains", value: "ok" }] }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.provider).toBe("anything-goes:model-123");
      }
    });

    test("strips unknown top-level fields", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" }, assert: [{ type: "contains", value: "ok" }] }],
        unknownField: "should be stripped",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result.data as Record<string, unknown>)["unknownField"]).toBeUndefined();
      }
    });

    // --- Happy paths ---

    test("parses minimal valid config", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "hello" }, assert: [{ type: "contains", value: "hi" }] }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tests).toHaveLength(1);
        expect(result.data.tests[0].vars.input).toBe("hello");
        expect(result.data.tests[0].assert[0].type).toBe("contains");
        expect(result.data.provider).toBeUndefined();
      }
    });

    test("parses full config with all assertion fields", () => {
      const result = EvalFileConfigSchema.safeParse({
        provider: "openai:gpt-4.1-mini",
        tests: [
          {
            description: "handles angry customer",
            vars: { input: "Your product sucks" },
            assert: [
              { type: "contains-any", value: ["understand", "hear you"] },
              { type: "not-icontains", value: "sorry you feel" },
              { type: "llm-rubric", value: "empathetic, offers concrete solution" },
              { type: "similar", value: "I understand your frustration", threshold: 0.8 },
              { type: "cost", threshold: 0.01, weight: 2 },
            ],
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.provider).toBe("openai:gpt-4.1-mini");
        expect(result.data.tests[0].description).toBe("handles angry customer");
        expect(result.data.tests[0].assert).toHaveLength(5);
        expect(result.data.tests[0].assert[3].threshold).toBe(0.8);
        expect(result.data.tests[0].assert[4].weight).toBe(2);
      }
    });

    test("parses multiple test cases", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [
          { vars: { input: "case 1" }, assert: [{ type: "contains", value: "a" }] },
          { vars: { input: "case 2" }, assert: [{ type: "contains", value: "b" }] },
          { vars: { input: "case 3" }, assert: [{ type: "contains", value: "c" }] },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tests).toHaveLength(3);
      }
    });

    test("allows assertion with only type (no value)", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" }, assert: [{ type: "is-json" }] }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tests[0].assert[0].type).toBe("is-json");
        expect(result.data.tests[0].assert[0].value).toBeUndefined();
      }
    });

    test("allows test case without description", () => {
      const result = EvalFileConfigSchema.safeParse({
        tests: [{ vars: { input: "test" }, assert: [{ type: "contains", value: "ok" }] }],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.tests[0].description).toBeUndefined();
      }
    });
  });
});
