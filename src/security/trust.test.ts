import { describe, it, expect } from "vitest";
import {
  generateTrustKey,
  isValidTrustKey,
  signTrust,
  verifyTrustSignature,
} from "./trust";
import { TRUST_KEY_PREFIX, TRUST_SIGNATURE_PREFIX } from "./trust.types";

describe("generateTrustKey", () => {
  it("returns a string with the correct prefix", () => {
    const key = generateTrustKey();
    expect(key.startsWith(TRUST_KEY_PREFIX)).toBe(true);
  });

  it("returns a key with correct total length", () => {
    const key = generateTrustKey();
    // grk_trust_ (10 chars) + 64 hex chars = 74
    expect(key.length).toBe(74);
  });

  it("contains only hex characters after prefix", () => {
    const key = generateTrustKey();
    const hexPart = key.slice(TRUST_KEY_PREFIX.length);
    expect(hexPart).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates unique keys on each call", () => {
    const key1 = generateTrustKey();
    const key2 = generateTrustKey();
    expect(key1).not.toBe(key2);
  });
});

describe("isValidTrustKey", () => {
  it("accepts a properly formatted key", () => {
    const key = generateTrustKey();
    expect(isValidTrustKey(key)).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidTrustKey("")).toBe(false);
  });

  it("rejects key with wrong prefix", () => {
    const key = "grk_wrong_" + "a".repeat(64);
    expect(isValidTrustKey(key)).toBe(false);
  });

  it("rejects key with short hex part", () => {
    const key = TRUST_KEY_PREFIX + "a".repeat(32);
    expect(isValidTrustKey(key)).toBe(false);
  });

  it("rejects key with long hex part", () => {
    const key = TRUST_KEY_PREFIX + "a".repeat(128);
    expect(isValidTrustKey(key)).toBe(false);
  });

  it("rejects key with non-hex characters", () => {
    const key = TRUST_KEY_PREFIX + "g".repeat(64);
    expect(isValidTrustKey(key)).toBe(false);
  });

  it("rejects key with uppercase hex", () => {
    const key = TRUST_KEY_PREFIX + "A".repeat(64);
    expect(isValidTrustKey(key)).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidTrustKey(123 as unknown as string)).toBe(false);
    expect(isValidTrustKey(null as unknown as string)).toBe(false);
    expect(isValidTrustKey(undefined as unknown as string)).toBe(false);
  });
});

describe("signTrust", () => {
  const testKey = generateTrustKey();

  it("returns a string with the signature prefix", () => {
    const sig = signTrust("@scope/name", testKey);
    expect(sig.startsWith(TRUST_SIGNATURE_PREFIX)).toBe(true);
  });

  it("contains hex after the prefix", () => {
    const sig = signTrust("@scope/name", testKey);
    const hexPart = sig.slice(TRUST_SIGNATURE_PREFIX.length);
    expect(hexPart).toMatch(/^[0-9a-f]+$/);
  });

  it("produces deterministic output for same inputs", () => {
    const sig1 = signTrust("@scope/name", testKey);
    const sig2 = signTrust("@scope/name", testKey);
    expect(sig1).toBe(sig2);
  });

  it("produces different signatures for different artifact IDs", () => {
    const sig1 = signTrust("@scope/a", testKey);
    const sig2 = signTrust("@scope/b", testKey);
    expect(sig1).not.toBe(sig2);
  });

  it("produces different signatures for different keys", () => {
    const key2 = generateTrustKey();
    const sig1 = signTrust("@scope/name", testKey);
    const sig2 = signTrust("@scope/name", key2);
    expect(sig1).not.toBe(sig2);
  });
});

describe("verifyTrustSignature", () => {
  const testKey = generateTrustKey();

  it("returns true for a valid signature", () => {
    const sig = signTrust("@scope/name", testKey);
    expect(verifyTrustSignature("@scope/name", sig, testKey)).toBe(true);
  });

  it("returns false for wrong artifact ID", () => {
    const sig = signTrust("@scope/a", testKey);
    expect(verifyTrustSignature("@scope/b", sig, testKey)).toBe(false);
  });

  it("returns false for wrong key", () => {
    const sig = signTrust("@scope/name", testKey);
    const otherKey = generateTrustKey();
    expect(verifyTrustSignature("@scope/name", sig, otherKey)).toBe(false);
  });

  it("rejects boolean true", () => {
    expect(verifyTrustSignature("@scope/name", true, testKey)).toBe(false);
  });

  it("rejects boolean false", () => {
    expect(verifyTrustSignature("@scope/name", false, testKey)).toBe(false);
  });

  it("rejects undefined", () => {
    expect(verifyTrustSignature("@scope/name", undefined, testKey)).toBe(false);
  });

  it("rejects null", () => {
    expect(verifyTrustSignature("@scope/name", null, testKey)).toBe(false);
  });

  it("rejects plain strings without prefix", () => {
    expect(verifyTrustSignature("@scope/name", "not-a-signature", testKey)).toBe(false);
  });

  it("rejects forged signature with correct prefix", () => {
    const forged = TRUST_SIGNATURE_PREFIX + "0".repeat(64);
    expect(verifyTrustSignature("@scope/name", forged, testKey)).toBe(false);
  });

  it("rejects empty string", () => {
    expect(verifyTrustSignature("@scope/name", "", testKey)).toBe(false);
  });

  it("rejects signature with tampered hex", () => {
    const sig = signTrust("@scope/name", testKey);
    const tampered = sig.slice(0, -1) + (sig.endsWith("0") ? "1" : "0");
    expect(verifyTrustSignature("@scope/name", tampered, testKey)).toBe(false);
  });
});
