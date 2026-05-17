import { NextResponse } from "next/server";
import { getPrompt, listPromptSlugs } from "@/lib/ai/prompt-store";
import { PROMPT_DEFAULTS } from "@/lib/ai/prompt-defaults";

export const runtime = "nodejs";

/**
 * Ensures every known prompt slug is seeded in the DB.
 * Called by the control panel on load so the UI shows ALL editable prompts
 * even if they haven't been triggered by an actual request yet.
 */
export async function POST() {
  try {
    for (const def of PROMPT_DEFAULTS) {
      // kronus-soul is special: its default is loaded from Soul.xml at runtime by
      // loadKronusSoulFromStore(). We skip seeding here when defaultContent is
      // empty so the runtime path can do it correctly.
      if (def.defaultContent && def.defaultContent.trim()) {
        getPrompt(def.slug, def.defaultContent);
      }
    }
    const seeded = listPromptSlugs();
    return NextResponse.json({ ok: true, seeded });
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ defaults: PROMPT_DEFAULTS.map((d) => ({ slug: d.slug, name: d.name, category: d.category, description: d.description })) });
}
