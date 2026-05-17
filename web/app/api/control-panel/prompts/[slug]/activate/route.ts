import { NextRequest, NextResponse } from "next/server";
import { activateVersion } from "@/lib/ai/prompt-store";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  try {
    const body = (await req.json()) as { version?: number };
    if (typeof body.version !== "number") {
      return NextResponse.json({ error: "version (number) required" }, { status: 400 });
    }
    activateVersion(slug, body.version);
    return NextResponse.json({ slug, activeVersion: body.version });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
