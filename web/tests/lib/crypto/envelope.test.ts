import { describe, it, expect } from "vitest";
import {
  initKeystore,
  unwrapWithPassphrase,
  unwrapWithRecovery,
  rotatePassphrase,
} from "@/lib/crypto/envelope";
import { generateRecoveryCode } from "@/lib/crypto/recovery";

describe("keystore envelope", () => {
  it("init + unwrap with the right passphrase yields a 32-byte DEK", async () => {
    const { keystore, dek } = await initKeystore({ passphrase: "hunter2" });
    const unwrapped = await unwrapWithPassphrase(keystore, "hunter2");
    expect(unwrapped.byteLength).toBe(32);
    expect(Buffer.compare(dek, unwrapped)).toBe(0);
  }, 30_000);

  it("unwrap with the wrong passphrase throws", async () => {
    const { keystore } = await initKeystore({ passphrase: "hunter2" });
    await expect(unwrapWithPassphrase(keystore, "hunter3")).rejects.toThrow();
  }, 30_000);

  it("recovery path: opt-in unwrap returns the same DEK as the passphrase path", async () => {
    const recovery = generateRecoveryCode();
    const { keystore, dek } = await initKeystore({
      passphrase: "hunter2",
      recoveryRaw: recovery.raw,
    });

    const fromPassphrase = await unwrapWithPassphrase(keystore, "hunter2");
    const fromRecovery = await unwrapWithRecovery(keystore, recovery.raw);

    expect(Buffer.compare(dek, fromPassphrase)).toBe(0);
    expect(Buffer.compare(dek, fromRecovery)).toBe(0);
  }, 60_000);

  it("recovery path throws when not opted in", async () => {
    const { keystore } = await initKeystore({ passphrase: "hunter2" });
    const someRandom = generateRecoveryCode();
    await expect(unwrapWithRecovery(keystore, someRandom.raw)).rejects.toThrow();
  }, 30_000);

  it("recovery path throws on the wrong code", async () => {
    const correct = generateRecoveryCode();
    const wrong = generateRecoveryCode();
    const { keystore } = await initKeystore({
      passphrase: "hunter2",
      recoveryRaw: correct.raw,
    });
    await expect(unwrapWithRecovery(keystore, wrong.raw)).rejects.toThrow();
  }, 30_000);

  it("rotatePassphrase: old passphrase fails, new passphrase yields the same DEK, recovery wrap is untouched", async () => {
    const recovery = generateRecoveryCode();
    const { keystore, dek } = await initKeystore({
      passphrase: "hunter2",
      recoveryRaw: recovery.raw,
    });

    const rotated = await rotatePassphrase(keystore, dek, "newpass!");

    await expect(unwrapWithPassphrase(rotated, "hunter2")).rejects.toThrow();
    const reunwrapped = await unwrapWithPassphrase(rotated, "newpass!");
    expect(Buffer.compare(dek, reunwrapped)).toBe(0);

    // Recovery still works with the same code.
    const fromRecovery = await unwrapWithRecovery(rotated, recovery.raw);
    expect(Buffer.compare(dek, fromRecovery)).toBe(0);

    expect(rotated.passphrase_rotated_at).not.toBeNull();
    expect(rotated.recovery_rotated_at).toBeNull();
  }, 90_000);

  it("two keystores generated independently have different DEKs", async () => {
    const a = await initKeystore({ passphrase: "hunter2" });
    const b = await initKeystore({ passphrase: "hunter2" });
    expect(Buffer.compare(a.dek, b.dek)).not.toBe(0);
  }, 30_000);
});
