import { NextRequest, NextResponse } from "next/server";
import { getMuseConfig, setMuseConfig } from "@/lib/ai/prompt-store";
import type { MuseConfig } from "@/lib/ai/prompt-store";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(getMuseConfig());
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<Omit<MuseConfig, "updatedAt">>;
    const updated = setMuseConfig(body);
    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
