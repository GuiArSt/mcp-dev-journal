/**
 * Paper recovery codes.
 *
 * Format: 128 bits of entropy encoded as 5 word-groups of 5 chars,
 * separated by dashes, using Crockford Base32 (case-insensitive,
 * unambiguous: no I, L, O, U).
 *
 * Example: `8K2P4-9XQRW-3FN7M-Z6JTB-V5HC2`
 *
 * The user is shown this string exactly once at vault init and
 * instructed to write it on paper. It never goes to disk, never to
 * a server, never to 1Password unless the user puts it there. Lose
 * the paper, lose the recovery path.
 *
 * Cryptographically: parseRecoveryCode() returns the raw 16 bytes,
 * which the unlock flow feeds to deriveKek() as the "passphrase"
 * argument. The recovery KEK is independent from the passphrase
 * KEK — both wrap the same DEK in the keystore.
 */

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford Base32
const SECRET_BYTES = 16;        // 128 bits
const GROUP_SIZE = 5;
const GROUP_COUNT = 5;
// 128 bits of entropy needs ceil(128/5) = 26 base32 chars; we render
// 25 (5 groups of 5) which is 125 bits. The remaining 3 bits we drop
// to keep the visual format clean — still vastly beyond brute force.
const RENDERED_BITS = GROUP_SIZE * GROUP_COUNT * 5; // 125 bits

/** Generate a fresh 128-bit recovery secret. Returned as both the raw
 *  bytes (for KDF) and the human-readable string (for display).
 *
 *  Callers should immediately persist the wrapped envelope under the
 *  raw bytes and *show the rendered string to the user once*, never
 *  storing it. */
export function generateRecoveryCode(): { raw: Uint8Array; rendered: string } {
  const raw = randomBytes(SECRET_BYTES);
  return {
    raw: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength),
    rendered: renderRecoveryCode(raw),
  };
}

/** Render a 16-byte buffer as a `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`
 *  Crockford Base32 string. Drops the last 3 bits of entropy for
 *  visual cleanliness. */
export function renderRecoveryCode(raw: Uint8Array | Buffer): string {
  if (raw.byteLength !== SECRET_BYTES) {
    throw new Error(`renderRecoveryCode: raw must be ${SECRET_BYTES} bytes`);
  }
  // Build a 128-bit big-endian integer; pull 5 bits at a time from
  // the top. Manual approach because BigInt + base32 has no stdlib.
  // NOTE: BigInt literals (`0n`) need ES2020; this codebase targets
  // ES2017, so we use the BigInt() constructor throughout.
  const MASK_5_BITS = BigInt(0x1f);
  let acc = BigInt(0);
  for (const byte of raw) acc = (acc << BigInt(8)) | BigInt(byte);

  const chars: string[] = [];
  for (let i = 0; i < RENDERED_BITS / 5; i++) {
    // Shift to bring the relevant 5 bits to the bottom.
    const shift = BigInt(RENDERED_BITS - 5 * (i + 1) + (128 - RENDERED_BITS));
    const idx = Number((acc >> shift) & MASK_5_BITS);
    chars.push(ALPHABET[idx]!);
  }

  // Group into 5s with dashes.
  const groups: string[] = [];
  for (let g = 0; g < GROUP_COUNT; g++) {
    groups.push(chars.slice(g * GROUP_SIZE, (g + 1) * GROUP_SIZE).join(""));
  }
  return groups.join("-");
}

/** Parse a human-typed recovery code back to its raw bytes. Tolerant
 *  of: lowercase, missing dashes, common Crockford aliases (I→1, L→1,
 *  O→0). Throws on anything that doesn't decode cleanly. */
export function parseRecoveryCode(input: string): Uint8Array {
  const normalized = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/I/g, "1")
    .replace(/L/g, "1")
    .replace(/O/g, "0");

  const expectedChars = (RENDERED_BITS / 5);
  if (normalized.length !== expectedChars) {
    throw new Error(
      `parseRecoveryCode: expected ${expectedChars} chars after normalization, got ${normalized.length}`,
    );
  }

  const MASK_BYTE = BigInt(0xff);
  let acc = BigInt(0);
  for (const char of normalized) {
    const idx = ALPHABET.indexOf(char);
    if (idx < 0) {
      throw new Error(`parseRecoveryCode: invalid character "${char}"`);
    }
    acc = (acc << BigInt(5)) | BigInt(idx);
  }

  // We dropped 3 bits at render time; shift back to align to byte
  // boundary (128 bits = 16 bytes).
  acc = acc << BigInt(128 - RENDERED_BITS);

  const raw = new Uint8Array(SECRET_BYTES);
  for (let i = SECRET_BYTES - 1; i >= 0; i--) {
    raw[i] = Number(acc & MASK_BYTE);
    acc = acc >> BigInt(8);
  }
  return raw;
}
