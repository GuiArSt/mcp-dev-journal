"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  ArrowLeft,
  GitBranch,
  Calendar,
  User,
  Paperclip,
  FolderGit2,
  Edit,
  Save,
  X,
  Plus,
} from "lucide-react";
import { formatDateShort } from "@/lib/utils";

interface JournalEntry {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  code_author?: string;
  team_members?: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  raw_agent_report: string;
  created_at: string;
  attachments?: Array<{
    id: number;
    filename: string;
    mime_type: string;
    description: string | null;
    file_size: number;
  }>;
}

/**
 * Format technical content to be more readable.
 * - Wraps file names (.py, .db, .md, .json, .tsx, etc.) in backticks
 * - Wraps table/function names (snake_case patterns) in backticks
 * - Wraps known acronyms/abbreviations in backticks
 * - Adds line breaks before action verbs for better visual separation
 */
function formatTechnicalContent(content: string): string {
  if (!content) return "";

  let formatted = content;

  // Wrap file names with extensions in backticks (if not already wrapped)
  // Matches: filename.ext where ext is common code/data extensions
  formatted = formatted.replace(
    /(?<!`)\b([\w.-]+\.(py|db|md|json|tsx|ts|js|jsx|sql|csv|yaml|yml|toml|sh|mdc|txt|html|css|scss))\b(?!`)/gi,
    "`$1`"
  );

  // Wrap snake_case identifiers (table names, function names) in backticks
  // Must have at least one underscore and be 3+ chars
  formatted = formatted.replace(
    /(?<!`)\b([a-z][a-z0-9]*(?:_[a-z0-9]+)+)\b(?!`)/g,
    "`$1`"
  );

  // Wrap known acronyms/system names in backticks (if not already wrapped)
  // Common project-specific acronyms
  const acronyms = ["TAS", "AIR", "CAI", "ISCO", "API", "SDK", "CLI", "MCP", "SQL", "JSON", "CSV", "HubSpot", "CRM", "MongoDB", "Nexus", "Jobilla"];
  acronyms.forEach(acronym => {
    // Use word boundaries and negative lookbehind/lookahead for backticks
    const regex = new RegExp(`(?<!\`)\\b(${acronym})\\b(?!\`)`, "g");
    formatted = formatted.replace(regex, "`$1`");
  });

  // Wrap parenthesized counts like (23,011 jobs) or (188 AIR campaigns) - make the number bold
  formatted = formatted.replace(
    /\((\d{1,3}(?:,\d{3})*)\s+([^)]+)\)/g,
    "(**$1** $2)"
  );

  // Add line breaks before sentences starting with action verbs (if preceded by period + space)
  const actionVerbs = ["Created", "Generated", "Added", "Cleaned", "Established", "Implemented", "Updated", "Removed", "Fixed", "Built", "Migrated"];
  actionVerbs.forEach(verb => {
    formatted = formatted.replace(
      new RegExp(`\\.\\s+(${verb})`, "g"),
      ".\n\n$1"
    );
  });

  return formatted;
}

/**
 * Format decisions content to ensure proper markdown rendering.
 * Handles cases where numbered items are on a single line (e.g., "1. **Title** - desc 2. **Title** - desc")
 * by converting them to proper markdown with line breaks.
 */
function formatDecisions(decisions: string): string {
  if (!decisions) return "";

  // First apply technical formatting
  let formatted = formatTechnicalContent(decisions);

  // Check if content already has proper line breaks for numbered items
  if (/^\d+\.\s/m.test(formatted) && formatted.includes("\n")) {
    // Already has line breaks and numbered items - return as is
    return formatted;
  }

  // Pattern to match numbered items like "1. **Title** - content" or "1. Title - content"
  // This handles items that are all on one line separated by spaces
  const numberedPattern = /(\d+)\.\s+(\*\*[^*]+\*\*|\S+)\s*[-–—]\s*/g;

  // Check if the content matches the pattern of inline numbered items
  if (numberedPattern.test(formatted)) {
    // Reset the regex
    numberedPattern.lastIndex = 0;

    // Split by the numbered pattern and rebuild with proper line breaks
    const parts: string[] = [];
    let lastIndex = 0;
    let match;

    while ((match = numberedPattern.exec(formatted)) !== null) {
      if (match.index > lastIndex && parts.length > 0) {
        // Add content before this match to the previous item
        parts[parts.length - 1] += formatted.slice(lastIndex, match.index).trim();
      }
      // Start a new item
      parts.push(`${match[1]}. ${match[2]} - `);
      lastIndex = match.index + match[0].length;
    }

    // Add remaining content to the last item
    if (lastIndex < formatted.length && parts.length > 0) {
      parts[parts.length - 1] += formatted.slice(lastIndex).trim();
    }

    // Join with double line breaks for proper markdown list spacing
    return parts.join("\n\n");
  }

  return formatted;
}

export default function EntryDetailPage() {
  const router = useRouter();
  const params = useParams();
  const commitHash = params.commitHash as string;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState<Partial<JournalEntry>>({});
  const [saving, setSaving] = useState(false);
  const [newTech, setNewTech] = useState("");

  useEffect(() => {
    fetchEntry();
  }, [commitHash]);

  const fetchEntry = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/entries/${commitHash}`);
      if (response.ok) {
        const data = await response.json();
        setEntry(data);
        setEditData({
          author: data.author,
          code_author: data.code_author || data.author,
          team_members: data.team_members || "[]",
          why: data.why,
          what_changed: data.what_changed,
          decisions: data.decisions,
          technologies: data.technologies,
          kronus_wisdom: data.kronus_wisdom,
        });
      } else {
        router.push("/reader");
      }
    } catch (error) {
      console.error("Failed to fetch entry:", error);
      router.push("/reader");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!entry) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/entries/${commitHash}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editData),
      });
      if (response.ok) {
        const updated = await response.json();
        setEntry(updated);
        setEditMode(false);
      }
    } catch (error) {
      console.error("Failed to save:", error);
    } finally {
      setSaving(false);
    }
  };

  // Navigate to chat to EDIT this entry with Kronus - includes full content
  const editWithKronus = () => {
    if (!entry) return;

    // Build attachment info if present
    const attachmentInfo = entry.attachments && entry.attachments.length > 0
      ? `\n\n**Attachments (${entry.attachments.length}):**\n${entry.attachments.map(a => `- ${a.filename} (${a.mime_type}, ${(a.file_size / 1024).toFixed(1)}KB)${a.description ? `: ${a.description}` : ""}`).join("\n")}`
      : "";

    const context = `I want to UPDATE this journal entry. Please help me modify it:\n\n**Commit Hash:** ${entry.commit_hash}\n**Repository:** ${entry.repository}/${entry.branch}\n**Date:** ${formatDateShort(entry.date)}\n**Author:** ${entry.author}\n\n**Why:**\n${entry.why}\n\n**What Changed:**\n${entry.what_changed}\n\n**Decisions:**\n${entry.decisions}\n\n**Technologies:** ${entry.technologies}\n\n**Kronus Wisdom:**\n${entry.kronus_wisdom || "(none)"}\n\n**Raw Agent Report:**\n${entry.raw_agent_report.substring(0, 1500)}${entry.raw_agent_report.length > 1500 ? "..." : ""}${attachmentInfo}\n\nWhat changes would you like to make? You can update any field (why, what_changed, decisions, technologies, kronus_wisdom) using the journal_edit_entry tool, or regenerate the entire entry with new context using journal_regenerate_entry.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-14 items-center border-b px-6">
          <Skeleton className="h-6 w-48" />
        </header>
        <div className="flex-1 p-6">
          <Skeleton className="mb-4 h-8 w-1/3" />
          <Skeleton className="mb-8 h-4 w-1/4" />
          <Skeleton className="mb-4 h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      </div>
    );
  }

  if (!entry) return null;

  return (
    <div className="journal-page flex h-full flex-col">
      {/* Header */}
      <header className="journal-header flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/reader">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Link>
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div className="flex items-center gap-2">
            <FolderGit2 className="text-primary h-4 w-4" />
            <span className="font-medium">{entry.repository}</span>
            <span className="text-muted-foreground">/</span>
            <GitBranch className="text-muted-foreground h-3 w-3" />
            <span className="text-muted-foreground">{entry.branch}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {editMode ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => setEditMode(false)}>
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={editWithKronus}
                className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
              >
                <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                Edit with Kronus
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <ScrollArea className="flex-1 bg-[var(--journal-paper)]">
        <div className="mx-auto max-w-4xl p-6 bg-[#FEFDFB] rounded-lg border border-[#E5E0D8] shadow-sm">
          {/* Meta */}
          <div className="mb-6 space-y-3">
            <div className="mb-2 flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="font-mono bg-[var(--tartarus-teal-soft)] border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal-dim)]">
                {entry.commit_hash}
              </Badge>
              {/* Code Author - who wrote the commit */}
              <span className="text-[#2A2520] flex items-center gap-1.5 text-sm font-medium">
                <GitBranch className="h-3 w-3 text-[var(--tartarus-teal-dim)]" />
                <span className="text-[#5C5550]">Commit by:</span>
                {editMode ? (
                  <Input
                    value={editData.code_author || entry.code_author || entry.author}
                    onChange={(e) => setEditData({ ...editData, code_author: e.target.value })}
                    className="h-6 w-32 text-xs border-[#E5E0D8] bg-white"
                    placeholder="Code author"
                  />
                ) : (
                  <span className="font-semibold">{entry.code_author || entry.author}</span>
                )}
              </span>
              {/* Journal Entry Author - who documented/analyzed it */}
              <span className="text-[#5C5550] flex items-center gap-1.5 text-sm">
                <Edit className="h-3 w-3 text-[var(--tartarus-gold-dim)]" />
                <span>Entry by:</span>
                {editMode ? (
                  <Input
                    value={editData.author || entry.author}
                    onChange={(e) => setEditData({ ...editData, author: e.target.value })}
                    className="h-6 w-32 text-xs border-[#E5E0D8] bg-white"
                  />
                ) : (
                  <span className="font-medium text-[#2A2520]">{entry.author}</span>
                )}
              </span>
              <span className="text-[#5C5550] flex items-center gap-1 text-sm">
                <Calendar className="h-3 w-3" />
                {new Date(entry.date).toLocaleString()}
              </span>
            </div>
            {entry.team_members && JSON.parse(entry.team_members || "[]").length > 0 && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[#2A2520] text-xs font-medium">Team:</span>
                {JSON.parse(entry.team_members).map((member: string, idx: number) => (
                  <Badge key={idx} className="bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold-dim)] border-[var(--tartarus-gold-dim)] text-xs">
                    {member}
                  </Badge>
                ))}
              </div>
            )}
            {editMode && (
              <div className="flex items-center gap-2">
                <span className="text-[#2A2520] text-xs font-medium">Team members (comma-separated):</span>
                <Input
                  value={typeof editData.team_members === "string" ? editData.team_members.replace(/[\[\]"]/g, "") : (entry.team_members ? JSON.parse(entry.team_members || "[]").join(", ") : "")}
                  onChange={(e) => {
                    const members = e.target.value.split(",").map(m => m.trim()).filter(Boolean);
                    setEditData({ ...editData, team_members: JSON.stringify(members) });
                  }}
                  className="h-7 flex-1 max-w-xs text-xs border-[#E5E0D8] bg-white"
                  placeholder="Team member names"
                />
              </div>
            )}
            {/* Technologies/Tags - editable in edit mode */}
            {editMode ? (
              <div className="mt-3 space-y-2">
                <div className="flex flex-wrap gap-1 min-h-[32px] p-2 border border-[#E5E0D8] rounded-md bg-[#FAF8F2]">
                  {(editData.technologies || entry.technologies || "").split(",").filter(t => t.trim()).map((tech, idx) => {
                    const colors = [
                      "bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal-dim)] border-[var(--tartarus-teal-dim)]",
                      "bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold-dim)] border-[var(--tartarus-gold-dim)]",
                      "bg-[#E8F5F5] text-[#008B8B] border-[#008B8B]",
                      "bg-[#FFF8E7] text-[#B8860B] border-[#B8860B]",
                    ];
                    return (
                      <Badge key={tech.trim()} className={`${colors[idx % colors.length]} text-xs border font-medium gap-1`}>
                        {tech.trim()}
                        <button
                          type="button"
                          onClick={() => {
                            const techs = (editData.technologies || entry.technologies || "")
                              .split(",")
                              .map(t => t.trim())
                              .filter(t => t && t !== tech.trim());
                            setEditData({ ...editData, technologies: techs.join(", ") });
                          }}
                          className="ml-1 hover:text-red-600 focus:outline-none"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })}
                  {!(editData.technologies || entry.technologies) && (
                    <span className="text-sm text-[#A0998A]">No technologies</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Input
                    value={newTech}
                    onChange={(e) => setNewTech(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const tag = newTech.trim();
                        if (tag) {
                          const current = (editData.technologies || entry.technologies || "")
                            .split(",")
                            .map(t => t.trim())
                            .filter(Boolean);
                          if (!current.includes(tag)) {
                            setEditData({ ...editData, technologies: [...current, tag].join(", ") });
                          }
                          setNewTech("");
                        }
                      }
                    }}
                    className="h-8 flex-1 max-w-xs text-xs border-[#E5E0D8] bg-white"
                    placeholder="Add technology..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const tag = newTech.trim();
                      if (tag) {
                        const current = (editData.technologies || entry.technologies || "")
                          .split(",")
                          .map(t => t.trim())
                          .filter(Boolean);
                        if (!current.includes(tag)) {
                          setEditData({ ...editData, technologies: [...current, tag].join(", ") });
                        }
                        setNewTech("");
                      }
                    }}
                    disabled={!newTech.trim()}
                    className="h-8 border-[#D5D0C8] text-[#5C5550] hover:bg-[#F5F3F0] hover:text-[#2A2520] disabled:opacity-50"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : entry.technologies && (
              <div className="mt-3 flex flex-wrap gap-1">
                {entry.technologies.split(",").map((tech, idx) => {
                  const colors = [
                    "bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal-dim)] border-[var(--tartarus-teal-dim)]",
                    "bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold-dim)] border-[var(--tartarus-gold-dim)]",
                    "bg-[#E8F5F5] text-[#008B8B] border-[#008B8B]",
                    "bg-[#FFF8E7] text-[#B8860B] border-[#B8860B]",
                  ];
                  return (
                    <Badge key={tech.trim()} className={`${colors[idx % colors.length]} text-xs border font-medium`}>
                      {tech.trim()}
                    </Badge>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sections */}
          <Tabs defaultValue="content" className="space-y-6">
            <TabsList>
              <TabsTrigger value="content">Content</TabsTrigger>
              <TabsTrigger value="raw">Raw Report</TabsTrigger>
              {entry.attachments && entry.attachments.length > 0 && (
                <TabsTrigger value="attachments">
                  Attachments ({entry.attachments.length})
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="content" className="space-y-6">
              {/* Why */}
              <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Why</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <Textarea
                      value={editData.why || ""}
                      onChange={(e) => setEditData({ ...editData, why: e.target.value })}
                      rows={4}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none text-[#2A2520] prose-headings:text-[#2A2520] prose-p:text-[#3D3833] prose-strong:text-[#1A1510] prose-strong:font-semibold prose-code:text-[#5C5550] prose-code:bg-[#F5F3F0] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-pre:bg-[#F0EDE8] prose-pre:text-[#2A2520]">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{entry.why}</ReactMarkdown>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* What Changed */}
              <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">What Changed</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <Textarea
                      value={editData.what_changed || ""}
                      onChange={(e) => setEditData({ ...editData, what_changed: e.target.value })}
                      rows={6}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none text-[#2A2520] prose-headings:text-[#2A2520] prose-p:text-[#3D3833] prose-strong:text-[#1A1510] prose-strong:font-semibold prose-code:text-[#5C5550] prose-code:bg-[#F5F3F0] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-pre:bg-[#F0EDE8] prose-pre:text-[#2A2520]">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {formatTechnicalContent(entry.what_changed)}
                      </ReactMarkdown>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Decisions */}
              <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Decisions</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <Textarea
                      value={editData.decisions || ""}
                      onChange={(e) => setEditData({ ...editData, decisions: e.target.value })}
                      rows={6}
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none text-[#2A2520] prose-headings:text-[#2A2520] prose-p:text-[#3D3833] prose-strong:text-[#1A1510] prose-strong:font-semibold prose-code:text-[#5C5550] prose-code:bg-[#F5F3F0] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-pre:bg-[#F0EDE8] prose-pre:text-[#2A2520] prose-li:text-[#3D3833] prose-li:my-2">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                        {formatDecisions(entry.decisions)}
                      </ReactMarkdown>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Technologies */}
              <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Technologies</CardTitle>
                </CardHeader>
                <CardContent>
                  {editMode ? (
                    <Textarea
                      value={editData.technologies || ""}
                      onChange={(e) => setEditData({ ...editData, technologies: e.target.value })}
                      rows={2}
                      placeholder="Comma-separated list of technologies"
                    />
                  ) : (
                    <div className="prose prose-sm max-w-none text-[#2A2520] prose-headings:text-[#2A2520] prose-p:text-[#3D3833] prose-strong:text-[#1A1510] prose-strong:font-semibold prose-code:text-[#5C5550] prose-code:bg-[#F5F3F0] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-xs prose-code:font-normal prose-pre:bg-[#F0EDE8] prose-pre:text-[#2A2520]">
                      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{entry.technologies}</ReactMarkdown>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Kronus Wisdom */}
              {(entry.kronus_wisdom || editMode) && (
                <Card className="border-[var(--tartarus-teal)] border-l-4 bg-[var(--tartarus-teal-soft)]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-[var(--tartarus-teal-dim)] flex items-center gap-2 text-base">
                      <img src="/chronus-logo.png" alt="Kronus" className="h-5 w-5 rounded-full" />
                      Kronus Wisdom
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {editMode ? (
                      <Textarea
                        value={editData.kronus_wisdom || ""}
                        onChange={(e) =>
                          setEditData({ ...editData, kronus_wisdom: e.target.value })
                        }
                        rows={3}
                        placeholder="Optional philosophical reflection..."
                      />
                    ) : (
                      <div className="prose prose-sm max-w-none prose-headings:text-[var(--tartarus-teal-dim)] prose-p:text-[var(--tartarus-teal-dim)] prose-p:italic prose-strong:text-[var(--tartarus-teal-dim)]">
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{entry.kronus_wisdom}</ReactMarkdown>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="raw">
              <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Raw Agent Report</CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="bg-muted max-h-96 overflow-auto rounded-lg p-4 text-sm whitespace-pre-wrap">
                    {entry.raw_agent_report}
                  </pre>
                </CardContent>
              </Card>
            </TabsContent>

            {entry.attachments && entry.attachments.length > 0 && (
              <TabsContent value="attachments">
                <Card className="bg-[#FEFDFB] border-[#E5E0D8] shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Paperclip className="h-4 w-4" />
                      Attachments
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {entry.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between rounded-lg border p-3"
                        >
                          <div>
                            <p className="font-medium">{att.filename}</p>
                            <p className="text-muted-foreground text-xs">
                              {att.mime_type} • {(att.file_size / 1024).toFixed(2)} KB
                              {att.description && ` • ${att.description}`}
                            </p>
                          </div>
                          <Button variant="outline" size="sm">
                            Download
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            )}
          </Tabs>
        </div>
      </ScrollArea>
    </div>
  );
}
