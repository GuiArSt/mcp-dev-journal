import { Agent } from "@cursor/sdk";
import { redactSecrets } from "@/lib/ai-integrations";

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
}

/**
 * Run a one-shot Cursor local agent against `root` and return final assistant text.
 * Caller must ensure `root` is an allowed project path.
 */
export async function runCursorRepositoryInsight(root: string, question: string): Promise<string> {
  const apiKey = process.env.CURSOR_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("CURSOR_API_KEY is not set (server env). Add it in web/.env.local.");
  }

  const modelId = process.env.CURSOR_DELEGATE_MODEL?.trim() || "composer-2";
  const maxMs = Number(process.env.CURSOR_DELEGATE_TIMEOUT_MS) || 120_000;
  const maxChars = Number(process.env.CURSOR_DELEGATE_MAX_OUTPUT_CHARS) || 80_000;

  const prompt =
    "You are helping another AI answer a question about this repository. " +
    "Answer concisely and accurately. Prefer file paths and symbol names when useful.\n\n" +
    "Question:\n" +
    question;

  const runPromise = Agent.prompt(prompt, {
    apiKey,
    model: { id: modelId },
    local: { cwd: root },
  });

  const result = await withTimeout(runPromise, maxMs, "cursor_repository_insight");

  let text = (result.result ?? "").trim();
  if (!text && result.status === "error") {
    text = "Cursor agent run ended with error status (no body text).";
  }
  if (text.length > maxChars) {
    text = `${text.slice(0, maxChars)}\n\n[truncated to ${maxChars} chars]`;
  }

  const redacted = redactSecrets(text);
  return typeof redacted === "string" ? redacted : text;
}
