import { describe, expect, it } from "vitest";
import { museFilenameFromPath, resolveStoredImageUrl } from "@/lib/media-image-url";

describe("media-image-url", () => {
  it("extracts muse filenames from root-relative paths", () => {
    expect(museFilenameFromPath("/muse-mood-1779372622130.png")).toBe("muse-mood-1779372622130.png");
    expect(museFilenameFromPath("muse-edit-mood-123.png")).toBe("muse-edit-mood-123.png");
  });

  it("resolves muse filenames via lookup", () => {
    const url = resolveStoredImageUrl("/muse-mood-99.png", (fn) =>
      fn === "muse-mood-99.png" ? 57 : null,
    );
    expect(url).toBe("/api/media/57/raw");
  });

  it("drops public-website-only /images paths", () => {
    expect(resolveStoredImageUrl("/images/hero-ai.png", () => null)).toBeNull();
  });

  it("passes through api media urls", () => {
    expect(resolveStoredImageUrl("/api/media/12/raw", () => null)).toBe("/api/media/12/raw");
  });
});
