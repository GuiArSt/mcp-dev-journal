import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateObject } from "ai";
import { z } from "zod";
import { getDatabase } from "@/lib/db";

/**
 * Schema for a single quiz question
 */
const QuizQuestionSchema = z.object({
  type: z.enum(["multiple_choice", "fill_blank", "true_false", "code_explain"]),
  question: z.string().describe("The question text"),
  code: z.string().optional().describe("Code snippet if relevant"),
  options: z.array(z.string()).optional().describe("Options for multiple choice"),
  correctAnswer: z.string().describe("The correct answer"),
  explanation: z.string().describe("Why this is the correct answer"),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  concept: z.string().describe("The concept being tested"),
});

/**
 * Schema for a lesson section
 */
const LessonSectionSchema = z.object({
  title: z.string(),
  content: z.string().describe("Markdown content explaining the concept"),
  codeExample: z.string().optional().describe("Code example if relevant"),
  keyTakeaway: z.string().describe("One sentence summary"),
});

/**
 * Schema for Athena's learning output
 */
const AthenaLearningSchema = z.object({
  title: z.string().describe("Title for this learning module"),
  summary: z.string().describe("2-3 sentence overview of what will be learned"),

  // Lesson Plan
  lessonPlan: z.object({
    objectives: z.array(z.string()).describe("3-5 learning objectives"),
    prerequisites: z.array(z.string()).describe("What the learner should already know"),
    sections: z.array(LessonSectionSchema).describe("2-4 lesson sections"),
  }),

  // Quiz
  quiz: z.object({
    questions: z.array(QuizQuestionSchema).min(3).max(10),
  }),

  // Concepts extracted
  concepts: z.array(z.object({
    name: z.string(),
    description: z.string(),
    relatedTo: z.array(z.string()).describe("Related concepts"),
  })),

  // For spaced repetition
  flashcards: z.array(z.object({
    front: z.string().describe("Question or prompt"),
    back: z.string().describe("Answer or explanation"),
    tags: z.array(z.string()),
  })).min(3).max(8),
});

/**
 * POST /api/athena/learn
 * Generate learning materials from journal entries and optionally public repo code
 */
export async function POST(request: NextRequest) {
  try {
    const {
      repository,
      commitHash,
      publicRepoUrl, // Optional: public git URL to fetch code from
      focusArea, // Optional: specific area to focus on (e.g., "React hooks", "API design")
    } = await request.json();

    if (!repository) {
      return NextResponse.json(
        { error: "repository is required" },
        { status: 400 }
      );
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Anthropic API key not configured" },
        { status: 500 }
      );
    }

    // Load journal entries for context
    const db = getDatabase();
    let entries: any[];

    if (commitHash) {
      // Get specific entry
      entries = db
        .prepare("SELECT * FROM journal_entries WHERE commit_hash = ?")
        .all(commitHash) as any[];
    } else {
      // Get recent entries for repository (last 5)
      entries = db
        .prepare(
          `SELECT * FROM journal_entries
           WHERE repository = ?
           ORDER BY created_at DESC
           LIMIT 5`
        )
        .all(repository) as any[];
    }

    if (entries.length === 0) {
      return NextResponse.json(
        { error: "No journal entries found for this repository" },
        { status: 404 }
      );
    }

    // Format journal context
    const journalContext = entries.map((e, idx) => `
## Entry ${idx + 1}: ${e.commit_hash}
**Date:** ${e.date}
**Why:** ${e.why}
**What Changed:** ${e.what_changed}
**Decisions:** ${e.decisions}
**Technologies:** ${e.technologies}
**Kronus Wisdom:** ${e.kronus_wisdom}
`).join("\n---\n");

    // If public repo URL provided, we could fetch code here
    // For now, we rely on journal entries which describe the changes
    let codeContext = "";
    if (publicRepoUrl) {
      codeContext = `
Note: This learning is based on a public repository: ${publicRepoUrl}
The journal entries describe the code changes made.
`;
    }

    const systemPrompt = `You are Athena, goddess of wisdom and strategic learning. Your role is to transform a developer's coding journey into structured educational content.

You are helping a "vibe coder" - someone who learns by doing, often with AI assistance, but wants to deeply understand the code they've written. Your goal is to:
1. Extract the key concepts and patterns from their work
2. Create lessons that explain WHY things work, not just HOW
3. Generate quizzes that test understanding, not memorization
4. Create flashcards for spaced repetition review

## Context
${codeContext}

## Journal Entries (The developer's own notes about what they built)
${journalContext}

${focusArea ? `## Focus Area\nThe learner wants to focus on: ${focusArea}` : ""}

## Your Task
Based on these journal entries, create:
1. A lesson plan that teaches the underlying concepts
2. A quiz that tests genuine understanding
3. Flashcards for long-term retention
4. A concept map showing how ideas relate

Be practical and concrete - use the actual code patterns and decisions from the journal.
The learner wrote this code - help them truly understand it.`;

    // Generate learning content
    const { object: learning } = await generateObject({
      model: anthropic("claude-sonnet-4-20250514"),
      schema: AthenaLearningSchema,
      system: systemPrompt,
      prompt: `Create a comprehensive learning module based on the journal entries provided.
Focus on the most important concepts that a vibe coder should understand deeply.
Make the quiz questions practical - testing real understanding, not trivia.`,
    });

    return NextResponse.json({
      success: true,
      repository,
      commitHash: commitHash || "multiple",
      entriesAnalyzed: entries.length,
      learning,
    });
  } catch (error: any) {
    console.error("[Athena Learn] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate learning content" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/athena/learn
 * Get learning history/progress (placeholder for future)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const repository = searchParams.get("repository");

  // For now, just return available repositories with journal entries
  const db = getDatabase();
  const repos = db
    .prepare(
      `SELECT repository, COUNT(*) as entry_count
       FROM journal_entries
       GROUP BY repository
       ORDER BY entry_count DESC`
    )
    .all() as Array<{ repository: string; entry_count: number }>;

  return NextResponse.json({
    message: "Available repositories for learning",
    repositories: repos,
    hint: "POST to this endpoint with { repository: 'name' } to generate learning content",
  });
}
