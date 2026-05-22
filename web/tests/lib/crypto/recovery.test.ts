import { describe, it, expect } from "vitest";
import {
  generateRecoveryCode,
  renderRecoveryCode,
  parseRecoveryCode,
} from "@/lib/crypto/recovery";

describe("recovery code", () => {
  it("generated codes match the 25-char dashed format", () => {
    const { rendered } = generateRecoveryCode();
    expect(rendered).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  });

  it("generated raw is 16 bytes", () => {
    const { raw } = generateRecoveryCode();
    expect(raw.byteLength).toBe(16);
  });

  it("two generated codes are different", () => {
    const a = generateRecoveryCode();
    const b = generateRecoveryCode();
    expect(a.rendered).not.toBe(b.rendered);
    expect(Buffer.compare(a.raw, b.raw)).not.toBe(0);
  });

  it("rendered → parsed produces the same byte prefix (modulo dropped 3 bits)", () => {
    const { raw, rendered } = generateRecoveryCode();
    const parsed = parseRecoveryCode(rendered);
    // First 15 bytes round-trip exactly; the last byte's low 3 bits
    // are dropped at render time, so compare top 5 bits only.
    expect(Buffer.compare(raw.subarray(0, 15), parsed.subarray(0, 15))).toBe(0);
    expect(raw[15]! & 0xf8).toBe(parsed[15]! & 0xf8);
  });

  it("parser tolerates lowercase input", () => {
    const { rendered } = generateRecoveryCode();
    const a = parseRecoveryCode(rendered);
    const b = parseRecoveryCode(rendered.toLowerCase());
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("parser tolerates missing dashes", () => {
    const { rendered } = generateRecoveryCode();
    const a = parseRecoveryCode(rendered);
    const b = parseRecoveryCode(rendered.replace(/-/g, ""));
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("parser tolerates Crockford aliases (I, L, O → 1, 1, 0)", () => {
    // Build a synthetic code with the aliased chars and make sure it
    // decodes the same as the canonical form.
    const canonical = "11011-00000-00000-00000-00000";
    const aliased = "ILOII-OOOOO-OOOOO-OOOOO-OOOOO";
    expect(Buffer.compare(
      parseRecoveryCode(canonical),
      parseRecoveryCode(aliased),
    )).toBe(0);
  });

  it("parser rejects wrong length", () => {
    expect(() => parseRecoveryCode("ABC")).toThrow();
    expect(() => parseRecoveryCode("X".repeat(26))).toThrow();
  });

  it("parser rejects invalid characters", () => {
    expect(() => parseRecoveryCode("$@#$%-XXXXX-XXXXX-XXXXX-XXXXX")).toThrow();
  });

  it("renderRecoveryCode rejects wrong-size input", () => {
    expect(() => renderRecoveryCode(new Uint8Array(8))).toThrow();
    expect(() => renderRecoveryCode(new Uint8Array(32))).toThrow();
  });
});
