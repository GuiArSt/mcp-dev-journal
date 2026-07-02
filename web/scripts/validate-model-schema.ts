import { convertToModelMessages, modelMessageSchema } from "ai";
import { z } from "zod/v4";
import { repairModelMessages } from "../lib/chat-message-repair";

const schema = z.array(modelMessageSchema);

async function validate(label: string, messages: unknown[]) {
  const result = schema.safeParse(messages);
  if (!result.success) {
    console.log(`FAIL ${label}:`, result.error.issues.length, "issues");
    for (const issue of result.error.issues.slice(0, 8)) {
      console.log(" ", issue.path, issue.message);
    }
    return false;
  }
  console.log(`OK ${label}:`, messages.length, "messages");
  return true;
}

async function main() {
  const broken = [
    {
      role: "user" as const,
      parts: [
        {
          type: "file" as const,
          mediaType: "image/png",
          filename: "image.png",
          url: "https://example.com/image.png",
        },
      ],
    },
  ];
  const raw = await convertToModelMessages(broken);
  console.log("RAW sample:", JSON.stringify((raw[0] as { content?: unknown[] })?.content?.[0], null, 2));
  const repaired = repairModelMessages(raw);
  await validate("raw file", raw);
  await validate("repaired file", repaired);

  const toolBroken = [
    {
      role: "assistant" as const,
      parts: [
        {
          type: "tool-repository_search_documents",
          toolName: "repository_search_documents",
          state: "output-available",
          output: { type: "text", value: "x" },
        },
      ],
    },
  ];
  const toolRaw = await convertToModelMessages(toolBroken as never);
  console.log("TOOL RAW:", JSON.stringify(toolRaw, null, 2).slice(0, 500));
  const toolRepaired = repairModelMessages(toolRaw);
  await validate("raw tool", toolRaw);
  await validate("repaired tool", toolRepaired);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
