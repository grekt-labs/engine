import type { Category } from "#/categories";

// --- Eval Engine Interface (adapter pattern, engine-agnostic) ---

// Config passed to the eval engine for a single element run
export interface EvalRunConfig {
  systemPrompt: string;
  tests: EvalTestCase[];
  provider: string;
}

// Raw result from the eval engine (before grekt scoring/grading)
export interface EvalRunResult {
  passed: number;
  total: number;
  failures: EvalTestFailure[];
}

// Eval engine abstraction — implement this for promptfoo, braintrust, custom, etc.
export interface EvalEngine {
  name: string;
  isAvailable(): boolean;
  ensureAvailable(): Promise<boolean>;
  run(config: EvalRunConfig): Promise<EvalRunResult>;
  openReport?(): void;
}

// --- Eval file format (engine-agnostic) ---

// Assertion in an eval test case — type is string passthrough (engine defines available types)
export interface EvalAssertion {
  type: string;
  value?: string | string[];
  threshold?: number;
  weight?: number;
}

// Single test case in an eval file
export interface EvalTestCase {
  description?: string;
  vars: Record<string, string>;
  assert: EvalAssertion[];
}

// Parsed .eval.yaml file config
export interface EvalFileConfig {
  provider?: string;
  tests: EvalTestCase[];
}

// Evaluable categories — only elements with system prompts
export const EVALUABLE_CATEGORIES: readonly Category[] = ["agents", "skills", "commands"] as const;

// Discovered eval: pairs an eval config with its element's metadata
export interface DiscoveredEval {
  artifactId: string;
  elementName: string;
  elementType: Category;
  elementPath: string;
  systemPrompt: string;
  evalConfig: EvalFileConfig;
  evalFilePath: string;
}

// Grade scale: A (95-100), B (80-94), C (65-79), D (50-64), F (0-49)
export type EvalGrade = "A" | "B" | "C" | "D" | "F";

// Single test failure info
export interface EvalTestFailure {
  testDescription: string;
  assertionType: string;
  expected: string;
  actual: string;
}

// Result for a single element's eval run
export interface EvalElementResult {
  artifactId: string;
  elementName: string;
  elementType: Category;
  passed: number;
  total: number;
  score: number;
  grade: EvalGrade;
  failures: EvalTestFailure[];
}

// Aggregated summary across all evals
export interface EvalSummary {
  results: EvalElementResult[];
  overallScore: number;
  overallGrade: EvalGrade;
  totalPassed: number;
  totalTests: number;
  totalIssues: number;
}

// Filter options for discovery
export interface EvalFilter {
  elementName?: string;
  elementType?: Category;
}

// Warning during discovery (non-fatal issues)
export interface EvalDiscoveryWarning {
  evalFilePath: string;
  message: string;
}

// Discovery result
export interface EvalDiscoveryResult {
  evals: DiscoveredEval[];
  warnings: EvalDiscoveryWarning[];
}
