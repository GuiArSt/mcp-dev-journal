import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { spawnSync } from "node:child_process";
import { z } from "zod";
import { logger } from "../../shared/logger.js";

const ALLOWED_COMMANDS = ["log", "diff", "show", "blame", "ls-files", "status", "branch"] as const;
type GitCommand = (typeof ALLOWED_COMMANDS)[number];

function runGit(repoPath: string, command: GitCommand, args: string[]): { stdout: string; stderr: string; ok: boolean } {
  const result = spawnSync("git", ["-C", repoPath, command, ...args], {
    encoding: "utf8",
    timeout: 15000,
    maxBuffer: 1024 * 1024 * 2, // 2 MB
  });

  if (result.error) {
    return { stdout: "", stderr: result.error.message, ok: false };
  }

  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    ok: result.status === 0,
  };
}

export function registerGitTools(server: McpServer): void {
  server.registerTool(
    "git_read",
    {
      title: "Git Read (any local repo)",
      description: `Execute a read-only git command against any local repository.

Allowed commands: log, diff, show, blame, ls-files, status, branch

Useful for Kronus to understand code context from any codebase (Jobilla, Tartarus, etc.)
without needing the files open in Claude Code.

Examples:
  git_read({ repo_path: "/Users/guillermo.as/Documents/Software/jobilla/api", command: "log", args: ["--oneline", "-20"] })
  git_read({ repo_path: "/Users/guillermo.as/Documents/Software/Laboratory/tartarus", command: "diff", args: ["HEAD~1"] })
  git_read({ repo_path: "/path/to/repo", command: "show", args: ["HEAD:src/some/file.ts"] })
  git_read({ repo_path: "/path/to/repo", command: "ls-files", args: ["src/"] })`,
      inputSchema: {
        repo_path: z.string().min(1).describe("Absolute path to the local git repository root"),
        command: z.enum(ALLOWED_COMMANDS).describe("Git command to run (read-only allowlist)"),
        args: z.array(z.string()).optional().default([]).describe("Arguments passed to the git command as an array (no shell expansion)"),
      },
    },
    async ({ repo_path, command, args }) => {
      if (!repo_path.startsWith("/")) {
        return {
          content: [{ type: "text" as const, text: "Error: repo_path must be an absolute path starting with /" }],
          isError: true as const,
        };
      }

      const { stdout, stderr, ok } = runGit(repo_path, command, args ?? []);

      if (!ok && !stdout) {
        return {
          content: [{ type: "text" as const, text: `git error: ${stderr || "unknown error"}` }],
          isError: true as const,
        };
      }

      const output = stdout || stderr;
      // Truncate to ~8 KB to stay within MCP limits
      const truncated = output.length > 8000 ? output.slice(0, 8000) + "\n... [truncated]" : output;

      return {
        content: [{ type: "text" as const, text: truncated }],
      };
    },
  );

  logger.success("Git read tool registered (git_read)");
}
