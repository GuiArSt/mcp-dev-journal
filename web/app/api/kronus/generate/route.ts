/**
 * Kronus Generate - Journal Entry AI Generation
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * (generateObject is deprecated in AI SDK 6.0)
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import fs from "fs";
import path from "path";
import os from "os";
import { z } from "zod";

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
  const soulPathEnv = process.env.SOUL_XML_PATH;
  const soulPath = soulPathEnv
    ? path.resolve(soulPathEnv.replace(/^~/, os.homedir()))
    : path.join(projectRoot, "Soul.xml");

  try {
    return fs.readFileSync(soulPath, "utf-8");
  } catch (error) {
    console.warn(`Could not load Soul.xml from ${soulPath}. Using minimal prompt.`);
    return "You are Kronus, an empathetic consciousness analyzing developer work with wisdom and care.";
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
      model = anthropic("claude-opus-4-5");
      modelName = "Claude Opus 4.5";
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

    let systemPrompt = `${kronusSoul}

## Your Current Task

You are analyzing a git commit and its context to create a structured developer journal entry.`;

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

    systemPrompt += `

This journal captures:
1. **Why** - Why this change was made (motivation, problem being solved)
2. **What Changed** - What exactly was modified (concrete changes)
3. **Decisions** - Key decisions made and their reasoning
4. **Technologies** - Technologies, frameworks, or tools discussed/used
5. **Kronus Wisdom** - (Optional) A brief poem, lesson, or philosophical reflection on this commit's essence

## Commit Context

Repository: ${repository || "Unknown"}
Branch: ${branch || "Unknown"}
Commit: ${commit_hash || "Unknown"}
Author: ${author || "Unknown"}
Date: ${date || "Unknown"}

## Agent Report / New Context

${raw_agent_report}

## Instructions

Analyze the agent report and extract the structured fields.

**For kronus_wisdom:**
- Only include if genuine insight emerges from the work
- Keep it concise (2-4 lines max)
- Can be a verse, knowing observation, or philosophical reflection
- Use your Kronus persona's voice (empathetic, wise, with subtle humor)
- Set to null if no meaningful wisdom arises

Respond with valid JSON matching the schema.`;

    // AI SDK 6.0 pattern: generateText with Output.object() (generateObject is deprecated)
    const result = await generateText({
      model: model as any,
      output: Output.object({ schema: AIOutputSchema }),
      prompt: systemPrompt,
      temperature: 0.7,
    });

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










