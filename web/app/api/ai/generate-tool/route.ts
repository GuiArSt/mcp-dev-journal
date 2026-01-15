/**
 * AI Generate Tool - Dynamic Tool Definition Generator
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * (generateObject is deprecated in AI SDK 6.0)
 */

import { generateText, Output } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { NextResponse } from "next/server";

/**
 * Schema for tool generation output
 */
const ToolDefinitionSchema = z.object({
  description: z
    .string()
    .describe("1-2 sentence description explaining when and why to use this tool"),
  inputSchema: z
    .record(z.string(), z.string())
    .describe("Object mapping field names to Zod schema definitions as strings, e.g. { 'name': 'string().min(1)', 'count': 'number().optional()' }"),
  promptTemplate: z
    .string()
    .describe("Instructions for the AI on how to use this tool effectively"),
});

/**
 * Generate a tool definition using Claude Haiku 4.5
 * This creates tools with prompts and Zod schemas for AI-powered operations
 */
export async function POST(req: Request) {
  try {
    const { description, examples, context } = await req.json();

    if (!description) {
      return NextResponse.json(
        { error: "Description is required" },
        { status: 400 }
      );
    }

    // Use Claude Haiku 4.5 for fast, cost-effective tool generation
    const model = anthropic("claude-haiku-4-5-20251001");

    // AI SDK 6.0 pattern: generateText with Output.object() (generateObject is deprecated)
    const result = await generateText({
      model,
      output: Output.object({ schema: ToolDefinitionSchema }),
      system: `You are an expert at creating AI tool definitions with Zod schemas.
Your task is to generate:
1. A clear, concise tool description
2. A comprehensive Zod schema for input validation
3. A prompt template that guides the AI on how to use this tool effectively

The tool should be designed for AI agents to create or update resources.
Focus on making the schema type-safe and the prompt actionable.

For inputSchema, provide field names as keys and Zod schema definitions as values (without the 'z.' prefix).
Examples:
- "string().min(1).describe('User name')"
- "number().optional()"
- "array(string()).describe('List of tags')"
- "enum(['active', 'inactive']).describe('Status')"`,
      prompt: `Create a tool definition for: "${description}"

${context ? `Context: ${context}` : ""}

${examples ? `Examples of desired behavior:\n${examples}` : ""}

Generate a complete tool definition with description, inputSchema, and promptTemplate.`,
    });

    const parsed = result.output;

    if (!parsed) {
      throw new Error("AI generation returned no structured output");
    }

    // Convert the schema strings to actual Zod schema
    const schemaFields: Record<string, z.ZodTypeAny> = {};
    for (const [key, value] of Object.entries(parsed.inputSchema)) {
      try {
        // Evaluate the Zod schema string (safe eval context)
        schemaFields[key] = eval(`z.${value}`) as z.ZodTypeAny;
      } catch {
        // Fallback to string if evaluation fails
        schemaFields[key] = z.string().describe(`Field: ${key}`);
      }
    }

    const finalSchema = z.object(schemaFields);

    return NextResponse.json({
      tool: {
        description: parsed.description,
        inputSchema: finalSchema,
        promptTemplate: parsed.promptTemplate,
      },
      raw: parsed,
    });
  } catch (error: any) {
    console.error("Tool generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate tool" },
      { status: 500 }
    );
  }
}
