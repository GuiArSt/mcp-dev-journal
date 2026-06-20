import { describe, expect, it } from "vitest";
import {
  sanitizeChatMessageForPersist,
  stripInlineMediaFromPart,
} from "@/lib/conversation-persist";

describe("conversation-persist", () => {
  it("strips data URLs from file parts", () => {
    const out = stripInlineMediaFromPart({
      type: "file",
      mediaType: "image/png",
      filename: "image.png",
      url: "data:image/png;base64,AAAA",
    }) as Record<string, unknown>;
    expect(out.url).toBeUndefined();
    expect(out.persistedInlineMedia).toBe(true);
  });

  it("sanitizes full chat messages", () => {
    const msg = sanitizeChatMessageForPersist({
      id: "1",
      role: "user",
      content: "see attached",
      parts: [
        {
          type: "file",
          mediaType: "image/png",
          filename: "image.png",
          url: "data:image/png;base64,BBBB",
        },
      ],
    });
    const part = msg.parts?.[0] as Record<string, unknown>;
    expect(part.url).toBeUndefined();
    expect(part.persistedInlineMedia).toBe(true);
  });
});
