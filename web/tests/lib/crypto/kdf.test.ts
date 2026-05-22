import { describe, it, expect } from "vitest";
import {
  deriveKek,
  generateSalt,
  KDF_OUTPUT_BYTES,
  KDF_SALT_BYTES,
} from "@/lib/crypto/kdf";

describe("kdf", () => {
  it("generateSalt produces the documented length", () => {
    const salt = generateSalt();
    expect(salt.byteLength).toBe(KDF_SALT_BYTES);
  });

  it("two generated salts are different", () => {
    const a = generateSalt();
    const b = generateSalt();
    expect(Buffer.compare(a, b)).not.toBe(0);
  });

  it("deriveKek returns 32 bytes", async () => {
    const salt = generateSalt();
    const kek = await deriveKek("correct horse battery staple", salt);
    expect(kek.byteLength).toBe(KDF_OUTPUT_BYTES);
  }, 10_000);

  it("same passphrase + same salt is deterministic", async () => {
    const salt = generateSalt();
    const a = await deriveKek("hunter2", salt);
    const b = await deriveKek("hunter2", salt);
    expect(Buffer.compare(a, b)).toBe(0);
  }, 20_000);

  it("different salts produce different KEKs for the same passphrase", async () => {
    const a = await deriveKek("hunter2", generateSalt());
    const b = await deriveKek("hunter2", generateSalt());
    expect(Buffer.compare(a, b)).not.toBe(0);
  }, 20_000);

  it("different passphrases produce different KEKs for the same salt", async () => {
    const salt = generateSalt();
    const a = await deriveKek("hunter2", salt);
    const b = await deriveKek("hunter3", salt);
    expect(Buffer.compare(a, b)).not.toBe(0);
  }, 20_000);

  it("rejects empty passphrase", async () => {
    await expect(deriveKek("", generateSalt())).rejects.toThrow();
  });

  it("rejects wrong-size salt", async () => {
    const wrongSalt = new Uint8Array(8);
    await expect(deriveKek("hunter2", wrongSalt)).rejects.toThrow();
  });
});
