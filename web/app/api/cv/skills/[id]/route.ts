import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updateSkillSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Generate AI summary for a skill (async, non-blocking)
 */
async function generateSkillSummary(skillId: string, skill: any): Promise<void> {
  try {
    const tags = typeof skill.tags === "string" ? JSON.parse(skill.tags || "[]") : skill.tags || [];
    const content = `
Skill: ${skill.name}
Category: ${skill.category}
Proficiency: ${skill.magnitude}/5
Description: ${skill.description}
${tags.length ? `Tags: ${tags.join(", ")}` : ""}
${skill.firstUsed ? `First used: ${skill.firstUsed}` : ""}
${skill.lastUsed ? `Last used: ${skill.lastUsed}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "skill",
          title: skill.name,
          content,
          metadata: { category: skill.category, magnitude: skill.magnitude },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDatabase();
      db.prepare("UPDATE skills SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, skillId);
    }
  } catch (error) {
    console.error("Failed to generate skill summary:", error);
  }
}

/**
 * GET /api/cv/skills/[id]
 *
 * Get a skill by ID.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();

    const skill = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as any;
    if (!skill) {
      throw new NotFoundError("Skill", id);
    }

    return NextResponse.json({
      ...skill,
      tags: JSON.parse(skill.tags || "[]"),
    });
  }
);

/**
 * PUT /api/cv/skills/[id]
 *
 * Update a skill.
 */
export const PUT = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();
    const body = await requireBody(updateSkillSchema, request);

    const existing = db.prepare("SELECT * FROM skills WHERE id = ?").get(id);
    if (!existing) {
      throw new NotFoundError("Skill", id);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (body.name !== undefined) {
      updates.push("name = ?");
      values.push(body.name);
    }
    if (body.category !== undefined) {
      updates.push("category = ?");
      values.push(body.category);
    }
    if (body.magnitude !== undefined) {
      updates.push("magnitude = ?");
      values.push(body.magnitude);
    }
    if (body.description !== undefined) {
      updates.push("description = ?");
      values.push(body.description);
    }
    if (body.icon !== undefined) {
      updates.push("icon = ?");
      values.push(body.icon || null);
    }
    if (body.color !== undefined) {
      updates.push("color = ?");
      values.push(body.color || null);
    }
    if (body.url !== undefined) {
      updates.push("url = ?");
      values.push(body.url || null);
    }
    if (body.tags !== undefined) {
      updates.push("tags = ?");
      values.push(JSON.stringify(body.tags));
    }
    if (body.firstUsed !== undefined) {
      updates.push("firstUsed = ?");
      values.push(body.firstUsed || null);
    }
    if (body.lastUsed !== undefined) {
      updates.push("lastUsed = ?");
      values.push(body.lastUsed || null);
    }

    if (updates.length === 0) {
      throw new ValidationError("No fields to update");
    }

    values.push(id);
    db.prepare(`UPDATE skills SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM skills WHERE id = ?").get(id) as any;

    // Regenerate summary if content-related fields changed
    const contentChanged =
      body.name !== undefined ||
      body.description !== undefined ||
      body.category !== undefined ||
      body.magnitude !== undefined;
    if (contentChanged) {
      generateSkillSummary(id, updated).catch(console.error);
    }

    return NextResponse.json({
      ...updated,
      tags: JSON.parse(updated.tags || "[]"),
    });
  }
);

/**
 * DELETE /api/cv/skills/[id]
 *
 * Delete a skill.
 */
export const DELETE = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();

    const result = db.prepare("DELETE FROM skills WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Skill", id);
    }

    return NextResponse.json({ success: true });
  }
);
