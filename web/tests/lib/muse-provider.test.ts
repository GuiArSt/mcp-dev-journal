import { describe, expect, it } from "vitest";
import { driverModelForProvider, getProviderPair } from "@/lib/ai/muse-provider";

describe("muse-provider", () => {
  it("does not send Gemini driver ids through OpenAI", () => {
    const pair = getProviderPair("openai", {
      driverModel: "gemini-3.5-flash",
      painterModel: "gpt-image-2",
    });
    expect(pair.driverSdk).toBe("openai");
    expect(pair.driverModel.startsWith("gemini-")).toBe(false);
    expect(pair.painterModel).toBe("gpt-image-2");
  });

  it("keeps Gemini drivers on Google", () => {
    expect(driverModelForProvider("google", "gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(driverModelForProvider("google", "gpt-5.5")).toBe("gemini-2.5-flash");
  });
});
