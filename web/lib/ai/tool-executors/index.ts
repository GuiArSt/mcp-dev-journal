export type { ToolExecutionResult, ToolExecutor } from "./types";

import { journalExecutors } from "./journal";
import { linearExecutors } from "./linear";
import { sliteExecutors } from "./slite";
import { notionExecutors } from "./notion";
import { imageExecutors } from "./image";
import { mediaExecutors } from "./media";
import { memoryExecutors } from "./memory";
import { repositoryExecutors } from "./repository";
import { aiIntegrationExecutors } from "./ai-integrations";
import { gitExecutors } from "./git";
import { searchExecutors } from "./search";
import { googleExecutors } from "./google";
import { cursorDelegateExecutors } from "./cursor-delegate";
import type { ToolExecutionResult, ToolExecutor } from "./types";

// Registry of all tool executors by domain
const toolExecutors: Record<string, ToolExecutor> = {
  ...journalExecutors,
  ...linearExecutors,
  ...sliteExecutors,
  ...notionExecutors,
  ...imageExecutors,
  ...mediaExecutors,
  ...memoryExecutors,
  ...repositoryExecutors,
  ...aiIntegrationExecutors,
  ...gitExecutors,
  ...searchExecutors,
  ...googleExecutors,
  ...cursorDelegateExecutors,
};

// Dispatch a tool call to its executor
export async function executeToolCall(
  toolName: string,
  args: Record<string, any>
): Promise<ToolExecutionResult> {
  const executor = toolExecutors[toolName];
  if (!executor) {
    return { output: `Unknown tool: ${toolName}` };
  }
  return executor(args);
}
