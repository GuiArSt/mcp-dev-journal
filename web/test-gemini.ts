import { google } from "@ai-sdk/google";
import { generateText } from "ai";

async function test() {
  console.log("Testing Gemini 3 Pro connection...");
  console.log("GOOGLE_API_KEY set:", !!process.env.GOOGLE_API_KEY);
  
  const model = google("gemini-3-pro-preview");
  
  const result = await generateText({
    model,
    prompt: "Say hello in one sentence.",
  });
  
  console.log("Response:", result.text);
}

test().catch(console.error);
