/**
 * Application-level field encryption via libsodium's
 * crypto_secretbox_easy (XChaCha20-Poly1305).
 *
 * - 24-byte random nonce (XChaCha20's nonce size makes random nonces
 *   safe — birthday-collision math doesn't bite at 192 bits).
 * - 16-byte Poly1305 authentication tag prepended by secretbox.
 * - Stored format: base64(nonce || ciphertext-with-tag), a single
 *   TEXT column.
 *
 * Consumers should never construct ciphertext by hand — only use
 * `seal()` / `open()` here.
 */

import sodium from "libsodium-wrappers";

const KEY_BYTES = 32;
const NONCE_BYTES = 24; // crypto_secretbox_NONCEBYTES for XChaCha20

let readyPromise: Promise<void> | null = null;

/** libsodium loads its WASM/native bindings asynchronously. Every
 *  public function awaits this. Idempotent — only initializes once. */
export function ensureSodiumReady(): Promise<void> {
  if (!readyPromise) {
    readyPromise = sodium.ready;
  }
  return readyPromise;
}

function assertKey(key: Uint8Array): void {
  if (key.byteLength !== KEY_BYTES) {
    throw new Error(`field crypto: key must be ${KEY_BYTES} bytes, got ${key.byteLength}`);
  }
}

/**
 * Encrypt a UTF-8 plaintext under the given key. Returns a base64
 * string ready to store in a TEXT column.
 *
 * The nonce is randomly generated per call and prefixed to the
 * ciphertext; there is no need to store it separately.
 */
export async function seal(plaintext: string, key: Uint8Array): Promise<string> {
  await ensureSodiumReady();
  assertKey(key);
  const nonce = sodium.randombytes_buf(NONCE_BYTES);
  const cipher = sodium.crypto_secretbox_easy(
    sodium.from_string(plaintext),
    nonce,
    key,
  );
  // Concatenate nonce || ciphertext, then base64.
  const combined = new Uint8Array(nonce.length + cipher.length);
  combined.set(nonce, 0);
  combined.set(cipher, nonce.length);
  return sodium.to_base64(combined, sodium.base64_variants.ORIGINAL);
}

/**
 * Decrypt a value produced by `seal()`. Throws if the MAC fails,
 * the key is wrong, or the input is malformed.
 */
export async function open(sealed: string, key: Uint8Array): Promise<string> {
  await ensureSodiumReady();
  assertKey(key);
  const combined = sodium.from_base64(sealed, sodium.base64_variants.ORIGINAL);
  if (combined.length < NONCE_BYTES + sodium.crypto_secretbox_MACBYTES) {
    throw new Error("field crypto: sealed value too short");
  }
  const nonce = combined.subarray(0, NONCE_BYTES);
  const cipher = combined.subarray(NONCE_BYTES);
  const plain = sodium.crypto_secretbox_open_easy(cipher, nonce, key);
  return sodium.to_string(plain);
}

/** Generate a fresh DEK (data encryption key) — 32 random bytes. */
export async function generateDek(): Promise<Uint8Array> {
  await ensureSodiumReady();
  return sodium.randombytes_buf(KEY_BYTES);
}

/** Constant-time zero-out of a key. Best-effort — V8 may have moved
 *  the bytes, but this covers the common case. */
export function zeroize(key: Uint8Array): void {
  key.fill(0);
}
