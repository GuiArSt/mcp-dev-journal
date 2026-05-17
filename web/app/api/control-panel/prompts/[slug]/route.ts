import { NextRequest, NextResponse } from "next/server";
import { getActiveVersion, upsertPrompt } from "@/lib/ai/prompt-store";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const active = getActiveVersion(slug);
    if (!active) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(active);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = (await req.json()) as { content?: string; label?: string };
    if (!body.content || typeof body.content !== "string") {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    const version = upsertPrompt(slug, body.content, { label: body.label ?? "draft" });
    return NextResponse.json({ slug, version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
