"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Search,
  GitBranch,
  Calendar,
  User,
  Paperclip,
  Sparkles,
  FolderGit2,
  ChevronRight,
  ChevronDown,
  Plus,
  Settings,
  ExternalLink,
  FileText,
  Layers,
  Image as ImageIcon,
  FileCode,
  File,
  Brain,
  Loader2,
  Code,
  Database,
  Server,
  Workflow,
  Terminal,
  AlertCircle,
} from "lucide-react";
import { MermaidPreview } from "@/components/multimedia/MermaidPreview";
import { useRouter } from "next/navigation";
import { formatDateShort } from "@/lib/utils";

// Helper to clean technology strings from markdown formatting
function cleanTechnologies(techString: string): string[] {
  // First, remove **Label:** patterns and extract just the tech names
  const cleaned = techString
    .replace(/\*\*[^*]+:\*\*\s*/g, '') // Remove **Label:** patterns
    .replace(/\*\*/g, '') // Remove remaining ** markers
    .replace(/\([^)]+\)/g, '') // Remove parenthetical notes like (GPT-4-mini)
    .replace(/\n/g, ', ') // Convert newlines to commas
    .split(/[,\n]/) // Split by comma or newline
    .map(tech => tech.trim())
    .filter(tech => {
      if (!tech || tech.length === 0) return false;
      if (tech === ':') return false;
      // Skip items that look like descriptions or scripts
      if (tech.includes('.py') || tech.includes('.sql')) return false;
      if (tech.length > 40) return false; // Skip long descriptions
      return true;
    })
    .map(tech => tech.replace(/^[-•]\s*/, '')); // Remove bullet points

  // Deduplicate
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
  // Living Project Summary (Entry 0) fields
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

interface JournalEntry {
  id: number;
  commit_hash: string;
  repository: string;
  branch: string;
  author: string;
  date: string;
  why: string;
  what_changed: string;
  decisions: string;
  technologies: string;
  kronus_wisdom: string | null;
  created_at: string;
  attachment_count: number;
}

interface Attachment {
  id: number;
  commit_hash: string;
  filename: string;
  mime_type: string;
  description: string | null;
  size: number;
  created_at: string;
  repository: string;
  branch: string;
}

export default function ReaderPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [attachmentContents, setAttachmentContents] = useState<Record<number, string>>({});
  const [expandedAttachments, setExpandedAttachments] = useState<Set<number>>(new Set());
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [attachmentsLoading, setAttachmentsLoading] = useState<Record<string, boolean>>({});
  const [showAttachments, setShowAttachments] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState("projects");
  const [analyzingProject, setAnalyzingProject] = useState<string | null>(null);

  useEffect(() => {
    fetchProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      fetchEntriesForProject(selectedProject);
    }
  }, [selectedProject]);

  const fetchProjects = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/project-summaries");
      const data = await response.json();
      setProjects(data.summaries || []);
      // Auto-expand first project if exists
      if (data.summaries?.length > 0) {
        setExpandedProjects(new Set([data.summaries[0].repository]));
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchEntriesForProject = async (repository: string) => {
    setEntriesLoading(true);
    try {
      const params = new URLSearchParams({
        repository,
        limit: "50",
      });
      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
    } catch (error) {
      console.error("Failed to fetch entries:", error);
    } finally {
      setEntriesLoading(false);
    }
  };

  const fetchAttachmentsForProject = async (repository: string) => {
    if (attachments[repository]) return; // Already fetched

    setAttachmentsLoading(prev => ({ ...prev, [repository]: true }));
    try {
      const params = new URLSearchParams({ repository });
      const response = await fetch(`/api/attachments/by-repository?${params}`);
      const data = await response.json();
      setAttachments(prev => ({ ...prev, [repository]: data.attachments || [] }));
      // Don't auto-fetch content - wait for explicit click
    } catch (error) {
      console.error("Failed to fetch attachments:", error);
    } finally {
      setAttachmentsLoading(prev => ({ ...prev, [repository]: false }));
    }
  };

  const fetchAttachmentContent = async (attachmentId: number) => {
    if (attachmentContents[attachmentId]) return; // Already fetched

    try {
      const response = await fetch(`/api/attachments/${attachmentId}?include_data=true`);
      const data = await response.json();
      if (data.data_base64) {
        const decoded = atob(data.data_base64);
        setAttachmentContents(prev => ({ ...prev, [attachmentId]: decoded }));
      }
    } catch (error) {
      console.error("Failed to fetch attachment content:", error);
    }
  };

  const toggleShowAttachments = (repository: string) => {
    const newShow = new Set(showAttachments);
    if (newShow.has(repository)) {
      newShow.delete(repository);
    } else {
      newShow.add(repository);
      fetchAttachmentsForProject(repository);
    }
    setShowAttachments(newShow);
  };

  const toggleAttachmentExpand = (attachmentId: number, isMermaid: boolean) => {
    const newExpanded = new Set(expandedAttachments);
    if (newExpanded.has(attachmentId)) {
      newExpanded.delete(attachmentId);
    } else {
      newExpanded.add(attachmentId);
      // Fetch mermaid content on expand
      if (isMermaid) {
        fetchAttachmentContent(attachmentId);
      }
    }
    setExpandedAttachments(newExpanded);
  };

  const toggleProject = (repository: string) => {
    const newExpanded = new Set(expandedProjects);
    if (newExpanded.has(repository)) {
      newExpanded.delete(repository);
    } else {
      newExpanded.add(repository);
      setSelectedProject(repository);
      // Don't auto-fetch attachments - user clicks "Show Attachments" button
    }
    setExpandedProjects(newExpanded);
  };

  // Navigate to chat to create new project
  const createNewProject = () => {
    const context = `I want to CREATE a new project in my journal. Please help me set it up.

I'll need:
- **Repository name**: The name of the repository/project
- **Git URL**: Optional GitHub/GitLab URL
- **Summary**: A brief description of what the project is about
- **Purpose**: The goals and objectives
- **Technologies**: Key technologies used

Please guide me through creating a new project summary using the journal_create_project_summary tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Navigate to chat to create new entry
  const createNewEntry = (repository?: string) => {
    const context = repository
      ? `I want to CREATE a new journal entry for the **${repository}** project.

Please help me document:
- What I worked on
- Why I made these changes
- Key decisions made
- Technologies used

You can use the journal_create_entry tool to create a new entry.`
      : `I want to CREATE a new journal entry. Please help me document my work.

I'll need to provide:
- Which repository/project this is for
- What I worked on
- Why I made these changes
- Key decisions made

You can use the journal_create_entry tool to create a new entry.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Navigate to chat to edit project
  const editProjectWithKronus = (project: ProjectSummary, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const context = `I want to UPDATE this project summary. Please help me modify it:

**Repository:** ${project.repository}
${project.git_url ? `**Git URL:** ${project.git_url}` : ""}

**Current Summary:**
${project.summary?.substring(0, 500)}${project.summary && project.summary.length > 500 ? "..." : ""}

**Current Purpose:**
${project.purpose?.substring(0, 300) || "(none)"}${project.purpose && project.purpose.length > 300 ? "..." : ""}

**Technologies:** ${project.technologies || "(none)"}

**Status:** ${project.status || "(none)"}

What would you like to change? You can update any field using the journal_update_project_summary tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Navigate to chat to edit entry
  const editEntryWithKronus = (entry: JournalEntry, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const context = `I want to UPDATE this journal entry. Please help me modify it:

**Commit Hash:** ${entry.commit_hash}
**Repository:** ${entry.repository}/${entry.branch}
**Date:** ${formatDateShort(entry.date)}
**Author:** ${entry.author}

**Why:**
${entry.why}

**Decisions:**
${entry.decisions}

**Technologies:** ${entry.technologies}

**Kronus Wisdom:** ${entry.kronus_wisdom || "(none)"}

What changes would you like to make? You can update any field using the journal_edit_entry tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Analyze project entries with AI to update Entry 0
  const analyzeProject = async (repository: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setAnalyzingProject(repository);
    try {
      const response = await fetch("/api/project-summaries/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repository, entries_to_analyze: 10 }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Analysis failed");
      }

      // Refresh projects to show updated Entry 0
      await fetchProjects();
    } catch (error) {
      console.error("Failed to analyze project:", error);
      alert(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setAnalyzingProject(null);
    }
  };

  const filteredProjects = searchQuery
    ? projects.filter(
        (p) =>
          p.repository.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.summary?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          p.technologies?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projects;

  const filteredEntries = searchQuery
    ? entries.filter(
        (e) =>
          e.why.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.commit_hash.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.technologies?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  return (
    <div className="flex h-full flex-col bg-[var(--tartarus-void)]">
      {/* Header */}
      <header className="flex h-14 items-center justify-between px-6 border-b border-[var(--tartarus-border)]">
        <div className="flex items-center gap-3">
          <Layers className="h-5 w-5 text-[var(--tartarus-teal)]" />
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">Developer Journal</h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[var(--tartarus-ivory-muted)] border-[var(--tartarus-border)]">
            {projects.length} projects
          </Badge>
          <Button
            size="sm"
            onClick={createNewProject}
            className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
          >
            <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
            New Project
          </Button>
        </div>
      </header>

      {/* Search & Tabs */}
      <div className="flex items-center gap-4 px-6 py-3 border-b border-[var(--tartarus-border)]">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[var(--tartarus-ivory-muted)]" />
          <Input
            placeholder="Search projects and entries..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
          />
        </div>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-[var(--tartarus-surface)]">
            <TabsTrigger value="projects" className="data-[state=active]:bg-[var(--tartarus-teal-soft)] data-[state=active]:text-[var(--tartarus-teal)]">
              Projects
            </TabsTrigger>
            <TabsTrigger value="timeline" className="data-[state=active]:bg-[var(--tartarus-teal-soft)] data-[state=active]:text-[var(--tartarus-teal)]">
              Timeline
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* Content */}
      <ScrollArea className="flex-1">
        {activeTab === "projects" ? (
          <div className="p-6 space-y-4">
            {loading ? (
              // Loading skeletons
              Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                  <CardHeader>
                    <Skeleton className="h-6 w-1/3 bg-[var(--tartarus-elevated)]" />
                    <Skeleton className="h-4 w-2/3 bg-[var(--tartarus-elevated)]" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-20 w-full bg-[var(--tartarus-elevated)]" />
                  </CardContent>
                </Card>
              ))
            ) : filteredProjects.length === 0 ? (
              <div className="py-12 text-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="h-16 w-16 rounded-full bg-[var(--tartarus-elevated)] flex items-center justify-center">
                    <FolderGit2 className="h-8 w-8 text-[var(--tartarus-ivory-muted)]" />
                  </div>
                  <p className="text-[var(--tartarus-ivory-muted)]">No projects found.</p>
                  <Button
                    onClick={createNewProject}
                    className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
                  >
                    <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                    Create First Project
                  </Button>
                </div>
              </div>
            ) : (
              filteredProjects.map((project) => (
                <Collapsible
                  key={project.id}
                  open={expandedProjects.has(project.repository)}
                  onOpenChange={() => toggleProject(project.repository)}
                >
                  <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] overflow-hidden">
                    {/* Project Header */}
                    <CollapsibleTrigger asChild>
                      <CardHeader className="cursor-pointer hover:bg-[var(--tartarus-elevated)] transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {expandedProjects.has(project.repository) ? (
                                <ChevronDown className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                              )}
                              <FolderGit2 className="h-5 w-5 text-[var(--tartarus-teal)]" />
                              <CardTitle className="text-lg text-[var(--tartarus-ivory)]">
                                {project.repository}
                              </CardTitle>
                              <Badge className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)] ml-2">
                                {project.entry_count} entries
                              </Badge>
                              {project.id === -1 && (
                                <Badge className="bg-[var(--tartarus-gold-soft)] text-[var(--tartarus-gold)] ml-1">
                                  New
                                </Badge>
                              )}
                            </div>
                            <CardDescription className="mt-1 ml-10 line-clamp-2 text-[var(--tartarus-ivory-muted)]">
                              {project.summary?.substring(0, 200)}...
                            </CardDescription>
                          </div>
                          <div className="flex items-center gap-2">
                            {project.git_url && (
                              <Button
                                variant="ghost"
                                size="icon"
                                asChild
                                onClick={(e) => e.stopPropagation()}
                                className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)]"
                              >
                                <a href={project.git_url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => analyzeProject(project.repository, e)}
                              disabled={analyzingProject === project.repository || project.entry_count === 0}
                              className={`${project.id === -1 ? "text-[var(--tartarus-gold)] hover:text-[var(--tartarus-gold-bright)] hover:bg-[var(--tartarus-gold-soft)]" : "text-[var(--tartarus-teal)] hover:text-[var(--tartarus-teal-bright)] hover:bg-[var(--tartarus-teal-soft)]"}`}
                            >
                              {analyzingProject === project.repository ? (
                                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                              ) : (
                                <Brain className="h-4 w-4 mr-1.5" />
                              )}
                              {analyzingProject === project.repository ? "Analyzing..." : project.id === -1 ? "Initialize" : "Analyze"}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => editProjectWithKronus(project, e)}
                              className="text-[var(--tartarus-gold)] hover:text-[var(--tartarus-gold-bright)] hover:bg-[var(--tartarus-gold-soft)]"
                            >
                              <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-1.5 rounded-full object-cover" />
                              Edit
                            </Button>
                          </div>
                        </div>
                        {project.technologies && (
                          <div className="flex flex-wrap gap-1 mt-2 ml-10">
                            {cleanTechnologies(project.technologies).slice(0, 6).map((tech) => (
                              <Badge key={tech} variant="outline" className="text-xs border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]">
                                {tech.split(" ")[0]}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </CardHeader>
                    </CollapsibleTrigger>

                    {/* Expanded Content */}
                    <CollapsibleContent>
                      <CardContent className="border-t border-[var(--tartarus-border)] pt-4">
                        {/* Project Details */}
                        {project.purpose && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] mb-2">Purpose</h4>
                            <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)]">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {project.purpose}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {project.architecture && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] mb-2">Architecture</h4>
                            <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)] prose-headings:text-[var(--tartarus-ivory)] prose-h2:text-base prose-h3:text-sm">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {project.architecture}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {project.key_decisions && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] mb-2">Key Decisions</h4>
                            <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)]">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {project.key_decisions}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {project.status && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] mb-2">Status</h4>
                            <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-gold)]">
                              <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
                                {project.status}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}

                        {/* Technologies (full list) */}
                        {project.technologies && (
                          <div className="mb-4">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] mb-2">Technologies</h4>
                            <div className="flex flex-wrap gap-1.5">
                              {cleanTechnologies(project.technologies).map((tech) => (
                                <Badge key={tech} variant="outline" className="text-xs border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]">
                                  {tech}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Living Project Summary (Entry 0) */}
                        {(project.file_structure || project.tech_stack || project.frontend || project.backend || project.database_info || project.services || project.commands || project.patterns || project.extended_notes) && (
                          <div className="mb-4 border-t border-[var(--tartarus-border)] pt-4">
                            <div className="flex items-center gap-2 mb-3">
                              <Brain className="h-4 w-4 text-[var(--tartarus-teal)]" />
                              <h4 className="text-sm font-medium text-[var(--tartarus-teal)]">Living Project Summary</h4>
                              {project.entries_synced && (
                                <Badge variant="outline" className="text-xs border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">
                                  {project.entries_synced} entries analyzed
                                </Badge>
                              )}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {project.file_structure && (
                                <div className="col-span-2">
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <FolderGit2 className="h-3 w-3" /> File Structure
                                  </h5>
                                  <pre className="text-xs text-[var(--tartarus-ivory-muted)] bg-[var(--tartarus-elevated)] p-2 rounded overflow-x-auto">
                                    {project.file_structure}
                                  </pre>
                                </div>
                              )}

                              {project.tech_stack && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Code className="h-3 w-3" /> Tech Stack
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)] prose-strong:text-[var(--tartarus-ivory)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.tech_stack}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.frontend && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Layers className="h-3 w-3" /> Frontend
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.frontend}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.backend && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Server className="h-3 w-3" /> Backend
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.backend}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.database_info && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Database className="h-3 w-3" /> Database
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.database_info}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.services && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Workflow className="h-3 w-3" /> Services
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.services}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.commands && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <Terminal className="h-3 w-3" /> Commands
                                  </h5>
                                  <pre className="text-xs text-[var(--tartarus-ivory-muted)] bg-[var(--tartarus-elevated)] p-2 rounded">
                                    {project.commands}
                                  </pre>
                                </div>
                              )}

                              {project.patterns && (
                                <div>
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <FileCode className="h-3 w-3" /> Patterns
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.patterns}</ReactMarkdown>
                                  </div>
                                </div>
                              )}

                              {project.extended_notes && (
                                <div className="col-span-2">
                                  <h5 className="text-xs font-medium text-[var(--tartarus-ivory-muted)] mb-1 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" /> Notes & Gotchas
                                  </h5>
                                  <div className="prose prose-sm max-w-none text-[var(--tartarus-ivory-muted)]">
                                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{project.extended_notes}</ReactMarkdown>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Metadata */}
                        <div className="mb-4 flex items-center gap-4 text-xs text-[var(--tartarus-ivory-muted)]">
                          {project.last_entry_date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              Last entry: {formatDateShort(project.last_entry_date)}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {project.entry_count} entries
                          </span>
                          {project.linear_project_id && (
                            <Badge variant="outline" className="text-xs border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">
                              Linear Linked
                            </Badge>
                          )}
                        </div>

                        {/* Attachments Section */}
                        <div className="mb-4">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-sm font-medium text-[var(--tartarus-teal)] flex items-center gap-2">
                              <Paperclip className="h-4 w-4" />
                              Attachments
                            </h4>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleShowAttachments(project.repository)}
                              className="text-xs text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                            >
                              {showAttachments.has(project.repository) ? (
                                <>
                                  <ChevronDown className="h-3 w-3 mr-1" />
                                  Hide
                                </>
                              ) : (
                                <>
                                  <ChevronRight className="h-3 w-3 mr-1" />
                                  Show
                                </>
                              )}
                            </Button>
                          </div>

                          {showAttachments.has(project.repository) && (
                            <>
                              {attachmentsLoading[project.repository] ? (
                                <div className="space-y-2">
                                  <Skeleton className="h-12 w-full bg-[var(--tartarus-elevated)]" />
                                </div>
                              ) : attachments[project.repository]?.length === 0 ? (
                                <p className="text-xs text-[var(--tartarus-ivory-muted)] py-2">No attachments</p>
                              ) : (
                                <div className="space-y-2">
                                  {/* All attachments as clickable items */}
                                  {attachments[project.repository]?.map(att => {
                                    const isMermaid = att.filename.endsWith('.mmd') || att.filename.endsWith('.mermaid');
                                    const isImage = att.mime_type.startsWith('image/');
                                    const isExpanded = expandedAttachments.has(att.id);

                                    return (
                                      <div key={att.id} className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-elevated)] overflow-hidden">
                                        {/* Clickable header */}
                                        <button
                                          onClick={() => toggleAttachmentExpand(att.id, isMermaid)}
                                          className="w-full flex items-center gap-2 px-3 py-2 bg-[var(--tartarus-surface)] hover:bg-[var(--tartarus-elevated)] transition-colors text-left"
                                        >
                                          {isExpanded ? (
                                            <ChevronDown className="h-3 w-3 text-[var(--tartarus-ivory-muted)]" />
                                          ) : (
                                            <ChevronRight className="h-3 w-3 text-[var(--tartarus-ivory-muted)]" />
                                          )}
                                          {isMermaid ? (
                                            <FileCode className="h-4 w-4 text-[var(--tartarus-teal)]" />
                                          ) : isImage ? (
                                            <ImageIcon className="h-4 w-4 text-[var(--tartarus-teal)]" />
                                          ) : (
                                            <File className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                                          )}
                                          <span className="text-sm text-[var(--tartarus-ivory)] flex-1">{att.filename}</span>
                                          {att.description && (
                                            <span className="text-xs text-[var(--tartarus-ivory-muted)] truncate max-w-[200px]">{att.description}</span>
                                          )}
                                          <span className="text-xs text-[var(--tartarus-ivory-faded)]">
                                            {(att.size / 1024).toFixed(1)} KB
                                          </span>
                                        </button>

                                        {/* Expanded content - only rendered on click */}
                                        {isExpanded && (
                                          <div className="border-t border-[var(--tartarus-border)]">
                                            {isMermaid ? (
                                              <div className="p-4 bg-white dark:bg-slate-950">
                                                {attachmentContents[att.id] ? (
                                                  <MermaidPreview code={attachmentContents[att.id]} />
                                                ) : (
                                                  <div className="text-sm text-[var(--tartarus-ivory-muted)]">Loading diagram...</div>
                                                )}
                                              </div>
                                            ) : isImage ? (
                                              <div className="p-4">
                                                <img
                                                  src={`/api/attachments/${att.id}/raw`}
                                                  alt={att.description || att.filename}
                                                  className="max-w-full h-auto rounded"
                                                  loading="lazy"
                                                />
                                              </div>
                                            ) : (
                                              <div className="p-3 text-xs text-[var(--tartarus-ivory-muted)]">
                                                <a
                                                  href={`/api/attachments/${att.id}/raw`}
                                                  download={att.filename}
                                                  className="text-[var(--tartarus-teal)] hover:underline"
                                                >
                                                  Download file
                                                </a>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Entries List */}
                        <div className="mt-4 border-t border-[var(--tartarus-border)] pt-4">
                          <div className="flex items-center justify-between mb-3">
                            <h4 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                              Journal Entries
                            </h4>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => createNewEntry(project.repository)}
                              className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)]"
                            >
                              <Plus className="h-4 w-4 mr-1" />
                              New Entry
                            </Button>
                          </div>

                          {selectedProject === project.repository ? (
                            entriesLoading ? (
                              <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                  <Skeleton key={i} className="h-16 w-full bg-[var(--tartarus-elevated)]" />
                                ))}
                              </div>
                            ) : filteredEntries.length === 0 ? (
                              <div className="py-6 text-center">
                                <p className="text-[var(--tartarus-ivory-muted)] text-sm">No entries yet.</p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {filteredEntries.slice(0, 10).map((entry) => (
                                  <Link key={entry.id} href={`/reader/${entry.commit_hash}`}>
                                    <div className="group flex items-start gap-3 p-3 rounded-lg bg-[var(--tartarus-elevated)] hover:bg-[var(--tartarus-deep)] transition-colors cursor-pointer border border-[var(--tartarus-border)]">
                                      <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 text-xs text-[var(--tartarus-ivory-muted)]">
                                          <span className="font-mono">{entry.commit_hash.substring(0, 7)}</span>
                                          <span className="flex items-center gap-1">
                                            <GitBranch className="h-3 w-3" />
                                            {entry.branch}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {formatDateShort(entry.date)}
                                          </span>
                                          {entry.attachment_count > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Paperclip className="h-3 w-3" />
                                              {entry.attachment_count}
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-sm text-[var(--tartarus-ivory)] mt-1 line-clamp-2">
                                          {entry.why.replace(/[#*`]/g, "").substring(0, 150)}...
                                        </p>
                                        {entry.kronus_wisdom && (
                                          <div className="flex items-center gap-1 mt-1 text-xs text-[var(--tartarus-teal)]">
                                            <Sparkles className="h-3 w-3" />
                                            <span className="line-clamp-1 italic">{entry.kronus_wisdom.substring(0, 80)}...</span>
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          className="h-7 text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)] text-xs px-2"
                                          onClick={(e) => editEntryWithKronus(entry, e)}
                                        >
                                          <img src="/chronus-logo.png" alt="Kronus" className="h-3.5 w-3.5 mr-1 rounded-full object-cover" />
                                          Edit
                                        </Button>
                                        <ChevronRight className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                                      </div>
                                    </div>
                                  </Link>
                                ))}
                                {entries.length > 10 && (
                                  <div className="text-center py-2">
                                    <Link href={`/reader?project=${project.repository}`}>
                                      <Button variant="ghost" size="sm" className="text-[var(--tartarus-teal)]">
                                        View all {entries.length} entries
                                      </Button>
                                    </Link>
                                  </div>
                                )}
                              </div>
                            )
                          ) : (
                            <div className="py-4 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setSelectedProject(project.repository);
                                  const newExpanded = new Set(expandedProjects);
                                  newExpanded.add(project.repository);
                                  setExpandedProjects(newExpanded);
                                }}
                                className="text-[var(--tartarus-teal)]"
                              >
                                Load {project.entry_count} entries
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              ))
            )}
          </div>
        ) : (
          // Timeline View - All entries chronologically
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-medium text-[var(--tartarus-ivory)]">All Entries</h2>
              <Button
                size="sm"
                onClick={() => createNewEntry()}
                className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
              >
                <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                New Entry
              </Button>
            </div>

            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full bg-[var(--tartarus-elevated)]" />
              ))
            ) : (
              <TimelineEntries searchQuery={searchQuery} onEditEntry={editEntryWithKronus} />
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

// Timeline component for all entries view
function TimelineEntries({
  searchQuery,
  onEditEntry
}: {
  searchQuery: string;
  onEditEntry: (entry: JournalEntry, e: React.MouseEvent) => void;
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    fetchAllEntries();
  }, [page]);

  const fetchAllEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: "20",
        offset: String(page * 20),
      });
      const response = await fetch(`/api/entries?${params}`);
      const data = await response.json();
      setEntries(data.entries || []);
      setHasMore(data.has_more || false);
    } catch (error) {
      console.error("Failed to fetch entries:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredEntries = searchQuery
    ? entries.filter(
        (e) =>
          e.why.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.repository.toLowerCase().includes(searchQuery.toLowerCase()) ||
          e.commit_hash.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : entries;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full bg-[var(--tartarus-elevated)]" />
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        {filteredEntries.map((entry) => (
          <Link key={entry.id} href={`/reader/${entry.commit_hash}`}>
            <Card className="group hover:bg-[var(--tartarus-elevated)] transition-colors border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 text-sm">
                      <FolderGit2 className="h-4 w-4 text-[var(--tartarus-teal)]" />
                      <span className="font-medium text-[var(--tartarus-ivory)]">{entry.repository}</span>
                      <span className="text-[var(--tartarus-ivory-muted)]">/</span>
                      <span className="text-[var(--tartarus-ivory-muted)] flex items-center gap-1">
                        <GitBranch className="h-3 w-3" />
                        {entry.branch}
                      </span>
                    </div>
                    <div className="text-xs text-[var(--tartarus-ivory-muted)] mt-1 flex items-center gap-3">
                      <span className="font-mono">{entry.commit_hash.substring(0, 7)}</span>
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {entry.author}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDateShort(entry.date)}
                      </span>
                      {entry.attachment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <Paperclip className="h-3 w-3" />
                          {entry.attachment_count}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--tartarus-ivory-muted)] mt-2 line-clamp-2">
                      {entry.why.replace(/[#*`]/g, "").substring(0, 200)}...
                    </p>
                    {entry.kronus_wisdom && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-[var(--tartarus-teal)]">
                        <Sparkles className="h-3 w-3" />
                        <span className="line-clamp-1 italic">{entry.kronus_wisdom.substring(0, 100)}...</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold-soft)] text-xs"
                      onClick={(e) => onEditEntry(entry, e)}
                    >
                      <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-1.5 rounded-full object-cover" />
                      Edit
                    </Button>
                    <ChevronRight className="h-5 w-5 text-[var(--tartarus-ivory-muted)]" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Pagination */}
      {filteredEntries.length > 0 && (
        <div className="flex items-center justify-center gap-4 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(Math.max(0, page - 1))}
            disabled={page === 0}
            className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]"
          >
            Previous
          </Button>
          <span className="text-sm text-[var(--tartarus-ivory-muted)]">Page {page + 1}</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage(page + 1)}
            disabled={!hasMore}
            className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]"
          >
            Next
          </Button>
        </div>
      )}
    </>
  );
}
