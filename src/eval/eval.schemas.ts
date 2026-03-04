import { z } from "zod";

export const EvalAssertionSchema = z.object({
  type: z.string(),
  value: z.union([z.string(), z.array(z.string())]).optional(),
  threshold: z.number().optional(),
  weight: z.number().optional(),
});

export const EvalTestCaseSchema = z.object({
  description: z.string().optional(),
  vars: z.record(z.string(), z.string()),
  assert: z.array(EvalAssertionSchema).min(1, "At least one assertion is required"),
});

export const EvalFileConfigSchema = z.object({
  provider: z.string().optional(),
  tests: z.array(EvalTestCaseSchema).min(1, "At least one test case is required"),
});
