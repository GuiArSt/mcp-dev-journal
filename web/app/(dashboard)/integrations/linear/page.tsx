"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  Plus,
  User,
  Building2,
  Layers,
  Circle,
  RefreshCw,
  ExternalLink,
  Filter,
  Expand,
} from "lucide-react";

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  state: {
    id: string;
    name: string;
    color: string;
  };
  assignee?: {
    id: string;
    name: string;
    email: string;
  };
  project?: {
    id: string;
    name: string;
  };
  team: {
    id: string;
    name: string;
  };
  url: string;
}

interface LinearProject {
  id: string;
  name: string;
  description?: string;
  content?: string;
  state: string;
  progress: number;
  targetDate?: string;
  url?: string;
  lead?: {
    id: string;
    name: string;
  };
}

interface LinearViewer {
  id: string;
  name: string;
  email: string;
  teams: Array<{ id: string; name: string }>;
  configuredUserId?: string; // LINEAR_USER_ID from env
}

const priorityLabels: Record<number, { label: string; color: string; emoji: string }> = {
  0: { label: "No priority", color: "text-[var(--tartarus-ivory-faded)]", emoji: "○" },
  1: { label: "Urgent", color: "text-[var(--tartarus-error)]", emoji: "●" },
  2: { label: "High", color: "text-[var(--tartarus-warning)]", emoji: "●" },
  3: { label: "Medium", color: "text-[var(--tartarus-gold)]", emoji: "●" },
  4: { label: "Low", color: "text-[var(--tartarus-teal)]", emoji: "●" },
};

export default function LinearPage() {
  const router = useRouter();
  const [viewer, setViewer] = useState<LinearViewer | null>(null);
  const [issues, setIssues] = useState<LinearIssue[]>([]);
  const [projects, setProjects] = useState<LinearProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<string>("all");
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [showAllProjects, setShowAllProjects] = useState(false);
  const [filteredByUser, setFilteredByUser] = useState(false);
  
  // Detail dialogs
  const [selectedIssue, setSelectedIssue] = useState<LinearIssue | null>(null);
  const [selectedProject, setSelectedProject] = useState<LinearProject | null>(null);

  useEffect(() => {
    fetchViewer();
  }, []);

  useEffect(() => {
    fetchIssues();
  }, [showAllIssues]);

  useEffect(() => {
    fetchProjects();
  }, [showAllProjects]);

  const fetchViewer = async () => {
    try {
      const response = await fetch("/api/integrations/linear/viewer");
      if (response.ok) {
        const data = await response.json();
        setViewer(data);
      }
    } catch (error) {
      console.error("Failed to fetch viewer:", error);
    }
  };

  const fetchIssues = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (showAllIssues) params.set("showAll", "true");
      
      const response = await fetch(`/api/integrations/linear/issues?${params}`);
      if (response.ok) {
        const data = await response.json();
        setIssues(data.issues || []);
        setFilteredByUser(data.filteredByUser || false);
      }
    } catch (error) {
      console.error("Failed to fetch issues:", error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProjects = async () => {
    try {
      const params = new URLSearchParams();
      if (showAllProjects) params.set("showAll", "true");
      
      const response = await fetch(`/api/integrations/linear/projects?${params}`);
      if (response.ok) {
        const data = await response.json();
        setProjects(data.projects || []);
      }
    } catch (error) {
      console.error("Failed to fetch projects:", error);
    }
  };

  // Navigate to chat to UPDATE an issue
  const editIssueWithAI = (issue: LinearIssue) => {
    const context = `I want to UPDATE this Linear issue. Please help me modify it:\n\n**Issue ID:** ${issue.id}\n**${issue.identifier}: ${issue.title}**\n- Status: ${issue.state.name}\n- Priority: ${priorityLabels[issue.priority]?.emoji} ${priorityLabels[issue.priority]?.label}\n- Team: ${issue.team.name}${issue.project ? `\n- Project: ${issue.project.name}` : ""}${issue.assignee ? `\n- Assignee: ${issue.assignee.name}` : ""}${issue.description ? `\n\n**Current Description:**\n${issue.description}` : ""}\n\nWhat changes would you like to make? You can update the title, description, status, priority, or assignee using the linear_update_issue tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  // Navigate to chat to UPDATE a project
  const editProjectWithAI = (project: LinearProject) => {
    const contentSection = project.content
      ? `\n\n**Current Content (Rich Text):**\n${project.content.substring(0, 2000)}${project.content.length > 2000 ? "..." : ""}`
      : "";
    const descriptionSection = project.description
      ? `\n\n**Description:**\n${project.description}`
      : "";

    const context = `I want to UPDATE this Linear project. Please help me modify it:\n\n**Project ID:** ${project.id}\n**${project.name}**\n- State: ${project.state}\n- Progress: ${Math.round(project.progress * 100)}%${project.lead ? `\n- Lead: ${project.lead.name}` : ""}${project.targetDate ? `\n- Target: ${project.targetDate}` : ""}${project.url ? `\n- URL: ${project.url}` : ""}${descriptionSection}${contentSection}\n\nWhat changes would you like to make? You can update the name, description, or content using the linear_update_project tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  const filteredIssues = issues.filter((issue) => {
    const matchesSearch =
      !searchQuery ||
      issue.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      issue.identifier.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTeam = selectedTeam === "all" || issue.team.id === selectedTeam;
    return matchesSearch && matchesTeam;
  });

  return (
    <div className="journal-page flex h-full flex-col">
      {/* Header */}
      <header className="journal-header flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <h1 className="journal-title text-lg">Linear Integration</h1>
          {viewer && (
            <Badge variant="outline" className="gap-1 border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">
              <User className="h-3 w-3" />
              {viewer.name}
            </Badge>
          )}
          {viewer && !viewer.configuredUserId && (
            <Badge variant="destructive" className="gap-1 text-xs bg-[var(--tartarus-error)] text-[var(--tartarus-ivory)]">
              LINEAR_USER_ID not set
            </Badge>
          )}
          {filteredByUser && !showAllIssues && (
            <Badge variant="secondary" className="gap-1 bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
              <Filter className="h-3 w-3" />
              My Issues
            </Badge>
          )}
          {showAllIssues && (
            <Badge variant="outline" className="gap-1 border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
              All Issues
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              fetchIssues();
              fetchProjects();
            }}
            className="text-[var(--tartarus-ivory)] border-[var(--tartarus-border)] hover:bg-[var(--tartarus-surface)]"
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button size="sm" className="bg-[var(--tartarus-teal)] text-[var(--tartarus-deep)] hover:bg-[var(--tartarus-teal)]/90">
            <Plus className="mr-2 h-4 w-4" />
            New Issue
          </Button>
        </div>
      </header>

      {/* Config Warning */}
      {viewer && !viewer.configuredUserId && (
        <div className="border-b border-[var(--tartarus-gold-dim)]/30 bg-[var(--tartarus-gold-soft)] px-6 py-3">
          <p className="text-sm text-[var(--tartarus-gold)]">
            <strong>Tip:</strong> Set <code className="rounded bg-[var(--tartarus-deep)] px-1 text-[var(--tartarus-gold-bright)]">LINEAR_USER_ID</code> in your .env file to filter by your issues.
            Your user ID is: <code className="rounded bg-[var(--tartarus-deep)] px-1 text-[var(--tartarus-gold-bright)]">{viewer.id}</code>
          </p>
        </div>
      )}

      {/* Content */}
      <Tabs defaultValue="issues" className="flex flex-1 flex-col">
        <div className="journal-tabs px-6">
          <TabsList className="h-12 bg-[var(--tartarus-deep)]">
            <TabsTrigger value="issues" className="gap-2 data-[state=active]:bg-[var(--tartarus-surface)] data-[state=active]:text-[var(--tartarus-teal)]">
              <Circle className="h-4 w-4" />
              Issues
              {issues.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">{issues.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="projects" className="gap-2 data-[state=active]:bg-[var(--tartarus-surface)] data-[state=active]:text-[var(--tartarus-teal)]">
              <Layers className="h-4 w-4" />
              Projects
              {projects.length > 0 && (
                <Badge variant="secondary" className="ml-1 bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">{projects.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1 bg-[var(--journal-paper)]">
          <TabsContent value="issues" className="mt-0 p-6">
            {/* Filters */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
              <div className="relative max-w-sm flex-1">
                <Search className="text-[var(--tartarus-ivory-faded)] absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  placeholder="Search issues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                />
              </div>
              
              {/* Owner Filter */}
              <Select
                value={showAllIssues ? "all" : "mine"}
                onValueChange={(v) => setShowAllIssues(v === "all")}
              >
                <SelectTrigger className="w-[160px] bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]">
                  <User className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                  <SelectItem value="mine" className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
                    <span className="flex items-center gap-2">
                      🎯 My Issues
                    </span>
                  </SelectItem>
                  <SelectItem value="all" className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
                    <span className="flex items-center gap-2">
                      📋 All Issues
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>

              {/* Team Filter */}
              {viewer && viewer.teams.length > 0 && (
                <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                  <SelectTrigger className="w-[180px] bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]">
                    <Building2 className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="All Teams" />
                  </SelectTrigger>
                  <SelectContent className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                    <SelectItem value="all" className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">All Teams</SelectItem>
                    {viewer.teams.map((team) => (
                      <SelectItem key={team.id} value={team.id} className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
                        {team.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Issues List */}
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Card key={i} className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                    <CardContent className="p-4">
                      <Skeleton className="mb-2 h-5 w-1/3 bg-[var(--tartarus-elevated)]" />
                      <Skeleton className="h-4 w-2/3 bg-[var(--tartarus-elevated)]" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : filteredIssues.length === 0 ? (
              <div className="py-12 text-center">
                <Circle className="text-[var(--tartarus-ivory-faded)] mx-auto mb-4 h-12 w-12" />
                <h3 className="mb-2 font-semibold text-[var(--tartarus-ivory)]">No issues found</h3>
                <p className="text-[var(--tartarus-ivory-muted)] text-sm">
                  {searchQuery
                    ? "Try a different search term"
                    : showAllIssues
                    ? "No issues in your workspace"
                    : "No issues assigned to you. Toggle 'Show all' to see others."}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredIssues.map((issue) => (
                  <Card key={issue.id} className="bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] hover:border-[var(--tartarus-teal-dim)] transition-all">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge variant="outline" className="font-mono text-xs border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">
                              {issue.identifier}
                            </Badge>
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: issue.state.color }}
                            />
                            <span className="text-[var(--tartarus-ivory-muted)] text-xs">
                              {issue.state.name}
                            </span>
                            <span
                              className={`text-xs ${priorityLabels[issue.priority]?.color || ""}`}
                            >
                              {priorityLabels[issue.priority]?.emoji} {priorityLabels[issue.priority]?.label}
                            </span>
                          </div>
                          <h3 className="font-medium text-[var(--tartarus-ivory)]">{issue.title}</h3>
                          <div className="text-[var(--tartarus-ivory-faded)] mt-2 flex items-center gap-3 text-xs">
                            <span className="flex items-center gap-1">
                              <Building2 className="h-3 w-3" />
                              {issue.team.name}
                            </span>
                            {issue.project && (
                              <span className="flex items-center gap-1">
                                <Layers className="h-3 w-3" />
                                {issue.project.name}
                              </span>
                            )}
                            {issue.assignee && (
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {issue.assignee.name}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSelectedIssue(issue)}
                            title="View details"
                            className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                          >
                            <Expand className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => editIssueWithAI(issue)}
                            title="Edit with Kronus"
                            className="text-[var(--tartarus-gold)] hover:text-[var(--tartarus-gold-bright)] hover:bg-[var(--tartarus-gold-soft)]"
                          >
                            <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 rounded-full object-cover" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            asChild
                            title="Open in Linear"
                            className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                          >
                            <a href={issue.url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="projects" className="mt-0 p-6">
            {/* Project Filters */}
            <div className="mb-6 flex items-center gap-4">
              <Select
                value={showAllProjects ? "all" : "mine"}
                onValueChange={(v) => setShowAllProjects(v === "all")}
              >
                <SelectTrigger className="w-[180px] bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]">
                  <User className="mr-2 h-4 w-4" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                  <SelectItem value="mine" className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
                    <span className="flex items-center gap-2">
                      🎯 My Projects
                    </span>
                  </SelectItem>
                  <SelectItem value="all" className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
                    <span className="flex items-center gap-2">
                      📋 All Projects
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {projects.length === 0 ? (
              <div className="py-12 text-center">
                <Layers className="text-[var(--tartarus-ivory-faded)] mx-auto mb-4 h-12 w-12" />
                <h3 className="mb-2 font-semibold text-[var(--tartarus-ivory)]">No projects found</h3>
                <p className="text-[var(--tartarus-ivory-muted)] text-sm">
                  {showAllProjects
                    ? "No projects in your workspace"
                    : "No projects you're a member of. Toggle 'Show all' to see others."}
                </p>
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {projects.map((project) => (
                  <Card key={project.id} className="bg-[var(--tartarus-elevated)] border-[var(--tartarus-border)] hover:border-[var(--tartarus-teal-dim)] transition-all">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <CardTitle className="text-base text-[var(--tartarus-ivory)]">{project.name}</CardTitle>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                            onClick={() => setSelectedProject(project)}
                            title="View details"
                          >
                            <Expand className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-[var(--tartarus-gold)] hover:text-[var(--tartarus-gold-bright)] hover:bg-[var(--tartarus-gold-soft)]"
                            onClick={() => editProjectWithAI(project)}
                            title="Edit with Kronus"
                          >
                            <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 rounded-full object-cover" />
                          </Button>
                        </div>
                      </div>
                      {project.description && (
                        <CardDescription className="line-clamp-2 text-[var(--tartarus-ivory-muted)]">
                          {project.description}
                        </CardDescription>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center justify-between text-sm">
                        <Badge variant="outline" className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">{project.state}</Badge>
                        <span className="text-[var(--tartarus-ivory-muted)]">
                          {Math.round(project.progress * 100)}% complete
                        </span>
                      </div>
                      <div className="bg-[var(--tartarus-deep)] mt-2 h-2 overflow-hidden rounded-full">
                        <div
                          className="bg-[var(--tartarus-teal)] h-full transition-all"
                          style={{ width: `${project.progress * 100}%` }}
                        />
                      </div>
                      {project.lead && (
                        <div className="mt-2 text-xs text-[var(--tartarus-ivory-faded)] flex items-center gap-1">
                          <User className="h-3 w-3" />
                          Lead: {project.lead.name}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>

      {/* Issue Detail Dialog */}
      <Dialog open={!!selectedIssue} onOpenChange={() => setSelectedIssue(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
          {selectedIssue && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="font-mono border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)]">
                    {selectedIssue.identifier}
                  </Badge>
                  <span
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: selectedIssue.state.color }}
                  />
                  <span className="text-sm text-[var(--tartarus-ivory-muted)]">
                    {selectedIssue.state.name}
                  </span>
                </div>
                <DialogTitle className="text-xl text-[var(--tartarus-ivory)]">{selectedIssue.title}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Badge variant="secondary" className="bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory-dim)]">
                      {priorityLabels[selectedIssue.priority]?.emoji} {priorityLabels[selectedIssue.priority]?.label}
                    </Badge>
                    <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                      <Building2 className="h-3 w-3 mr-1" />
                      {selectedIssue.team.name}
                    </Badge>
                    {selectedIssue.project && (
                      <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                        <Layers className="h-3 w-3 mr-1" />
                        {selectedIssue.project.name}
                      </Badge>
                    )}
                    {selectedIssue.assignee && (
                      <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                        <User className="h-3 w-3 mr-1" />
                        {selectedIssue.assignee.name}
                      </Badge>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {selectedIssue.description ? (
                  <div>
                    <h4 className="font-medium mb-2 text-[var(--tartarus-ivory)]">Description</h4>
                    <div className="bg-[var(--tartarus-deep)] p-5 rounded-lg border border-[var(--tartarus-border)] max-h-[400px] overflow-auto prose prose-base max-w-none leading-relaxed prose-headings:text-[var(--tartarus-ivory)] prose-headings:font-semibold prose-headings:mb-3 prose-p:text-[var(--tartarus-ivory-dim)] prose-p:leading-relaxed prose-p:mb-3 prose-a:text-[var(--tartarus-teal)] prose-a:underline prose-strong:text-[var(--tartarus-ivory)] prose-em:text-[var(--tartarus-ivory-muted)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-void)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[var(--tartarus-void)] prose-pre:p-4 prose-ul:text-[var(--tartarus-ivory-dim)] prose-ul:my-3 prose-ol:text-[var(--tartarus-ivory-dim)] prose-ol:my-3 prose-li:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedIssue.description}</ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <p className="text-[var(--tartarus-ivory-faded)] text-sm italic">No description</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--tartarus-border)]">
                <Button variant="outline" asChild className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]">
                  <a href={selectedIssue.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Linear
                  </a>
                </Button>
                <Button
                  onClick={() => { setSelectedIssue(null); editIssueWithAI(selectedIssue); }}
                  className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
                >
                  <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                  Edit with Kronus
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Project Detail Dialog */}
      <Dialog open={!!selectedProject} onOpenChange={() => setSelectedProject(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
          {selectedProject && (
            <>
              <DialogHeader>
                <DialogTitle className="text-xl text-[var(--tartarus-ivory)]">{selectedProject.name}</DialogTitle>
                <DialogDescription asChild>
                  <div className="flex flex-wrap items-center gap-2 pt-2">
                    <Badge variant="secondary" className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">{selectedProject.state}</Badge>
                    <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                      {Math.round(selectedProject.progress * 100)}% complete
                    </Badge>
                    {selectedProject.lead && (
                      <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                        <User className="h-3 w-3 mr-1" />
                        Lead: {selectedProject.lead.name}
                      </Badge>
                    )}
                    {selectedProject.targetDate && (
                      <Badge variant="outline" className="border-[var(--tartarus-border-light)] text-[var(--tartarus-ivory-muted)]">
                        Target: {selectedProject.targetDate}
                      </Badge>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <h4 className="font-medium mb-2 text-[var(--tartarus-ivory)]">Progress</h4>
                  <div className="bg-[var(--tartarus-deep)] h-4 rounded-full overflow-hidden">
                    <div
                      className="bg-[var(--tartarus-teal)] h-full transition-all"
                      style={{ width: `${selectedProject.progress * 100}%` }}
                    />
                  </div>
                  <p className="text-sm text-[var(--tartarus-ivory-muted)] mt-1">
                    {Math.round(selectedProject.progress * 100)}% complete
                  </p>
                </div>

                {selectedProject.description && (
                  <div>
                    <h4 className="font-medium mb-2 text-[var(--tartarus-ivory)]">Description</h4>
                    <div className="bg-[var(--tartarus-deep)] p-5 rounded-lg border border-[var(--tartarus-border)] prose prose-base max-w-none leading-relaxed prose-headings:text-[var(--tartarus-ivory)] prose-headings:font-semibold prose-headings:mb-3 prose-p:text-[var(--tartarus-ivory-dim)] prose-p:leading-relaxed prose-p:mb-3 prose-a:text-[var(--tartarus-teal)] prose-a:underline prose-strong:text-[var(--tartarus-ivory)] prose-em:text-[var(--tartarus-ivory-muted)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-void)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[var(--tartarus-void)] prose-pre:p-4 prose-ul:text-[var(--tartarus-ivory-dim)] prose-ul:my-3 prose-ol:text-[var(--tartarus-ivory-dim)] prose-ol:my-3 prose-li:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedProject.description}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {selectedProject.content ? (
                  <div>
                    <h4 className="font-medium mb-2 text-[var(--tartarus-ivory)]">Content</h4>
                    <div className="bg-[var(--tartarus-deep)] p-5 rounded-lg border border-[var(--tartarus-border)] max-h-[500px] overflow-auto prose prose-base max-w-none leading-relaxed prose-headings:text-[var(--tartarus-ivory)] prose-headings:font-semibold prose-headings:mb-3 prose-p:text-[var(--tartarus-ivory-dim)] prose-p:leading-relaxed prose-p:mb-3 prose-a:text-[var(--tartarus-teal)] prose-a:underline prose-strong:text-[var(--tartarus-ivory)] prose-em:text-[var(--tartarus-ivory-muted)] prose-code:text-[var(--tartarus-teal)] prose-code:bg-[var(--tartarus-void)] prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-[var(--tartarus-void)] prose-pre:p-4 prose-ul:text-[var(--tartarus-ivory-dim)] prose-ul:my-3 prose-ol:text-[var(--tartarus-ivory-dim)] prose-ol:my-3 prose-li:my-1 prose-img:rounded-lg prose-img:max-w-full prose-img:my-4">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{selectedProject.content}</ReactMarkdown>
                    </div>
                  </div>
                ) : !selectedProject.description && (
                  <p className="text-[var(--tartarus-ivory-faded)] text-sm italic">No description or content</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-[var(--tartarus-border)]">
                {selectedProject.url && (
                  <Button variant="outline" asChild className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]">
                    <a href={selectedProject.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-2" />
                      Open in Linear
                    </a>
                  </Button>
                )}
                <Button
                  onClick={() => { setSelectedProject(null); editProjectWithAI(selectedProject); }}
                  className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)] ml-auto"
                >
                  <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                  Edit with Kronus
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
