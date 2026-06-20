import Database from "better-sqlite3";
import { convertToModelMessages, modelMessageSchema } from "ai";
import { z } from "zod";
import { prepareUiMessagesForInference, repairModelMessages } from "../lib/chat-message-repair.ts";

const schema = z.array(modelMessageSchema);
const db = new Database("../data/journal.db");
const msgs = JSON.parse(db.prepare("SELECT messages FROM chat_conversations WHERE id = 132").get().messages);

function findBareFiles(modelMsgs, label) {
  for (let i = 0; i < modelMsgs.length; i++) {
    const m = modelMsgs[i];
    if (!Array.isArray(m.content)) continue;
    for (const p of m.content) {
      if (p.type === "file" && p.data == null && !p.url) {
        console.log(`[${label}] bare file at model idx ${i}:`, JSON.stringify(p));
      }
    }
  }
}

const raw = await convertToModelMessages(msgs);
const rawFail = schema.safeParse(raw);
console.log("WITHOUT prepare:", rawFail.success ? "OK" : `FAIL ${rawFail.error.issues.length}`);
findBareFiles(raw, "raw");

const { messages: prep } = prepareUiMessagesForInference(msgs, "openai");
const afterPrep = await convertToModelMessages(prep);
console.log("AFTER prepare:", schema.safeParse(afterPrep).success ? "OK" : "FAIL");
findBareFiles(afterPrep, "afterPrep");

const repaired = repairModelMessages(afterPrep);
console.log("AFTER repair:", schema.safeParse(repaired).success ? "OK" : "FAIL");
findBareFiles(repaired, "repaired");

// Show UI messages with file parts
msgs.forEach((m, i) => {
  const parts = m.parts ?? m.content;
  if (!Array.isArray(parts)) return;
  for (const p of parts) {
    if (p?.type === "file" && !p.url && p.data == null) {
      console.log(`UI msg ${i} role=${m.role} bare file:`, JSON.stringify(p).slice(0, 120));
    }
  }
});
