"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronRight,
  ChevronDown,
  FolderGit2,
  ExternalLink,
  Brain,
  Loader2,
  Calendar,
  Code,
  Database,
  Server,
  Workflow,
  Terminal,
  FileCode,
  AlertCircle,
  Layers,
  Target,
  GitBranch,
  Sparkles,
  BookOpen,
  Scroll,
  Eye,
  EyeOff,
  Trash2,
} from "lucide-react";
import { formatDateShort } from "@/lib/utils";

// Helper to clean technology strings from markdown formatting
function cleanTechnologies(techString: string): string[] {
  const cleaned = techString
    .replace(/\*\*[^*]+:\*\*\s*/g, "")
    .replace(/\*\*/g, "")
    .replace(/\([^)]+\)/g, "")
    .replace(/\n/g, ", ")
    .split(/[,\n]/)
    .map((tech) => tech.trim())
    .filter((tech) => {
      if (!tech || tech.length === 0) return false;
      if (tech === ":") return false;
      if (tech.includes(".py") || tech.includes(".sql")) return false;
      if (tech.length > 40) return false;
      return true;
    })
    .map((tech) => tech.replace(/^[-•]\s*/, ""));
  return [...new Set(cleaned)];
}

interface ProjectSummary {
  id: number;
  repository: string;
  git_url?: string;
  summary: string;
  purpose?: string;
  architecture?: string;
  key_decisions?: string;
  technologies?: string;
  status?: string;
  updated_at: string;
  linear_project_id?: string;
  linear_issue_id?: string;
  entry_count: number;
  last_entry_date?: string;
  file_structure?: string;
  tech_stack?: string;
  frontend?: string;
  backend?: string;
  database_info?: string;
  services?: string;
  custom_tooling?: string;
  data_flow?: string;
  patterns?: string;
  commands?: string;
  extended_notes?: string;
  last_synced_entry?: string;
  entries_synced?: number;
}

interface Props {
  project: ProjectSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onAnalyze: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onDelete?: (deleteEntries: boolean) => Promise<void>;
  analyzing: boolean;
  deleting?: boolean;
  children?: React.ReactNode; // For entries list
}

// Check if project has well-structured Entry 0 data
function hasStructuredEntry0(project: ProjectSummary): boolean {
  return !!(
    project.file_structure ||
    project.tech_stack ||
    project.frontend ||
    project.backend ||
    project.database_info ||
    project.services ||
    project.data_flow ||
    project.patterns ||
    project.commands
  );
}

// Collapsible section component with Kronus styling
function SummarySection({
  title,
  icon: Icon,
  children,
  defaultOpen = false,
  variant = "default",
}: {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  defaultOpen?: boolean;
  variant?: "default" | "code" | "warning";
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  const variantStyles = {
    default: "border-[var(--tartarus-border)] hover:border-[var(--tartarus-teal-dim)]",
    code: "border-[var(--tartarus-border)] hover:border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-void)]/50",
    warning: "border-[var(--tartarus-gold-dim)]/30 hover:border-[var(--tartarus-gold-dim)]",
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div
        className={`rounded-lg border ${variantStyles[variant]} overflow-hidden transition-colors`}
      >
        <CollapsibleTrigger asChild>
          <button className="group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--tartarus-elevated)]">
            {isOpen ? (
              <ChevronDown className="h-3 w-3 text-[var(--tartarus-teal)] transition-transform" />
            ) : (
              <ChevronRight className="h-3 w-3 text-[var(--tartarus-ivory-muted)] transition-colors group-hover:text-[var(--tartarus-teal)]" />
            )}
            <Icon
              className={`h-4 w-4 ${isOpen ? "text-[var(--tartarus-teal)]" : "text-[var(--tartarus-ivory-muted)]"}`}
            />
            <span
              className={`text-sm font-medium ${isOpen ? "text-[var(--tartarus-ivory)]" : "text-[var(--tartarus-ivory-muted)]"}`}
            >
              {title}
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t border-[var(--tartarus-border)]/50 px-3 pt-1 pb-3">
            {children}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

// Markdown renderer with Kronus styling
function KronusMarkdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm prose-strong:text-[var(--tartarus-ivory)] prose-headings:text-[var(--tartarus-ivory)] prose-h2:text-sm prose-h3:text-xs prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-elevated)] prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-a:text-[var(--tartarus-teal)] prose-li:text-[var(--tartarus-ivory-muted)] prose-ul:my-1 prose-ol:my-1 prose-li:my-0 max-w-none text-[var(--tartarus-ivory-muted)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}

export function ProjectSummaryCard({
  project,
  isExpanded,
  onToggle,
  onAnalyze,
  onEdit,
  onDelete,
  analyzing,
  deleting,
  children,
}: Props) {
  const [showEntry0, setShowEntry0] = useState(false);
  const [showIndexSummary, setShowIndexSummary] = useState(false);
  const [deleteEntries, setDeleteEntries] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const hasEntry0 = hasStructuredEntry0(project);
  const isNew = project.id === -1;
  const needsAnalysis = !hasEntry0 && project.entry_count > 0;

  const handleDelete = async () => {
    if (onDelete) {
      try {
        await onDelete(deleteEntries);
        // Only close on success
        setDeleteDialogOpen(false);
        setDeleteEntries(false);
      } catch {
        // Parent already shows alert via its own catch block
        // Dialog stays open so user can retry (checkbox state preserved)
        // Don't re-throw - would cause unhandled promise rejection
      }
    }
  };

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
        {/* Repository header — always visible */}
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer py-4 transition-colors hover:bg-[var(--tartarus-elevated)]">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {isExpanded ? (
                    <ChevronDown className="h-4 w-4 flex-shrink-0 text-[var(--tartarus-teal)]" />
                  ) : (
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-[var(--tartarus-ivory-muted)]" />
                  )}
                  <FolderGit2 className="h-5 w-5 flex-shrink-0 text-[var(--tartarus-teal)]" />
                  <CardTitle className="truncate text-lg capitalize text-[var(--tartarus-ivory)]">
                    {project.repository}
                  </CardTitle>
                  {hasEntry0 ? (
                    <Badge
                      variant="outline"
                      className="flex-shrink-0 border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)]"
                    >
                      <BookOpen className="mr-1 h-3 w-3" />
                      Entry 0
                    </Badge>
                  ) : (
                    <Badge className="flex-shrink-0 bg-[var(--tartarus-teal-soft)] text-xs text-[var(--tartarus-teal)]">
                      {project.entry_count} entries
                    </Badge>
                  )}
                  {project.status && (
                    <Badge className="flex-shrink-0 bg-[var(--tartarus-gold-soft)] text-xs text-[var(--tartarus-gold)]">
                      {project.status.split(" ").slice(0, 2).join(" ")}
                    </Badge>
                  )}
                  {isNew && (
                    <Badge className="flex-shrink-0 bg-[var(--tartarus-gold-soft)] text-xs text-[var(--tartarus-gold)]">
                      New
                    </Badge>
                  )}
                </div>

                {/* Quick summary - truncated */}
                <CardDescription className="mt-2 ml-10 line-clamp-2 text-[var(--tartarus-ivory-muted)]">
                  {project.summary?.substring(0, 180)}
                  {project.summary && project.summary.length > 180 ? "..." : ""}
                </CardDescription>

                {/* Tech badges - quick view */}
                {project.technologies && (
                  <div className="mt-2 ml-10 flex flex-wrap gap-1">
                    {cleanTechnologies(project.technologies)
                      .slice(0, 5)
                      .map((tech) => (
                        <Badge
                          key={tech}
                          variant="outline"
                          className="border-[var(--tartarus-border)] text-xs text-[var(--tartarus-ivory-muted)]"
                        >
                          {tech.split(" ")[0]}
                        </Badge>
                      ))}
                    {cleanTechnologies(project.technologies).length > 5 && (
                      <Badge
                        variant="outline"
                        className="border-[var(--tartarus-border)] text-xs text-[var(--tartarus-ivory-faded)]"
                      >
                        +{cleanTechnologies(project.technologies).length - 5}
                      </Badge>
                    )}
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="ml-2 flex flex-shrink-0 items-center gap-1">
                {/* Index Summary Toggle */}
                {project.summary && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowIndexSummary(!showIndexSummary);
                    }}
                    className={`h-8 w-8 ${showIndexSummary ? "text-[var(--tartarus-teal)]" : "text-[var(--tartarus-ivory-muted)]"} hover:bg-[var(--tartarus-teal-soft)] hover:text-[var(--tartarus-teal)]`}
                    title="Toggle Index Summary"
                  >
                    {showIndexSummary ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                )}
                {project.git_url && (
                  <Button
                    variant="ghost"
                    size="icon"
                    asChild
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)]"
                  >
                    <a href={project.git_url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onAnalyze}
                  disabled={analyzing || project.entry_count === 0}
                  title="Refresh Entry 0 from recent journal rows. If the server has CURSOR_API_KEY and a matching delegate repo, a Cursor agent validates the write-up against the local tree before merge."
                  className={`h-8 ${isNew || needsAnalysis ? "text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)] hover:text-[var(--tartarus-gold-bright)]" : "text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)] hover:text-[var(--tartarus-teal-bright)]"}`}
                >
                  {analyzing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Brain className="h-4 w-4" />
                  )}
                  <span className="ml-1.5 hidden sm:inline">
                    {analyzing ? "..." : isNew ? "Init" : "Analyze"}
                  </span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  className="h-8 text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)] hover:text-[var(--tartarus-gold-bright)]"
                >
                  <img
                    src="/chronus-logo.png"
                    alt="Kronus"
                    className="h-4 w-4 rounded-full object-cover"
                  />
                  <span className="ml-1.5 hidden sm:inline">Edit in chat</span>
                </Button>
                {onDelete && (
                  <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 w-8 text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-error-soft)] hover:text-[var(--tartarus-error)]"
                      >
                        {deleting ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                      <AlertDialogHeader>
                        <AlertDialogTitle className="text-[var(--tartarus-ivory)]">
                          Delete repository: {project.repository}
                        </AlertDialogTitle>
                        <AlertDialogDescription className="text-[var(--tartarus-ivory-muted)]">
                          This will delete the Repository overview (Entry 0) row for this repository.
                          {project.entry_count > 0 && (
                            <div className="mt-4 rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)] p-3">
                              <div className="flex items-start gap-3">
                                <Checkbox
                                  id="delete-entries"
                                  checked={deleteEntries}
                                  onCheckedChange={(checked) => setDeleteEntries(checked === true)}
                                  className="mt-0.5 border-[var(--tartarus-error)] data-[state=checked]:border-[var(--tartarus-error)] data-[state=checked]:bg-[var(--tartarus-error)]"
                                />
                                <label htmlFor="delete-entries" className="cursor-pointer text-sm">
                                  <span className="font-medium text-[var(--tartarus-error)]">
                                    Also delete {project.entry_count} journal entries
                                  </span>
                                  <br />
                                  <span className="text-xs text-[var(--tartarus-ivory-faded)]">
                                    This cannot be undone. All entries and attachments will be
                                    permanently removed.
                                  </span>
                                </label>
                              </div>
                            </div>
                          )}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]">
                          Cancel
                        </AlertDialogCancel>
                        <Button
                          onClick={handleDelete}
                          disabled={deleting}
                          className={
                            deleteEntries
                              ? "bg-[var(--tartarus-error)] text-white hover:bg-[var(--tartarus-error)]/90"
                              : "bg-[var(--tartarus-teal)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-teal-bright)]"
                          }
                        >
                          {deleting ? (
                            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="mr-1.5 h-4 w-4" />
                          )}
                          {deleteEntries ? "Delete all" : "Delete overview only"}
                        </Button>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                )}
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>

        {/* Expanded Content */}
        <CollapsibleContent>
          <CardContent className="space-y-4 border-t border-[var(--tartarus-border)] pt-4">
            {/* Quick Stats Bar - Minimal, non-redundant info */}
            <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--tartarus-ivory-muted)]">
              {project.last_entry_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  {formatDateShort(project.last_entry_date)}
                </span>
              )}
              {project.linear_project_id && (
                <Badge
                  variant="outline"
                  className="border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)]"
                >
                  Linear
                </Badge>
              )}
            </div>

            {/* Index Summary Panel - AI-generated summary for Kronus indexing */}
            {showIndexSummary && project.summary && (
              <div className="rounded-lg border border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] p-3">
                <div className="mb-2 flex items-center gap-2 text-xs text-[var(--tartarus-teal)]">
                  <Brain className="h-3 w-3" />
                  <span className="font-medium">Index blurb</span>
                  <span className="text-[var(--tartarus-ivory-muted)]">(retrieval / Entry 0 summary)</span>
                </div>
                <p className="text-sm leading-relaxed text-[var(--tartarus-ivory-dim)]">
                  {project.summary}
                </p>
              </div>
            )}

            {/* Repository overview — structured Entry 0 */}
            {hasEntry0 && (
              <div className="overflow-hidden rounded-lg border border-[var(--tartarus-teal-dim)]/30 bg-gradient-to-r from-[var(--tartarus-teal)]/5 to-transparent">
                <button
                  onClick={() => setShowEntry0(!showEntry0)}
                  className="flex w-full items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--tartarus-teal)]/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--tartarus-teal)]/20">
                      <BookOpen className="h-4 w-4 text-[var(--tartarus-teal)]" />
                    </div>
                    <div className="text-left">
                      <div className="text-sm font-medium text-[var(--tartarus-ivory)]">
                        Repository overview
                      </div>
                      <div className="text-xs text-[var(--tartarus-ivory-muted)]">
                        Entry 0 — architecture, stack, patterns, commands
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {showEntry0 ? (
                      <EyeOff className="h-4 w-4 text-[var(--tartarus-teal)]" />
                    ) : (
                      <Eye className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                    )}
                    {showEntry0 ? (
                      <ChevronDown className="h-4 w-4 text-[var(--tartarus-teal)]" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                    )}
                  </div>
                </button>

                {showEntry0 && (
                  <div className="space-y-3 border-t border-[var(--tartarus-teal-dim)]/20 px-4 pt-2 pb-4">
                    {/* Grid of Entry 0 sections */}
                    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                      {/* File Structure - Full width, code style */}
                      {project.file_structure && (
                        <div className="lg:col-span-2">
                          <SummarySection title="File Structure" icon={FolderGit2} variant="code">
                            <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                              {project.file_structure}
                            </pre>
                          </SummarySection>
                        </div>
                      )}

                      {/* Tech Stack */}
                      {project.tech_stack && (
                        <SummarySection title="Tech Stack" icon={Code}>
                          <KronusMarkdown>{project.tech_stack}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Frontend */}
                      {project.frontend && (
                        <SummarySection title="Frontend" icon={Layers}>
                          <KronusMarkdown>{project.frontend}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Backend */}
                      {project.backend && (
                        <SummarySection title="Backend" icon={Server}>
                          <KronusMarkdown>{project.backend}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Database */}
                      {project.database_info && (
                        <SummarySection title="Database" icon={Database}>
                          <KronusMarkdown>{project.database_info}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Services */}
                      {project.services && (
                        <SummarySection title="Services & APIs" icon={Workflow}>
                          <KronusMarkdown>{project.services}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Data Flow */}
                      {project.data_flow && (
                        <SummarySection title="Data Flow" icon={GitBranch}>
                          <KronusMarkdown>{project.data_flow}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Custom Tooling */}
                      {project.custom_tooling && (
                        <SummarySection title="Custom Tooling" icon={Sparkles}>
                          <KronusMarkdown>{project.custom_tooling}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Patterns */}
                      {project.patterns && (
                        <SummarySection title="Patterns & Conventions" icon={FileCode}>
                          <KronusMarkdown>{project.patterns}</KronusMarkdown>
                        </SummarySection>
                      )}

                      {/* Commands - Code style */}
                      {project.commands && (
                        <SummarySection title="Commands" icon={Terminal} variant="code">
                          <pre className="font-mono text-xs whitespace-pre-wrap text-[var(--tartarus-ivory-muted)]">
                            {project.commands}
                          </pre>
                        </SummarySection>
                      )}

                      {/* Notes & Gotchas - Warning style, full width */}
                      {project.extended_notes && (
                        <div className="lg:col-span-2">
                          <SummarySection
                            title="Notes & Gotchas"
                            icon={AlertCircle}
                            variant="warning"
                            defaultOpen
                          >
                            <KronusMarkdown>{project.extended_notes}</KronusMarkdown>
                          </SummarySection>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Narrative blocks only (no extended Entry 0 grid yet) */}
            {!hasEntry0 && (project.purpose || project.architecture || project.key_decisions) && (
              <div className="overflow-hidden rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)]/50">
                <div className="flex items-center gap-2 border-b border-[var(--tartarus-border)]/50 px-4 py-2">
                  <Scroll className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                  <span className="text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                    Core fields
                  </span>
                  <Badge
                    variant="outline"
                    className="border-[var(--tartarus-ivory-faded)] text-xs text-[var(--tartarus-ivory-faded)]"
                  >
                    No extended grid
                  </Badge>
                </div>
                <div className="space-y-3 p-4">
                  {project.purpose && (
                    <SummarySection title="Purpose" icon={Target} defaultOpen>
                      <KronusMarkdown>{project.purpose}</KronusMarkdown>
                    </SummarySection>
                  )}
                  {project.architecture && (
                    <SummarySection title="Architecture" icon={Layers}>
                      <KronusMarkdown>{project.architecture}</KronusMarkdown>
                    </SummarySection>
                  )}
                  {project.key_decisions && (
                    <SummarySection title="Key Decisions" icon={BookOpen}>
                      <KronusMarkdown>{project.key_decisions}</KronusMarkdown>
                    </SummarySection>
                  )}
                </div>
              </div>
            )}

            {/* Needs Analysis Prompt */}
            {needsAnalysis && (
              <div className="rounded-lg border border-dashed border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold)]/5 p-4 text-center">
                <BookOpen className="mx-auto mb-2 h-6 w-6 text-[var(--tartarus-gold)]" />
                <p className="mb-2 text-sm text-[var(--tartarus-ivory-muted)]">
                  This repository has {project.entry_count} journal entries but no structured Repository overview yet.
                </p>
                <Button
                  size="sm"
                  onClick={onAnalyze}
                  disabled={analyzing}
                  title="Refresh Entry 0 from recent journal rows. With CURSOR_API_KEY + a matching delegate repo, Cursor validates against the local tree before merge."
                  className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
                >
                  {analyzing ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <BookOpen className="mr-1.5 h-4 w-4" />
                  )}
                  Generate overview from journal
                </Button>
              </div>
            )}

            {/* Children slot for entries list, attachments, etc. */}
            {children}
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
