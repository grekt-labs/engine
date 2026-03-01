import { describe, test, expect } from "vitest";
import {
  formatBytes,
  estimateTokens,
  formatNumber,
  formatTokenEstimate,
} from "./index";

describe("formatters", () => {
  describe("formatBytes", () => {
    test("returns B for bytes < 1024", () => {
      expect(formatBytes(500)).toBe("500 B");
      expect(formatBytes(0)).toBe("0 B");
      expect(formatBytes(1023)).toBe("1023 B");
    });

    test("returns KB for bytes < 1MB", () => {
      expect(formatBytes(1024)).toBe("1.0 KB");
      expect(formatBytes(1536)).toBe("1.5 KB");
      expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
    });

    test("returns MB for bytes >= 1MB", () => {
      expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
      expect(formatBytes(1572864)).toBe("1.5 MB");
    });
  });

  describe("estimateTokens", () => {
    test("divides bytes by 4", () => {
      expect(estimateTokens(4000)).toBe(1000);
      expect(estimateTokens(100)).toBe(25);
      expect(estimateTokens(0)).toBe(0);
    });

    test("rounds to nearest integer", () => {
      expect(estimateTokens(5)).toBe(1);
      expect(estimateTokens(7)).toBe(2);
    });
  });

  describe("formatNumber", () => {
    test("adds thousand separators", () => {
      expect(formatNumber(1234567)).toBe("1,234,567");
      expect(formatNumber(1000)).toBe("1,000");
      expect(formatNumber(999)).toBe("999");
    });
  });

  describe("formatTokenEstimate", () => {
    test("combines estimation and formatting", () => {
      expect(formatTokenEstimate(4000)).toBe("~1,000 tokens");
      expect(formatTokenEstimate(40000)).toBe("~10,000 tokens");
    });
  });
});
