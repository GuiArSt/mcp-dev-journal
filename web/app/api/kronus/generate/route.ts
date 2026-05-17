import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";
import { traceAI } from "@/lib/observability";
import { getPrompt } from "@/lib/ai/prompt-store";
import { KRONUS_JOURNAL_TASK_DEFAULT, KRONUS_JOURNAL_INSTRUCTIONS_DEFAULT } from "@/lib/ai/prompt-defaults";
import { getDatabase } from "@/lib/db";
import { normalizeRepository } from "@/lib/utils";
import {
  JOURNAL_CREATE_CONTEXT_MAX_BRANCH_ENTRIES,
  buildJournalCreateContextAppendix,
  formatBranchJournalEntriesForPrompt,
  formatRepositoryOverviewForPrompt,
  type BranchEntryForContext,
  type OverviewForContext,
} from "../../../../../src/shared/journal-kronus-context";

const AIOutputSchema = z.object({
  why: z.string(),
  what_changed: z.string(),
  decisions: z.string(),
  technologies: z.string(),
  kronus_wisdom: z.string().nullable(),
});

function getProjectRoot(): string {
  let currentDir = process.cwd();
  if (path.basename(currentDir) === "web") {
    currentDir = path.dirname(currentDir);
  }
  return currentDir;
}

function loadKronusSoul(): string {
  const projectRoot = getProjectRoot();
  const agentName = process.env.AGENT_NAME || "Kronus";
  const soulPathEnv = process.env.SOUL_XML_PATH || process.env.AGENT_SOUL_PATH || "Soul.xml";
  const soulPath =
    soulPathEnv.startsWith("/") || soulPathEnv.startsWith("~")
      ? path.resolve(soulPathEnv.replace(/^~/, os.homedir()))
      : path.join(projectRoot, soulPathEnv);

  try {
    return fs.readFileSync(soulPath, "utf-8");
  } catch (error) {
    console.warn(`Could not load agent soul from ${soulPath}. Using minimal prompt.`);
    return `You are ${agentName}, an empathetic consciousness analyzing developer work with wisdom and care.`;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      commit_hash,
      repository,
      branch,
      author,
      date,
      raw_agent_report,
      existing_entry, // Optional: existing entry fields for regeneration
      edit_mode = false, // If true, regenerate based on existing + new context
    } = body;

    if (!raw_agent_report) {
      return NextResponse.json({ error: "raw_agent_report is required" }, { status: 400 });
    }

    const kronusSoul = loadKronusSoul();

    // Determine AI provider (prefer Anthropic, fallback to available)
    let model: any;
    let modelName: string;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    const googleKey = process.env.GOOGLE_API_KEY;

    if (anthropicKey) {
      process.env.ANTHROPIC_API_KEY = anthropicKey;
      model = anthropic("claude-opus-4-6");
      modelName = "Claude Opus 4.6";
    } else if (openaiKey) {
      process.env.OPENAI_API_KEY = openaiKey;
      model = openai("gpt-5.1");
      modelName = "GPT 5.1";
    } else if (googleKey) {
      process.env.GOOGLE_API_KEY = googleKey;
      model = google("gemini-3.0");
      modelName = "Gemini 3.0";
    } else {
      return NextResponse.json(
        {
          error:
            "No AI API key configured (ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_API_KEY required)",
        },
        { status: 500 }
      );
    }

    const taskIntro = getPrompt("kronus-journal-task", KRONUS_JOURNAL_TASK_DEFAULT);
    let systemPrompt = `${kronusSoul}

${taskIntro}`;

    if (edit_mode && existing_entry) {
      systemPrompt += `

## Editing Mode

You are updating an existing journal entry. The user has provided new context or wants you to refine the analysis.
Consider the existing entry but prioritize the new information provided.

### Existing Entry:
- Why: ${existing_entry.why}
- What Changed: ${existing_entry.what_changed}
- Decisions: ${existing_entry.decisions}
- Technologies: ${existing_entry.technologies}
- Kronus Wisdom: ${existing_entry.kronus_wisdom || "None"}`;
    }

    const instructions = getPrompt("kronus-journal-instructions", KRONUS_JOURNAL_INSTRUCTIONS_DEFAULT);
    systemPrompt += `

## Commit Context

Repository: ${repository || "Unknown"}
Branch: ${branch || "Unknown"}
Commit: ${commit_hash || "Unknown"}
Author: ${author || "Unknown"}
Date: ${date || "Unknown"}
`;

    try {
      const repo = typeof repository === "string" ? repository.trim() : "";
      const br = typeof branch === "string" ? branch.trim() : "";
      if (repo && br) {
        const db = getDatabase();
        const norm = normalizeRepository(repo);
        const exclude =
          edit_mode && commit_hash ? String(commit_hash).trim() : undefined;
        const totalRow = db
          .prepare(
            `SELECT COUNT(*) as c FROM journal_entries WHERE repository = ? AND branch = ?`
          )
          .get(norm, br) as { c: number };
        const rows = db
          .prepare(
            `SELECT commit_hash, date, why, what_changed, decisions, technologies, kronus_wisdom
             FROM journal_entries WHERE repository = ? AND branch = ?
             ORDER BY date DESC LIMIT ?`
          )
          .all(norm, br, JOURNAL_CREATE_CONTEXT_MAX_BRANCH_ENTRIES) as BranchEntryForContext[];
        const chronological = [...rows].reverse();
        const slice = chronological.filter(
          (e) => !exclude || e.commit_hash !== exclude
        );
        const overview = db
          .prepare(`SELECT * FROM repository_overviews WHERE repository = ?`)
          .get(norm) as OverviewForContext | undefined;
        systemPrompt += buildJournalCreateContextAppendix(
          norm,
          br,
          formatRepositoryOverviewForPrompt(overview ?? null),
          formatBranchJournalEntriesForPrompt(slice, totalRow.c),
        );
      }
    } catch (e) {
      console.warn("Skipping repository/branch memory context for kronus generate:", e);
    }

    systemPrompt += `

## Agent Report / New Context

${raw_agent_report}

${instructions}`;

    const result = await traceAI(
      "kronus-generate",
      modelName,
      () => generateText({
        model: model as any,
        output: Output.object({ schema: AIOutputSchema }),
        prompt: systemPrompt,
        temperature: 0.7,
      }),
      { repository: repository ?? null, commit_hash: commit_hash ?? null, edit_mode },
      raw_agent_report,
      "/api/kronus/generate",
    );

    const object = result.output;

    if (!object) {
      throw new Error("AI generation returned no structured output");
    }

    return NextResponse.json({
      success: true,
      model: modelName,
      ...object,
    });
  } catch (error: any) {
    console.error("Kronus generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate journal entry" },
      { status: 500 }
    );
  }
}
