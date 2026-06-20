import { convertToModelMessages, modelMessageSchema } from "ai";
import { z } from "zod";
import {
  prepareUiMessagesForInference,
  repairModelMessages,
} from "../lib/chat-message-repair.ts";

const schema = z.array(modelMessageSchema);

async function test(label, msgs) {
  const { messages: prepared } = prepareUiMessagesForInference(msgs, "openai");
  const raw = await convertToModelMessages(prepared);
  const repaired = repairModelMessages(raw);
  const r = schema.safeParse(repaired);
  console.log(
    label,
    r.success ? "OK" : "FAIL",
    `ui=${prepared.length} model=${repaired.length}`
  );
  if (!r.success) {
    for (const issue of r.error.issues.slice(0, 5)) {
      console.log(" ", JSON.stringify(issue.path), issue.message);
    }
    console.log(" sample:", JSON.stringify(repaired[0])?.slice(0, 200));
  }
}

await test("bare file in content", [
  {
    role: "user",
    parts: [],
    content: [{ type: "file", mediaType: "image/png", filename: "image.png" }],
  },
]);
await test("bare file in parts", [
  {
    role: "user",
    parts: [
      { type: "file", mediaType: "image/png", filename: "image.png" },
      { type: "text", text: "hi" },
    ],
  },
]);
await test("broken tool assistant", [
  {
    role: "assistant",
    parts: [
      {
        type: "tool-repository_search_documents",
        toolCallId: "",
        toolName: "repository_search_documents",
        state: "output-available",
        output: { type: "text", value: "x" },
      },
    ],
  },
]);
