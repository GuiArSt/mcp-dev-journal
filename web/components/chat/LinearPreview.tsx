"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import {
  AlertCircle,
  Calendar,
  Flag,
  FolderKanban,
  User,
  FileText,
} from "lucide-react";

// Linear-style colors
const COLORS = {
  bg: "#1a1a2e",
  surface: "#16213e",
  border: "#2a2a4a",
  text: "#e8e6e3",
  muted: "#888",
  purple: "#8b5cf6",
  blue: "#3b82f6",
  green: "#22c55e",
  yellow: "#eab308",
  orange: "#f97316",
  red: "#ef4444",
};

// Priority colors and labels (Linear style)
const PRIORITY_CONFIG: Record<number, { label: string; color: string; icon: string }> = {
  0: { label: "No priority", color: COLORS.muted, icon: "○" },
  1: { label: "Urgent", color: COLORS.red, icon: "🔴" },
  2: { label: "High", color: COLORS.orange, icon: "🟠" },
  3: { label: "Medium", color: COLORS.yellow, icon: "🟡" },
  4: { label: "Low", color: COLORS.green, icon: "🟢" },
};

interface LinearIssuePreviewProps {
  title: string;
  description?: string;
  priority?: number;
  teamId?: string;
  projectId?: string;
  assigneeId?: string;
}

interface LinearProjectPreviewProps {
  name: string;
  description?: string;
  content?: string;
  teamIds?: string[];
  leadId?: string;
  targetDate?: string;
  startDate?: string;
}

// Markdown components for Linear-style rendering
const linearMarkdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-xl font-semibold mt-4 mb-2 text-white border-b border-white/10 pb-2">
      {children}
    </h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-lg font-semibold mt-4 mb-2 text-white/90">
      {children}
    </h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-base font-semibold mt-3 mb-1 text-white/80">
      {children}
    </h3>
  ),
  p: ({ children }: any) => (
    <p className="my-2 text-white/70 leading-relaxed">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="my-2 ml-4 space-y-1 list-disc text-white/70">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="my-2 ml-4 space-y-1 list-decimal text-white/70">{children}</ol>
  ),
  li: ({ children }: any) => <li className="text-white/70">{children}</li>,
  code: ({ inline, children }: any) =>
    inline ? (
      <code className="px-1.5 py-0.5 rounded bg-white/10 text-purple-300 font-mono text-sm">
        {children}
      </code>
    ) : (
      <code className="block p-3 rounded bg-black/30 text-white/80 font-mono text-sm overflow-x-auto">
        {children}
      </code>
    ),
  pre: ({ children }: any) => (
    <pre className="my-3 rounded-lg bg-black/30 overflow-x-auto">{children}</pre>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="my-3 pl-4 border-l-2 border-purple-500/50 text-white/60 italic">
      {children}
    </blockquote>
  ),
  a: ({ href, children }: any) => (
    <a
      href={href}
      className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
  img: ({ src, alt }: any) => (
    <div className="my-3">
      <img
        src={src}
        alt={alt || "Image"}
        className="max-w-full rounded-lg border border-white/10"
        style={{ maxHeight: "300px", objectFit: "contain" }}
      />
      {alt && <p className="text-xs text-white/40 mt-1">{alt}</p>}
    </div>
  ),
  hr: () => <hr className="my-4 border-white/10" />,
  table: ({ children }: any) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="border border-white/10 bg-white/5 px-3 py-2 text-left font-medium text-white/80">
      {children}
    </th>
  ),
  td: ({ children }: any) => (
    <td className="border border-white/10 px-3 py-2 text-white/70">{children}</td>
  ),
};

/**
 * Linear Issue Preview - renders an issue like Linear would display it
 */
export const LinearIssuePreview = memo(function LinearIssuePreview({
  title,
  description,
  priority,
  teamId,
  projectId,
  assigneeId,
}: LinearIssuePreviewProps) {
  const priorityConfig = PRIORITY_CONFIG[priority ?? 0];

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: COLORS.surface, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="w-6 h-6 rounded flex items-center justify-center bg-purple-500/20">
          <AlertCircle className="w-4 h-4 text-purple-400" />
        </div>
        <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
          New Issue Preview
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Title */}
        <h2 className="text-lg font-semibold text-white">{title}</h2>

        {/* Metadata row */}
        <div className="flex flex-wrap gap-3 text-sm">
          {/* Priority badge */}
          <div
            className="flex items-center gap-1.5 px-2 py-1 rounded"
            style={{ backgroundColor: `${priorityConfig.color}20` }}
          >
            <span>{priorityConfig.icon}</span>
            <span style={{ color: priorityConfig.color }}>{priorityConfig.label}</span>
          </div>

          {/* Team */}
          {teamId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-white/60">
              <FolderKanban className="w-3.5 h-3.5" />
              <span className="font-mono text-xs">{teamId.substring(0, 8)}...</span>
            </div>
          )}

          {/* Project */}
          {projectId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 text-blue-400">
              <FileText className="w-3.5 h-3.5" />
              <span className="font-mono text-xs">{projectId.substring(0, 8)}...</span>
            </div>
          )}

          {/* Assignee */}
          {assigneeId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-white/60">
              <User className="w-3.5 h-3.5" />
              <span className="font-mono text-xs">{assigneeId.substring(0, 8)}...</span>
            </div>
          )}
        </div>

        {/* Description */}
        {description && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wide mb-2">
              Description
            </p>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={linearMarkdownComponents}
              >
                {description}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Linear Project Preview - renders a project like Linear would display it
 */
export const LinearProjectPreview = memo(function LinearProjectPreview({
  name,
  description,
  content,
  teamIds,
  leadId,
  targetDate,
  startDate,
}: LinearProjectPreviewProps) {
  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ backgroundColor: COLORS.bg, border: `1px solid ${COLORS.border}` }}
    >
      {/* Header */}
      <div
        className="px-4 py-3 flex items-center gap-3"
        style={{ backgroundColor: COLORS.surface, borderBottom: `1px solid ${COLORS.border}` }}
      >
        <div className="w-6 h-6 rounded flex items-center justify-center bg-blue-500/20">
          <FolderKanban className="w-4 h-4 text-blue-400" />
        </div>
        <span className="text-xs font-medium text-white/40 uppercase tracking-wide">
          New Project Preview
        </span>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Name */}
        <h2 className="text-lg font-semibold text-white">{name}</h2>

        {/* Metadata row */}
        <div className="flex flex-wrap gap-3 text-sm">
          {/* Teams */}
          {teamIds && teamIds.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-white/60">
              <FolderKanban className="w-3.5 h-3.5" />
              <span>{teamIds.length} team{teamIds.length > 1 ? "s" : ""}</span>
            </div>
          )}

          {/* Lead */}
          {leadId && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-white/5 text-white/60">
              <User className="w-3.5 h-3.5" />
              <span className="font-mono text-xs">{leadId.substring(0, 8)}...</span>
            </div>
          )}

          {/* Start date */}
          {startDate && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-green-500/10 text-green-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Start: {startDate}</span>
            </div>
          )}

          {/* Target date */}
          {targetDate && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded bg-orange-500/10 text-orange-400">
              <Flag className="w-3.5 h-3.5" />
              <span>Target: {targetDate}</span>
            </div>
          )}
        </div>

        {/* Description (plain text) */}
        {description && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wide mb-2">
              Description
            </p>
            <p className="text-white/70 text-sm">{description}</p>
          </div>
        )}

        {/* Content (rich text/markdown) */}
        {content && (
          <div className="pt-3 border-t border-white/10">
            <p className="text-xs font-medium text-white/40 uppercase tracking-wide mb-2">
              Content
            </p>
            <div className="prose prose-invert prose-sm max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={linearMarkdownComponents}
              >
                {content}
              </ReactMarkdown>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * Check if a tool is a Linear tool that should use rich preview
 */
export function isLinearTool(toolName: string): boolean {
  return toolName.startsWith("linear_");
}

/**
 * Get the appropriate Linear preview component for a tool
 */
export function getLinearPreview(
  toolName: string,
  args: Record<string, any>
): React.ReactNode | null {
  switch (toolName) {
    case "linear_create_issue":
    case "linear_update_issue":
      return (
        <LinearIssuePreview
          title={args.title || "(No title)"}
          description={args.description}
          priority={args.priority}
          teamId={args.teamId}
          projectId={args.projectId}
          assigneeId={args.assigneeId}
        />
      );
    case "linear_create_project":
    case "linear_update_project":
      return (
        <LinearProjectPreview
          name={args.name || "(No name)"}
          description={args.description}
          content={args.content}
          teamIds={args.teamIds}
          leadId={args.leadId}
          targetDate={args.targetDate}
          startDate={args.startDate}
        />
      );
    default:
      return null;
  }
}
