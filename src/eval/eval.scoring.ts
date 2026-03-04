import type { EvalElementResult, EvalGrade, EvalSummary } from "./eval.types";

export function calculateScore(passed: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((passed / total) * 100);
}

export function scoreToGrade(score: number): EvalGrade {
  if (score >= 95) return "A";
  if (score >= 80) return "B";
  if (score >= 65) return "C";
  if (score >= 50) return "D";
  return "F";
}

export function summarizeResults(results: EvalElementResult[]): EvalSummary {
  if (results.length === 0) {
    return {
      results: [],
      overallScore: 0,
      overallGrade: "F",
      totalPassed: 0,
      totalTests: 0,
      totalIssues: 0,
    };
  }

  const totalPassed = results.reduce((sum, r) => sum + r.passed, 0);
  const totalTests = results.reduce((sum, r) => sum + r.total, 0);
  const totalIssues = results.reduce((sum, r) => sum + r.failures.length, 0);

  // Weighted average: each element's score weighted by its test count
  const weightedSum = results.reduce((sum, r) => sum + r.score * r.total, 0);
  const overallScore = totalTests > 0 ? Math.round(weightedSum / totalTests) : 0;
  const overallGrade = scoreToGrade(overallScore);

  return {
    results,
    overallScore,
    overallGrade,
    totalPassed,
    totalTests,
    totalIssues,
  };
}
