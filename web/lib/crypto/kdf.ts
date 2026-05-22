/**
 * Argon2id key derivation. Parameters intentionally exceed the OWASP
 * Password Storage minimum (m=19 MiB, t=2, p=1): we use m=64 MiB,
 * t=3, p=1. On an M-series Mac this runs ≈300ms — the right cost for
 * a once-per-boot vault unlock and well above brute-force resistance
 * for any realistic adversary.
 *
 * Output is always 32 bytes — the size of an XChaCha20-Poly1305 key.
 *
 * @node-rs/argon2 is a pure-Rust binding so we avoid node-gyp.
 */

import { hashRaw } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

export const KDF_OUTPUT_BYTES = 32;
export const KDF_SALT_BYTES = 16;

// Argon2id is encoded as enum value 2 in the upstream binding. We
// can't import `Algorithm.Argon2id` directly under `isolatedModules`
// because it's a `const enum`. The numeric value is fixed by the
// argon2 spec and the @node-rs/argon2 API surface.
const ARGON2ID = 2;

export const ARGON2_PARAMS = {
  algorithm: ARGON2ID,
  memoryCost: 65_536, // 64 MiB
  timeCost: 3,
  parallelism: 1,
  outputLen: KDF_OUTPUT_BYTES,
} as const;

/** Generate a fresh random salt. Store alongside the wrapped DEK. */
export function generateSalt(): Buffer {
  return randomBytes(KDF_SALT_BYTES);
}

/**
 * Derive a 32-byte KEK from a passphrase + salt using Argon2id with
 * the OWASP 2026 baseline parameters.
 *
 * The same passphrase + same salt always produces the same KEK — that's
 * what lets us re-derive on every unlock without storing the KEK.
 */
export async function deriveKek(
  passphrase: string,
  salt: Buffer | Uint8Array,
): Promise<Uint8Array> {
  if (passphrase.length === 0) {
    throw new Error("deriveKek: passphrase must not be empty");
  }
  if (salt.byteLength !== KDF_SALT_BYTES) {
    throw new Error(`deriveKek: salt must be ${KDF_SALT_BYTES} bytes`);
  }
  // hashRaw returns a Buffer of exactly outputLen bytes — no Base64
  // encoding, no $argon2id$… wrapper.
  const raw = await hashRaw(passphrase, {
    ...ARGON2_PARAMS,
    salt: Buffer.from(salt),
  });
  return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength);
}
