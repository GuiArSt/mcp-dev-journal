import { NextResponse } from "next/server";
import { listPromptSlugs } from "@/lib/ai/prompt-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    const slugs = listPromptSlugs();
    return NextResponse.json({ prompts: slugs });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
