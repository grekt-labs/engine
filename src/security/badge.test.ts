import { describe, it, expect } from "vitest";
import { isBadgeAtOrAbove } from "./badge";
import type { TrustBadge } from "./security.types";

describe("isBadgeAtOrAbove", () => {
  it("returns true when badge is worse than threshold", () => {
    expect(isBadgeAtOrAbove("rejected", "suspicious")).toBe(true);
  });

  it("returns true when badge exactly matches threshold", () => {
    expect(isBadgeAtOrAbove("suspicious", "suspicious")).toBe(true);
  });

  it("returns false when badge is better than threshold", () => {
    expect(isBadgeAtOrAbove("conditional", "suspicious")).toBe(false);
  });

  it("returns false when best badge compared against worst threshold", () => {
    expect(isBadgeAtOrAbove("certified", "rejected")).toBe(false);
  });

  it("returns true when worst badge compared against best threshold", () => {
    expect(isBadgeAtOrAbove("rejected", "certified")).toBe(true);
  });

  it("returns true for all badges compared against themselves", () => {
    const badges: TrustBadge[] = ["certified", "conditional", "suspicious", "rejected"];
    for (const badge of badges) {
      expect(isBadgeAtOrAbove(badge, badge)).toBe(true);
    }
  });

  it("distinguishes adjacent severity levels", () => {
    expect(isBadgeAtOrAbove("conditional", "suspicious")).toBe(false);
    expect(isBadgeAtOrAbove("suspicious", "conditional")).toBe(true);
  });
});
