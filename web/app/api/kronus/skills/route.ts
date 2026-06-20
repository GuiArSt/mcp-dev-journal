import { NextResponse } from "next/server";
import { getDrizzleDb, documents } from "@/lib/db/drizzle";
import { eq } from "drizzle-orm";
import type { SkillInfo, SkillConfig } from "@/lib/ai/skills";
import { estimateTokens } from "@/lib/chat-text-cleaner";

/**
 * GET /api/kronus/skills
 * Returns all available Kronus skills (documents with metadata.type = "kronus-skill")
 * Sorted by priority. Does NOT return full content (only metadata for UI).
 */
export async function GET() {
  try {
    const db = getDrizzleDb();

    // Query all prompt documents
    const docs = db
      .select()
      .from(documents)
      .where(eq(documents.type, "prompt"))
      .all();

    // Filter to kronus-skill type and map to SkillInfo
    const skillDocs = docs.filter((d) => {
      try {
        const meta = JSON.parse(d.metadata || "{}");
        return meta.type === "kronus-skill" && meta.skillConfig;
      } catch {
        return false;
      }
    });

    const skills: SkillInfo[] = skillDocs.map((d) => {
      const meta = JSON.parse(d.metadata || "{}");
      const config: SkillConfig = meta.skillConfig || { soul: {}, tools: {} };

      return {
        id: d.id,
        slug: d.slug,
        title: d.title,
        description: d.summary || d.content.substring(0, 120) + "...",
        icon: config.icon || "Zap",
        color: config.color || "#00CED1",
        priority: config.priority ?? 50,
        config,
        tokenEstimate: estimateTokens(d.content),
      };
    });

    // Sort by priority (lower = first)
    skills.sort((a, b) => a.priority - b.priority);

    return NextResponse.json({ skills });
  } catch (error: any) {
    console.error("[Skills API] Error:", error);
    return NextResponse.json(
      { error: "Failed to load skills", details: error.message },
      { status: 500 }
    );
  }
}
