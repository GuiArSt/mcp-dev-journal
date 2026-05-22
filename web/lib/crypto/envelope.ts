/**
 * Vault keystore envelope.
 *
 * The DEK (data-encryption key) is wrapped twice:
 *   - under a KEK derived from the user's passphrase
 *   - under a KEK derived from a 128-bit paper recovery code
 *
 * Both wrappings yield the same DEK. Passphrase rotation re-wraps
 * only `wrapped_dek_passphrase`. Recovery rotation re-wraps only
 * `wrapped_dek_recovery`. Neither touches a stored vault row.
 *
 * Serialized to `data/vault.keystore.json`. This file contains
 * salts, wrapped ciphertext, and timestamps only — no plaintext key
 * material. Loss of the file = loss of the DEK = loss of all
 * field-encrypted data and all encrypted backups. Back it up
 * alongside the vault.
 */

import {
  generateSalt,
  deriveKek,
  KDF_SALT_BYTES,
} from "./kdf";
import { seal, open, generateDek, ensureSodiumReady } from "./field";

export const KEYSTORE_VERSION = 2;

export interface WrappedDek {
  /** Base64 of the Argon2id salt for this KEK. */
  salt: string;
  /** Output of seal(dek, kek) — base64(nonce || ciphertext || tag). */
  wrapped: string;
}

export interface Keystore {
  version: 2;
  kdf: {
    name: "argon2id";
    m: number;
    t: number;
    p: number;
  };
  wrapped_dek_passphrase: WrappedDek;
  wrapped_dek_recovery: (WrappedDek & { enabled: boolean }) | null;
  created_at: string;
  passphrase_rotated_at: string | null;
  recovery_rotated_at: string | null;
}

const KDF_META = { name: "argon2id" as const, m: 65_536, t: 3, p: 1 };

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function fromBase64(s: string): Uint8Array {
  const buf = Buffer.from(s, "base64");
  return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

function utf8ToString(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("utf8");
}

/**
 * Wrap a DEK under a KEK using the field-encryption primitive.
 * The DEK is encoded as UTF-8 hex for storage so we can reuse the
 * string-based seal/open helpers — at this size the overhead is
 * negligible and we avoid a parallel Uint8Array codepath.
 */
async function wrapDek(dek: Uint8Array, kek: Uint8Array): Promise<string> {
  return seal(Buffer.from(dek).toString("hex"), kek);
}

async function unwrapDek(wrapped: string, kek: Uint8Array): Promise<Uint8Array> {
  const hex = await open(wrapped, kek);
  return new Uint8Array(Buffer.from(hex, "hex"));
}

/**
 * Initialize a brand-new keystore from a passphrase and (optionally)
 * an opt-in recovery code. The caller is responsible for showing the
 * recovery rendering to the user exactly once and never persisting it.
 *
 * Returns the keystore (serialize and write to disk) and the live DEK
 * (hold in process memory). The caller may zeroize the DEK on shutdown.
 */
export async function initKeystore(opts: {
  passphrase: string;
  recoveryRaw?: Uint8Array | null;
}): Promise<{ keystore: Keystore; dek: Uint8Array }> {
  await ensureSodiumReady();
  const dek = await generateDek();

  const passphraseSalt = generateSalt();
  const passphraseKek = await deriveKek(opts.passphrase, passphraseSalt);
  const wrappedPassphrase: WrappedDek = {
    salt: toBase64(passphraseSalt),
    wrapped: await wrapDek(dek, passphraseKek),
  };

  let wrappedRecovery: (WrappedDek & { enabled: boolean }) | null = null;
  if (opts.recoveryRaw && opts.recoveryRaw.byteLength > 0) {
    const recoverySalt = generateSalt();
    // The recovery secret IS the input to Argon2id — we treat its
    // bytes as the "passphrase" by stringifying through hex. The
    // resulting KEK has full 128-bit entropy from the secret plus
    // the Argon2id work factor on top.
    const recoveryKek = await deriveKek(
      Buffer.from(opts.recoveryRaw).toString("hex"),
      recoverySalt,
    );
    wrappedRecovery = {
      salt: toBase64(recoverySalt),
      wrapped: await wrapDek(dek, recoveryKek),
      enabled: true,
    };
  }

  const keystore: Keystore = {
    version: KEYSTORE_VERSION,
    kdf: KDF_META,
    wrapped_dek_passphrase: wrappedPassphrase,
    wrapped_dek_recovery: wrappedRecovery,
    created_at: new Date().toISOString(),
    passphrase_rotated_at: null,
    recovery_rotated_at: null,
  };
  return { keystore, dek };
}

/** Unwrap a keystore using a passphrase. Throws on wrong passphrase
 *  (MAC failure inside `open()`). */
export async function unwrapWithPassphrase(
  keystore: Keystore,
  passphrase: string,
): Promise<Uint8Array> {
  await ensureSodiumReady();
  if (keystore.version !== KEYSTORE_VERSION) {
    throw new Error(`unwrapWithPassphrase: unsupported version ${keystore.version}`);
  }
  const salt = fromBase64(keystore.wrapped_dek_passphrase.salt);
  if (salt.byteLength !== KDF_SALT_BYTES) {
    throw new Error("unwrapWithPassphrase: corrupt salt length");
  }
  const kek = await deriveKek(passphrase, salt);
  return unwrapDek(keystore.wrapped_dek_passphrase.wrapped, kek);
}

/** Unwrap a keystore using a recovery code (raw 16 bytes). Throws if
 *  recovery was opted out at init or the code is wrong. */
export async function unwrapWithRecovery(
  keystore: Keystore,
  recoveryRaw: Uint8Array,
): Promise<Uint8Array> {
  await ensureSodiumReady();
  if (!keystore.wrapped_dek_recovery || !keystore.wrapped_dek_recovery.enabled) {
    throw new Error("unwrapWithRecovery: recovery not enabled for this vault");
  }
  const salt = fromBase64(keystore.wrapped_dek_recovery.salt);
  const kek = await deriveKek(
    Buffer.from(recoveryRaw).toString("hex"),
    salt,
  );
  return unwrapDek(keystore.wrapped_dek_recovery.wrapped, kek);
}

/** Re-wrap the DEK under a new passphrase. Used by the rotate-password
 *  flow — leaves the recovery wrapping untouched. */
export async function rotatePassphrase(
  keystore: Keystore,
  dek: Uint8Array,
  newPassphrase: string,
): Promise<Keystore> {
  await ensureSodiumReady();
  const salt = generateSalt();
  const kek = await deriveKek(newPassphrase, salt);
  return {
    ...keystore,
    wrapped_dek_passphrase: {
      salt: toBase64(salt),
      wrapped: await wrapDek(dek, kek),
    },
    passphrase_rotated_at: new Date().toISOString(),
  };
}

// Suppress unused-import warning for the helper we expose internally.
void utf8ToString;
