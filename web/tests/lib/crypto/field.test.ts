import { describe, it, expect } from "vitest";
import { seal, open, generateDek, zeroize } from "@/lib/crypto/field";

describe("field crypto", () => {
  it("seal then open round-trips ASCII", async () => {
    const key = await generateDek();
    const sealed = await seal("hello world", key);
    const opened = await open(sealed, key);
    expect(opened).toBe("hello world");
  });

  it("seal then open round-trips multibyte UTF-8", async () => {
    const key = await generateDek();
    const plaintext = "Kronus 🜃 Tartarus — Φιλοσοφία";
    const sealed = await seal(plaintext, key);
    expect(await open(sealed, key)).toBe(plaintext);
  });

  it("seal then open round-trips an empty string", async () => {
    const key = await generateDek();
    const sealed = await seal("", key);
    expect(await open(sealed, key)).toBe("");
  });

  it("seal then open round-trips a long string", async () => {
    const key = await generateDek();
    const plaintext = "x".repeat(20_000);
    const sealed = await seal(plaintext, key);
    expect(await open(sealed, key)).toBe(plaintext);
  });

  it("two seals of the same plaintext are different ciphertexts", async () => {
    const key = await generateDek();
    const a = await seal("identical", key);
    const b = await seal("identical", key);
    expect(a).not.toBe(b);
  });

  it("open with the wrong key throws", async () => {
    const key = await generateDek();
    const otherKey = await generateDek();
    const sealed = await seal("secret", key);
    await expect(open(sealed, otherKey)).rejects.toThrow();
  });

  it("open with tampered ciphertext throws", async () => {
    const key = await generateDek();
    const sealed = await seal("secret", key);
    // Flip a byte near the end (ciphertext / tag region).
    const buf = Buffer.from(sealed, "base64");
    buf[buf.length - 5] ^= 0xff;
    const tampered = buf.toString("base64");
    await expect(open(tampered, key)).rejects.toThrow();
  });

  it("seal rejects wrong-size keys", async () => {
    const wrongKey = new Uint8Array(16);
    await expect(seal("hi", wrongKey)).rejects.toThrow();
  });

  it("generateDek returns 32 bytes", async () => {
    const dek = await generateDek();
    expect(dek.byteLength).toBe(32);
  });

  it("zeroize fills the buffer with zero", async () => {
    const dek = await generateDek();
    zeroize(dek);
    expect(dek.every((b) => b === 0)).toBe(true);
  });
});
