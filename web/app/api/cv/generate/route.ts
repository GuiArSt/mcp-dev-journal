/**
 * CV Generate - Resume Entry AI Generation
 *
 * Uses AI SDK 6.0 generateText with Output.object() for structured outputs
 * (generateObject is deprecated in AI SDK 6.0)
 */

import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import { z } from "zod";

const SkillSchema = z.object({
  id: z.string().describe("URL-friendly skill ID (e.g., 'prompt-engineering')"),
  name: z.string().describe("Skill name"),
  category: z.string().describe("Category (e.g., 'AI & Development', 'Design & Creative Production')"),
  magnitude: z.number().min(1).max(4).describe("Magnitude level: 1=Beginner, 2=Apprentice, 3=Professional, 4=Expert"),
  description: z.string().describe("Detailed description of the skill and experience level"),
  tags: z.array(z.string()).optional().describe("Relevant tags"),
  firstUsed: z.string().optional().describe("Year first used (e.g., '2023')"),
  lastUsed: z.string().optional().describe("Last used year or 'present'"),
});

const ExperienceSchema = z.object({
  id: z.string().describe("URL-friendly experience ID (e.g., 'jobilla-ai-engineer')"),
  title: z.string().describe("Job title"),
  company: z.string().describe("Company name"),
  department: z.string().optional().describe("Department"),
  location: z.string().describe("Location"),
  dateStart: z.string().describe("Start date in YYYY-MM format"),
  dateEnd: z.string().nullable().describe("End date in YYYY-MM format or null if current"),
  tagline: z.string().describe("Brief tagline describing the role"),
  note: z.string().optional().describe("Additional notes"),
  achievements: z.array(z.object({
    category: z.string().optional(),
    description: z.string(),
    metrics: z.string().optional(),
    tags: z.array(z.string()).optional(),
  })).describe("List of achievements and accomplishments"),
});

const EducationSchema = z.object({
  id: z.string().describe("URL-friendly education ID (e.g., 'oth-ba')"),
  degree: z.string().describe("Degree type (e.g., 'Bachelor of Arts (B.A.)')"),
  field: z.string().describe("Field of study"),
  institution: z.string().describe("Institution name"),
  location: z.string().describe("Location"),
  dateStart: z.string().describe("Start date in YYYY-MM format"),
  dateEnd: z.string().describe("End date in YYYY-MM format"),
  tagline: z.string().describe("Brief tagline"),
  note: z.string().optional().describe("Additional notes"),
  focusAreas: z.array(z.string()).describe("Focus areas or specializations"),
  achievements: z.array(z.string()).describe("List of achievements"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, ...input } = body;

    if (!type || !["skill", "experience", "education"].includes(type)) {
      return NextResponse.json({ error: "Invalid type. Must be 'skill', 'experience', or 'education'" }, { status: 400 });
    }

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 500 });
    }

    const model = anthropic("claude-sonnet-4-5-20250929");

    let schema: z.ZodTypeAny;
    let systemPrompt: string;
    let prompt: string;

    if (type === "skill") {
      schema = SkillSchema;
      systemPrompt = `You are Kronus, analyzing a skill description and generating a structured skill entry.
Extract the skill name, determine the appropriate category, assess the magnitude level (1-4), and create a comprehensive description.
Magnitude levels:
1 = Beginner - Elementary understanding, actively learning
2 = Apprentice - Can build with guidance/AI, functional knowledge
3 = Professional - Independent production work, proven output
4 = Expert - Mastery, can teach others, recognized expertise`;
      prompt = `Generate a skill entry from this description:

Name: ${input.name}
Description: ${input.description}
${input.category ? `Category hint: ${input.category}` : ""}

Create a complete skill entry with appropriate magnitude, category, and tags.`;
    } else if (type === "experience") {
      schema = ExperienceSchema;
      systemPrompt = `You are Kronus, analyzing work experience and generating a structured entry.
Extract key information, create achievements from the description, and structure dates properly.
Achievements should be specific, measurable, and organized by category when possible.`;
      prompt = `Generate a work experience entry from this description:

Company: ${input.company}
Title: ${input.title}
Description: ${input.description}

Create a complete work experience entry with achievements extracted from the description.`;
    } else {
      schema = EducationSchema;
      systemPrompt = `You are Kronus, analyzing education and generating a structured entry.
Extract degree, field, institution, dates, focus areas, and achievements from the description.`;
      prompt = `Generate an education entry from this description:

Institution: ${input.institution}
Degree: ${input.degree}
Description: ${input.description}

Create a complete education entry with focus areas and achievements extracted from the description.`;
    }

    // AI SDK 6.0 pattern: generateText with Output.object() (generateObject is deprecated)
    const result = await generateText({
      model,
      output: Output.object({ schema }),
      system: systemPrompt,
      prompt,
      temperature: 0.7,
    });

    const object = result.output;

    if (!object) {
      throw new Error("AI generation returned no structured output");
    }

    return NextResponse.json({
      success: true,
      data: object,
    });
  } catch (error: any) {
    console.error("CV generation error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate CV entry" },
      { status: 500 }
    );
  }
}
