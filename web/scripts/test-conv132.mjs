import Database from "better-sqlite3";
import { convertToModelMessages, modelMessageSchema } from "ai";
import { z } from "zod";
import { prepareUiMessagesForInference, repairModelMessages } from "../lib/chat-message-repair.ts";

const schema = z.array(modelMessageSchema);

const db = new Database("../data/journal.db");
const row = db.prepare("SELECT messages FROM chat_conversations WHERE id = 132").get();
if (!row?.messages) {
  console.error("Conversation 132 not found");
  process.exit(1);
}

const msgs = JSON.parse(row.messages);
const { messages: prepared, strippedReasoning } = prepareUiMessagesForInference(msgs, "openai");
console.log("stripped reasoning parts:", strippedReasoning);

const sanitized = prepared.filter((msg) => {
  if (Array.isArray(msg.parts) && msg.parts.length > 0) {
    return msg.parts.some((part) => {
      if (part.type === "text") return part.text?.trim().length > 0;
      if (part.type === "reasoning") return part.text?.trim().length > 0;
      if (part.type === "tool-call" || part.type === "tool-result") return true;
      if (part.type === "dynamic-tool" || (typeof part.type === "string" && part.type.startsWith("tool-"))) {
        return true;
      }
      if (part.type === "image") {
        const url = typeof part.url === "string" ? part.url : "";
        const image = typeof part.image === "string" ? part.image : "";
        return (image.length > 0 && !image.startsWith("blob:")) || (url.length > 0 && !url.startsWith("blob:"));
      }
      if (part.type === "file") {
        const url = typeof part.url === "string" ? part.url : "";
        return (url.length > 0 && !url.startsWith("blob:")) || part.data != null;
      }
      return false;
    });
  }
  return typeof msg.content === "string" && msg.content.trim().length > 0;
});

console.log("message counts:", { raw: msgs.length, prepared: prepared.length, sanitized: sanitized.length });

const rawModelMsgs = await convertToModelMessages(sanitized);
const modelMsgs = repairModelMessages(rawModelMsgs);

for (const label of ["raw", "repaired"]) {
  const arr = label === "raw" ? rawModelMsgs : modelMsgs;
  const result = schema.safeParse(arr);
  if (!result.success) {
    console.error(`SCHEMA FAIL (${label}):`, result.error.issues.length, "issues");
    for (const issue of result.error.issues.slice(0, 10)) {
      console.error(" ", JSON.stringify(issue.path), issue.message.slice(0, 80));
    }
    process.exit(1);
  }
  console.log(`SCHEMA OK (${label}):`, arr.length, "messages");
}

console.log("SUCCESS — model messages:", modelMsgs.length);
