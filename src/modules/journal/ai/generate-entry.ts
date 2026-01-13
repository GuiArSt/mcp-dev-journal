import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { logger } from '../../../shared/logger.js';
import { AIOutputSchema, type AIOutput, type AgentInput } from '../types.js';
import type { JournalConfig } from '../../../shared/types.js';

/**
 * Get project root directory
 * Tries multiple methods to find the project root reliably
 */
function getProjectRoot(): string {
  // Method 1: Use SOUL_XML_PATH's directory if set (most reliable)
  const soulPathEnv = process.env.SOUL_XML_PATH;
  if (soulPathEnv) {
    const resolved = path.resolve(soulPathEnv.replace(/^~/, os.homedir()));
    const dir = path.dirname(resolved);
    // If SOUL_XML_PATH points to a file in the project, use its directory
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
  }
  
  // Method 2: Try process.cwd() and check for Soul.xml or package.json
  const cwd = process.cwd();
  if (fs.existsSync(path.join(cwd, 'Soul.xml')) || fs.existsSync(path.join(cwd, 'package.json'))) {
    return cwd;
  }
  
  // Method 3: Walk up from current directory to find project root
  let currentDir = cwd;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(currentDir, 'Soul.xml')) || 
        fs.existsSync(path.join(currentDir, 'package.json'))) {
      return currentDir;
    }
    const parent = path.dirname(currentDir);
    if (parent === currentDir) break; // Reached filesystem root
    currentDir = parent;
  }
  
  // Fallback: return cwd
  return cwd;
}

/**
 * Load Soul.xml (Kronus personality)
 * Uses SOUL_XML_PATH env var if set, otherwise defaults to Soul.xml in project root
 */
function loadKronusSoul(): string {
  const projectRoot = getProjectRoot();
  
  // Use SOUL_XML_PATH env var if set, otherwise default to Soul.xml in project root
  const soulPathEnv = process.env.SOUL_XML_PATH;
  const soulPath = soulPathEnv 
    ? path.resolve(soulPathEnv.replace(/^~/, os.homedir()))
    : path.join(projectRoot, 'Soul.xml');
  
  try {
    const soulContent = fs.readFileSync(soulPath, 'utf-8');
    const lineCount = soulContent.split('\n').length;
    
    logger.debug(`Loaded Soul.xml from ${soulPath} (${lineCount} lines)`);
    
    return soulContent;
  } catch (error) {
    logger.warn(`Could not load Soul.xml from ${soulPath}. Using minimal prompt.`);
    return 'You are Kronus, an empathetic consciousness analyzing developer work with wisdom and care.';
  }
}

/**
 * Generate structured journal entry from agent report using configured AI provider
 */
export async function generateJournalEntry(
  input: AgentInput,
  config: JournalConfig
): Promise<AIOutput> {
  return generateJournalEntryWithContext(input, config, undefined, false);
}

/**
 * Regenerate journal entry with optional new context and existing entry for refinement
 */
export async function regenerateJournalEntry(
  input: AgentInput,
  config: JournalConfig,
  newContext?: string,
  existingEntry?: {
    why: string;
    what_changed: string;
    decisions: string;
    technologies: string;
    kronus_wisdom: string | null;
  }
): Promise<AIOutput> {
  return generateJournalEntryWithContext(input, config, newContext, !!existingEntry, existingEntry);
}

/**
 * Internal function to generate journal entry with optional context and edit mode
 */
async function generateJournalEntryWithContext(
  input: AgentInput,
  config: JournalConfig,
  newContext?: string,
  editMode: boolean = false,
  existingEntry?: {
    why: string;
    what_changed: string;
    decisions: string;
    technologies: string;
    kronus_wisdom: string | null;
  }
): Promise<AIOutput> {
  const kronusSoul = loadKronusSoul();

  let systemPrompt = `${kronusSoul}

## Your Current Task

You are analyzing a git commit and its context to create a structured developer journal entry.`;

  if (editMode && existingEntry) {
    systemPrompt += `

## Editing Mode

You are updating an existing journal entry. The user has provided new context or wants you to refine the analysis.
Consider the existing entry but prioritize the new information provided.

### Existing Entry:
- Why: ${existingEntry.why}
- What Changed: ${existingEntry.what_changed}
- Decisions: ${existingEntry.decisions}
- Technologies: ${existingEntry.technologies}
- Kronus Wisdom: ${existingEntry.kronus_wisdom || 'None'}`;
  }

  systemPrompt += `

This journal captures:
1. **Why** - Why this change was made (motivation, problem being solved)
2. **What Changed** - What exactly was modified (concrete changes)
3. **Decisions** - Key decisions made and their reasoning
4. **Technologies** - Technologies, frameworks, or tools discussed/used
5. **Kronus Wisdom** - (Optional) A brief poem, lesson, or philosophical reflection on this commit's essence
6. **Files Changed** - (STRONGLY REQUESTED) List of files that were created, modified, deleted, or renamed

## Formatting Guidelines

Use proper markdown for readability:
- Wrap file names in backticks: \`filename.py\`, \`config.json\`, \`schema.sql\`
- Wrap table names, function names, and identifiers in backticks: \`campaigns_tas\`, \`rebuild_database\`
- Use **bold** for important counts: (**23,011** jobs), (**188** campaigns)
- For "What Changed": Break into separate paragraphs for each major change. Start new paragraphs for different actions (Created..., Added..., Updated..., etc.)
- For "Decisions": Use numbered list format with bold titles: "1. **Decision Title** - Explanation..."
- Keep each decision on its own line/paragraph for readability

## Commit Context

Repository: ${input.repository}
Branch: ${input.branch}
Commit: ${input.commit_hash}
Author: ${input.author}
Date: ${input.date}

## Agent Report${newContext ? ' / New Context' : ''}

${newContext || input.raw_agent_report}

## Instructions

Analyze the agent report${newContext ? ' and new context' : ''} and extract the structured fields.

**For kronus_wisdom:**
- Only include if genuine insight emerges from the work
- Keep it concise (2-4 lines max)
- Can be a verse, knowing observation, or philosophical reflection
- Use your Kronus persona's voice (empathetic, wise, with subtle humor)
- Set to null if no meaningful wisdom arises

**For files_changed (STRONGLY REQUESTED):**
- Extract ALL file paths mentioned in the agent report that were created, modified, deleted, or renamed
- For each file, specify: path, action (created/modified/deleted/renamed), and optionally a brief diff_summary
- If a file was renamed, include old_path
- This is critical for tracking what changed - always extract this when file paths are mentioned
- Set to null only if no file paths are mentioned at all

Respond with valid JSON matching the schema.`;

  // Set API key in environment for the SDK to pick up
  // The AI SDK reads from environment variables automatically
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;
  const originalOpenAIKey = process.env.OPENAI_API_KEY;
  const originalGoogleKey = process.env.GOOGLE_API_KEY;
  
  try {
    
    // Temporarily set the API key for the current provider
    switch (config.aiProvider) {
      case 'anthropic':
        process.env.ANTHROPIC_API_KEY = config.aiApiKey;
        break;
      case 'openai':
        process.env.OPENAI_API_KEY = config.aiApiKey;
        break;
      case 'google':
        process.env.GOOGLE_API_KEY = config.aiApiKey;
        break;
    }

    // Select model based on configured provider
    // Models are hardcoded: claude-opus-4-5, gpt-5.1, gemini-3.0
    let model;
    let modelName: string;
    
    switch (config.aiProvider) {
      case 'anthropic':
        model = anthropic('claude-opus-4-5');
        modelName = 'Claude Opus 4.5';
        break;
      case 'openai':
        model = openai('gpt-5.1');
        modelName = 'GPT 5.1';
        break;
      case 'google':
        model = google('gemini-3.0');
        modelName = 'Gemini 3.0';
        break;
      default:
        throw new Error(`Unsupported AI provider: ${config.aiProvider}`);
    }

    logger.debug(`Generating journal entry for ${input.commit_hash} using ${modelName}`);

    const result = await generateObject({
      model: model as any, // Type assertion needed due to SDK version compatibility
      schema: AIOutputSchema,
      prompt: systemPrompt,
      temperature: 0.7,
    });

    logger.success(`Generated journal entry for ${input.commit_hash} using ${modelName}`);
    
    // Restore original environment variables
    if (originalAnthropicKey !== undefined) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (originalOpenAIKey !== undefined) process.env.OPENAI_API_KEY = originalOpenAIKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalGoogleKey !== undefined) process.env.GOOGLE_API_KEY = originalGoogleKey;
    else delete process.env.GOOGLE_API_KEY;
    
    return result.object;
  } catch (error) {
    // Restore original environment variables on error
    if (originalAnthropicKey !== undefined) process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
    else delete process.env.ANTHROPIC_API_KEY;
    if (originalOpenAIKey !== undefined) process.env.OPENAI_API_KEY = originalOpenAIKey;
    else delete process.env.OPENAI_API_KEY;
    if (originalGoogleKey !== undefined) process.env.GOOGLE_API_KEY = originalGoogleKey;
    else delete process.env.GOOGLE_API_KEY;
    
    logger.error('Failed to generate journal entry:', error);
    throw new Error(
      `AI generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
