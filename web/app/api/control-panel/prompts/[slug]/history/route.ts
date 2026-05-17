import { NextRequest, NextResponse } from "next/server";
import { getPromptHistory } from "@/lib/ai/prompt-store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const history = getPromptHistory(slug);
    return NextResponse.json({ slug, history });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
