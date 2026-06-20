import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireParams, requireBody } from "@/lib/validations";
import { stringIdParamSchema, updateExperienceSchema } from "@/lib/validations/schemas";
import { NotFoundError, ValidationError } from "@/lib/errors";

/**
 * Generate AI summary for work experience (async, non-blocking)
 */
async function generateExperienceSummary(expId: string, exp: any): Promise<void> {
  try {
    const achievements =
      typeof exp.achievements === "string"
        ? JSON.parse(exp.achievements || "[]")
        : exp.achievements || [];
    const content = `
Position: ${exp.title} at ${exp.company}
${exp.department ? `Department: ${exp.department}` : ""}
Location: ${exp.location}
Period: ${exp.dateStart} - ${exp.dateEnd || "Present"}
Role Summary: ${exp.tagline}
${exp.note ? `Notes: ${exp.note}` : ""}
${achievements.length ? `Key Achievements:\n${achievements.map((a: string) => `- ${a}`).join("\n")}` : ""}
    `.trim();

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3005"}/api/ai/summarize`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "work_experience",
          title: `${exp.title} at ${exp.company}`,
          content,
          metadata: { company: exp.company, dateStart: exp.dateStart, dateEnd: exp.dateEnd },
        }),
      }
    );

    if (response.ok) {
      const { summary } = await response.json();
      const db = getDatabase();
      db.prepare("UPDATE work_experience SET summary = ?, summary_updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(summary, expId);
    }
  } catch (error) {
    console.error("Failed to generate experience summary:", error);
  }
}

/**
 * GET /api/cv/experience/[id]
 *
 * Get a work experience entry by ID.
 */
export const GET = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();

    const exp = db.prepare("SELECT * FROM work_experience WHERE id = ?").get(id) as any;
    if (!exp) {
      throw new NotFoundError("Work experience", id);
    }

    return NextResponse.json({
      ...exp,
      achievements: JSON.parse(exp.achievements || "[]"),
    });
  }
);

/**
 * PUT /api/cv/experience/[id]
 *
 * Update a work experience entry.
 */
export const PUT = withErrorHandler(
  async (request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();
    const body = await requireBody(updateExperienceSchema, request);

    const existing = db.prepare("SELECT * FROM work_experience WHERE id = ?").get(id);
    if (!existing) {
      throw new NotFoundError("Work experience", id);
    }

    const updates: string[] = [];
    const values: any[] = [];

    if (body.title !== undefined) {
      updates.push("title = ?");
      values.push(body.title);
    }
    if (body.company !== undefined) {
      updates.push("company = ?");
      values.push(body.company);
    }
    if (body.department !== undefined) {
      updates.push("department = ?");
      values.push(body.department || null);
    }
    if (body.location !== undefined) {
      updates.push("location = ?");
      values.push(body.location);
    }
    if (body.dateStart !== undefined) {
      updates.push("dateStart = ?");
      values.push(body.dateStart);
    }
    if (body.dateEnd !== undefined) {
      updates.push("dateEnd = ?");
      values.push(body.dateEnd || null);
    }
    if (body.tagline !== undefined) {
      updates.push("tagline = ?");
      values.push(body.tagline);
    }
    if (body.note !== undefined) {
      updates.push("note = ?");
      values.push(body.note || null);
    }
    if (body.achievements !== undefined) {
      updates.push("achievements = ?");
      values.push(JSON.stringify(body.achievements));
    }
    if (body.logo !== undefined) {
      updates.push("logo = ?");
      values.push(body.logo || null);
    }

    if (updates.length === 0) {
      throw new ValidationError("No fields to update");
    }

    values.push(id);
    db.prepare(`UPDATE work_experience SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM work_experience WHERE id = ?").get(id) as any;

    // Regenerate summary if content-related fields changed
    const contentChanged =
      body.title !== undefined ||
      body.company !== undefined ||
      body.tagline !== undefined ||
      body.achievements !== undefined;
    if (contentChanged) {
      generateExperienceSummary(id, updated).catch(console.error);
    }

    return NextResponse.json({
      ...updated,
      achievements: JSON.parse(updated.achievements || "[]"),
    });
  }
);

/**
 * DELETE /api/cv/experience/[id]
 *
 * Delete a work experience entry.
 */
export const DELETE = withErrorHandler(
  async (_request: NextRequest, context?: { params: Promise<{ id: string }> }) => {
    const resolvedParams = await context?.params;
    const { id } = requireParams(stringIdParamSchema, resolvedParams);
    const db = getDatabase();

    const result = db.prepare("DELETE FROM work_experience WHERE id = ?").run(id);
    if (result.changes === 0) {
      throw new NotFoundError("Work experience", id);
    }

    return NextResponse.json({ success: true });
  }
);
