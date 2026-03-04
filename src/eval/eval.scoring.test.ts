import { describe, test, expect } from "vitest";
import { calculateScore, scoreToGrade, summarizeResults } from "./eval.scoring";
import type { EvalElementResult } from "./eval.types";

describe("eval scoring", () => {
  describe("calculateScore", () => {
    test("returns 0 when total is 0 (no division by zero)", () => {
      expect(calculateScore(0, 0)).toBe(0);
    });

    test("returns 0 when none passed", () => {
      expect(calculateScore(0, 3)).toBe(0);
    });

    test("returns 100 when all passed", () => {
      expect(calculateScore(3, 3)).toBe(100);
    });

    test("returns 67 for 2/3", () => {
      expect(calculateScore(2, 3)).toBe(67);
    });

    test("returns 50 for 1/2", () => {
      expect(calculateScore(1, 2)).toBe(50);
    });

    test("returns 33 for 1/3", () => {
      expect(calculateScore(1, 3)).toBe(33);
    });
  });

  describe("scoreToGrade", () => {
    // Boundary values
    test("100 -> A", () => expect(scoreToGrade(100)).toBe("A"));
    test("95 -> A", () => expect(scoreToGrade(95)).toBe("A"));
    test("94 -> B", () => expect(scoreToGrade(94)).toBe("B"));
    test("80 -> B", () => expect(scoreToGrade(80)).toBe("B"));
    test("79 -> C", () => expect(scoreToGrade(79)).toBe("C"));
    test("65 -> C", () => expect(scoreToGrade(65)).toBe("C"));
    test("64 -> D", () => expect(scoreToGrade(64)).toBe("D"));
    test("50 -> D", () => expect(scoreToGrade(50)).toBe("D"));
    test("49 -> F", () => expect(scoreToGrade(49)).toBe("F"));
    test("0 -> F", () => expect(scoreToGrade(0)).toBe("F"));
  });

  describe("summarizeResults", () => {
    test("returns zero score for empty results", () => {
      const summary = summarizeResults([]);

      expect(summary.overallScore).toBe(0);
      expect(summary.overallGrade).toBe("F");
      expect(summary.totalPassed).toBe(0);
      expect(summary.totalTests).toBe(0);
      expect(summary.totalIssues).toBe(0);
      expect(summary.results).toHaveLength(0);
    });

    test("aggregates single result correctly", () => {
      const results: EvalElementResult[] = [
        {
          artifactId: "@acme/support",
          elementName: "tone-checker",
          elementType: "skills",
          passed: 3,
          total: 3,
          score: 100,
          grade: "A",
          failures: [],
        },
      ];

      const summary = summarizeResults(results);

      expect(summary.overallScore).toBe(100);
      expect(summary.overallGrade).toBe("A");
      expect(summary.totalPassed).toBe(3);
      expect(summary.totalTests).toBe(3);
      expect(summary.totalIssues).toBe(0);
    });

    test("aggregates mixed results weighted by test count", () => {
      const results: EvalElementResult[] = [
        {
          artifactId: "@acme/support",
          elementName: "tone-checker",
          elementType: "skills",
          passed: 3,
          total: 3,
          score: 100,
          grade: "A",
          failures: [],
        },
        {
          artifactId: "@acme/support",
          elementName: "support-agent",
          elementType: "agents",
          passed: 2,
          total: 3,
          score: 67,
          grade: "C",
          failures: [
            {
              testDescription: "test 3",
              assertionType: "contains",
              expected: "solution",
              actual: "no match",
            },
          ],
        },
      ];

      const summary = summarizeResults(results);

      // Weighted: (3*100 + 3*67) / (3+3) = 501/6 = 83.5 -> 84
      expect(summary.totalPassed).toBe(5);
      expect(summary.totalTests).toBe(6);
      expect(summary.totalIssues).toBe(1);
      expect(summary.overallScore).toBe(84);
      expect(summary.overallGrade).toBe("B");
    });

    test("counts total issues as sum of all failures", () => {
      const results: EvalElementResult[] = [
        {
          artifactId: "@acme/support",
          elementName: "a",
          elementType: "skills",
          passed: 1,
          total: 3,
          score: 33,
          grade: "F",
          failures: [
            { testDescription: "t1", assertionType: "contains", expected: "a", actual: "b" },
            { testDescription: "t2", assertionType: "contains", expected: "c", actual: "d" },
          ],
        },
        {
          artifactId: "@acme/support",
          elementName: "b",
          elementType: "agents",
          passed: 0,
          total: 1,
          score: 0,
          grade: "F",
          failures: [
            { testDescription: "t3", assertionType: "llm-rubric", expected: "good", actual: "bad" },
          ],
        },
      ];

      const summary = summarizeResults(results);

      expect(summary.totalIssues).toBe(3);
    });
  });
});
