import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import {
  TRUST_KEY_PREFIX,
  TRUST_SIGNATURE_PREFIX,
  TRUST_KEY_HEX_LENGTH,
  TRUST_KEY_FULL_LENGTH,
} from "./trust.types";

const HMAC_ALGORITHM = "sha256";
const HEX_PATTERN = /^[0-9a-f]+$/;

/**
 * Generate a new trust key for HMAC signing.
 * Format: grk_trust_<64 hex chars> (32 random bytes)
 */
export function generateTrustKey(): string {
  const keyBytes = randomBytes(32);
  return `${TRUST_KEY_PREFIX}${keyBytes.toString("hex")}`;
}

/**
 * Validate that a string is a well-formed trust key.
 */
export function isValidTrustKey(key: string): boolean {
  if (typeof key !== "string") return false;
  if (key.length !== TRUST_KEY_FULL_LENGTH) return false;
  if (!key.startsWith(TRUST_KEY_PREFIX)) return false;

  const hexPart = key.slice(TRUST_KEY_PREFIX.length);
  return HEX_PATTERN.test(hexPart) && hexPart.length === TRUST_KEY_HEX_LENGTH;
}

/**
 * Sign an artifact ID with the trust key using HMAC-SHA256.
 * Returns: grk_sig_<HMAC hex>
 */
export function signTrust(artifactId: string, key: string): string {
  const hmac = createHmac(HMAC_ALGORITHM, key);
  hmac.update(artifactId);
  return `${TRUST_SIGNATURE_PREFIX}${hmac.digest("hex")}`;
}

/**
 * Verify an HMAC trust signature for an artifact ID.
 * Uses constant-time comparison to prevent timing attacks.
 * Rejects boolean `true`, undefined, and malformed strings.
 */
export function verifyTrustSignature(
  artifactId: string,
  signature: unknown,
  key: string,
): boolean {
  if (typeof signature !== "string") return false;
  if (!signature.startsWith(TRUST_SIGNATURE_PREFIX)) return false;

  const expectedSignature = signTrust(artifactId, key);

  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);

  if (signatureBuffer.length !== expectedBuffer.length) return false;

  return timingSafeEqual(signatureBuffer, expectedBuffer);
}
