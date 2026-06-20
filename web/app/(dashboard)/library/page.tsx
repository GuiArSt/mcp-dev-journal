"use client";

import { useState, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Search,
  FileText,
  Code,
  Briefcase,
  BookOpen,
  Tag,
  Settings,
  StickyNote,
  Trello,
  Layers,
  Image,
  MessageSquare,
  Bot,
  Hash,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  Document,
  Skill,
  WorkExperience,
  Education,
  PortfolioProject,
} from "@/lib/types/repository";
import { CATEGORY_ICONS, getColorClasses } from "@/components/repository/shared";
import { useRepositoryData } from "@/lib/hooks/useRepositoryData";
import { useCategoryManagement } from "@/lib/hooks/useCategoryManagement";
import { useDocTypeManagement } from "@/lib/hooks/useDocTypeManagement";
import { WritingsTab } from "@/components/repository/tabs/WritingsTab";
import { PromptsTab } from "@/components/repository/tabs/PromptsTab";
import { NotesTab } from "@/components/repository/tabs/NotesTab";
import { CVTab } from "@/components/repository/tabs/CVTab";
import { PortfolioTab } from "@/components/repository/tabs/PortfolioTab";
import { LinearTab } from "@/components/repository/tabs/LinearTab";
import { SliteTab } from "@/components/repository/tabs/SliteTab";
import { NotionTab } from "@/components/repository/tabs/NotionTab";
import { SlackTab } from "@/components/repository/tabs/SlackTab";
import { MediaTab } from "@/components/repository/tabs/MediaTab";
import { ChatsTab } from "@/components/repository/tabs/ChatsTab";
import { AiIntegrationsTab } from "@/components/repository/tabs/AiIntegrationsTab";
import { CategoryDialog } from "@/components/repository/CategoryDialog";
import { DocumentTypeDialog } from "@/components/repository/DocumentTypeDialog";

export default function LibraryPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState(searchParams.get("tab") || "writings");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingExperience, setEditingExperience] = useState<string | null>(null);
  const [editingEducation, setEditingEducation] = useState<string | null>(null);
  const [editingProject, setEditingProject] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [expandedSummaries, setExpandedSummaries] = useState<Set<number>>(new Set());

  // Data fetching hook
  const {
    loading,
    writings,
    prompts,
    notes,
    skills,
    experience,
    education,
    portfolioProjects,
    skillCategories,
    documentTypes,
    linearProjects,
    linearIssues,
    linearLastSync,
    linearSyncing,
    kronusChats,
    kronusChatsPagination,
    conversations,
    conversationsPagination,
    mediaAssets,
    mediaTotal,
    aiIntegrations,
    aiArtifacts,
    aiLogSessions,
    aiProposals,
    aiIntegrationsScanning,
    scanAiIntegrations,
    fetchData,
    invalidateTabCache,
    syncLinearData,
    sliteNotes: sliteCachedNotes,
    sliteLastSync,
    sliteSyncing,
    sliteCurrentUserId,
    syncSliteData,
    notionPages: notionCachedPages,
    notionLastSync,
    notionSyncing,
    syncNotionData,
    slackConversations,
    slackMessages,
    slackStatus,
    slackSyncing,
    syncSlackData,
  } = useRepositoryData(activeTab);

  // Category management hook
  const {
    categoryDialogOpen,
    setCategoryDialogOpen,
    editingCategory,
    categoryForm,
    setCategoryForm,
    categoryError,
    savingCategory,
    deletingCategory,
    openCategoryDialog,
    closeCategoryDialog,
    handleSaveCategory,
    handleDeleteCategory,
    getSkillCountInCategory,
  } = useCategoryManagement(skills, invalidateTabCache, fetchData);

  // Document type management hook
  const {
    docTypeDialogOpen,
    setDocTypeDialogOpen,
    editingDocType,
    docTypeForm,
    setDocTypeForm,
    docTypeError,
    savingDocType,
    deletingDocType,
    openDocTypeDialog,
    closeDocTypeDialog,
    handleSaveDocType,
    handleDeleteDocType,
    getDocCountWithType,
  } = useDocTypeManagement(writings, prompts, documentTypes, invalidateTabCache, fetchData);

  // Navigate to chat to EDIT a document with Kronus
  const editDocumentWithKronus = useCallback(
    (doc: Document, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const tags =
        doc.metadata?.tags && Array.isArray(doc.metadata.tags) ? doc.metadata.tags.join(", ") : "";
      const context = `I want to UPDATE this ${doc.type} in the repository. Please help me modify it:\n\n**Document Slug:** ${doc.slug}\n**Title:** ${doc.title}\n**Type:** ${doc.type}${doc.metadata?.type ? `\n**Category:** ${doc.metadata.type}` : ""}${tags ? `\n**Tags:** ${tags}` : ""}\n\n**Current Content:**\n${doc.content}\n\nWhat changes would you like to make? You can update the content or metadata (including tags) using the repository tools.`;

      sessionStorage.setItem("kronusPrefill", context);
      router.push("/chat");
    },
    [router]
  );

  // Navigate to chat to ADD new entries with Kronus
  const addSkillWithKronus = useCallback(() => {
    sessionStorage.setItem(
      "kronusPrefill",
      `I want to ADD a new skill to my CV. Please help me create it using the repository_create_skill tool.\n\n**Required Fields:**\n- **id**: Unique skill ID (lowercase, no spaces, e.g. 'react-native')\n- **name**: Display name (e.g. 'React Native')\n- **category**: One of: 'AI & Development', 'Languages & Frameworks', 'Data & Analytics', 'Infrastructure & DevOps', 'Design & UX', 'Leadership & Collaboration'\n- **magnitude**: Proficiency level 1-5 (5=expert)\n- **description**: Brief description of my expertise\n\n**Optional Fields:**\n- icon, color, url, tags, firstUsed, lastUsed\n\nWhat skill would you like to add? Please provide the name and I'll help you fill in the details.`
    );
    router.push("/chat");
  }, [router]);

  const addExperienceWithKronus = useCallback(() => {
    sessionStorage.setItem(
      "kronusPrefill",
      `I want to ADD a new work experience entry to my CV. Please help me create it using the repository_create_experience tool.\n\n**Required Fields:**\n- **id**: Unique ID (lowercase, no spaces, e.g. 'company-role-2024')\n- **title**: Job title (e.g. 'Senior Software Engineer')\n- **company**: Company name\n- **location**: Location (e.g. 'Helsinki, Finland')\n- **dateStart**: Start date (e.g. '2022-01')\n- **tagline**: Brief role description/tagline\n\n**Optional Fields:**\n- department, dateEnd (leave empty for current position), note, achievements (list of key achievements)\n\nWhat work experience would you like to add? Please provide the company and role, and I'll help you fill in the details.`
    );
    router.push("/chat");
  }, [router]);

  const addEducationWithKronus = useCallback(() => {
    sessionStorage.setItem(
      "kronusPrefill",
      `I want to ADD a new education entry to my CV. Please help me create it using the repository_create_education tool.\n\n**Required Fields:**\n- **id**: Unique ID (lowercase, no spaces, e.g. 'university-degree-2020')\n- **degree**: Degree type (e.g. 'Bachelor of Science', 'Master of Arts')\n- **field**: Field of study (e.g. 'Computer Science')\n- **institution**: Institution name\n- **location**: Location (e.g. 'Helsinki, Finland')\n- **dateStart**: Start date (e.g. '2016-09')\n- **dateEnd**: End date (e.g. '2020-06')\n- **tagline**: Brief description/tagline\n\n**Optional Fields:**\n- note, focusAreas (areas of focus/specialization), achievements (key achievements/honors)\n\nWhat education entry would you like to add? Please provide the institution and degree, and I'll help you fill in the details.`
    );
    router.push("/chat");
  }, [router]);

  const addProjectWithKronus = useCallback(() => {
    sessionStorage.setItem(
      "kronusPrefill",
      `I want to ADD a new portfolio project to my CV. Please help me create it.\n\n**Required Fields:**\n- **id**: Unique project ID (lowercase, no spaces, e.g. 'my-awesome-app')\n- **title**: Project title\n- **category**: Category (e.g., 'Web App', 'Mobile App', 'AI/ML', 'Data Engineering')\n\n**Optional Fields:**\n- company, role, status (shipped/wip/archived), featured\n- dateCompleted, excerpt, description\n- technologies (array), tags (array)\n- metrics (object), links (object), image URL\n\nWhat project would you like to add?`
    );
    router.push("/chat");
  }, [router]);

  // Memoized computations
  const categories = useMemo(() => [...new Set(skills.map((s) => s.category))].sort(), [skills]);

  const categoryConfig = useMemo(() => {
    const config: Record<
      string,
      { color: string; bgColor: string; barColor: string; icon: React.ReactNode }
    > = {};
    for (const cat of skillCategories) {
      const colors = getColorClasses(cat.color);
      config[cat.name] = {
        color: colors.color,
        bgColor: colors.bgColor,
        barColor: colors.barColor,
        icon: CATEGORY_ICONS[cat.icon] || <Tag className="h-4 w-4" />,
      };
    }
    return config;
  }, [skillCategories]);

  const docTypeConfig = useMemo(() => {
    const config: Record<string, { color: string; bgColor: string; barColor: string }> = {};
    for (const dt of documentTypes) {
      const colors = getColorClasses(dt.color);
      config[dt.name] = colors;
    }
    return config;
  }, [documentTypes]);

  const getDocTypeColors = useCallback(
    (typeName: string) => {
      return docTypeConfig[typeName] || getColorClasses("teal");
    },
    [docTypeConfig]
  );

  const toggleSummary = useCallback((docId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setExpandedSummaries((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
  }, []);

  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  const filteredSkills = useMemo(
    () =>
      skills.filter((s) => {
        const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
        const matchesSearch =
          !searchQuery ||
          s.name.toLowerCase().includes(searchLower) ||
          s.description.toLowerCase().includes(searchLower);
        return matchesCategory && matchesSearch;
      }),
    [skills, selectedCategory, searchQuery, searchLower]
  );

  const skillsByCategory = useMemo(
    () =>
      filteredSkills.reduce(
        (acc, skill) => {
          if (!acc[skill.category]) acc[skill.category] = [];
          acc[skill.category].push(skill);
          return acc;
        },
        {} as Record<string, Skill[]>
      ),
    [filteredSkills]
  );

  const allTags = useMemo(() => {
    const tags = new Set<string>();
    [...writings, ...prompts, ...notes].forEach((doc) => {
      const docTags = doc.metadata?.tags || [];
      if (Array.isArray(docTags)) {
        docTags.forEach((tag: string) => tags.add(tag));
      }
    });
    return Array.from(tags).sort();
  }, [writings, prompts, notes]);

  const allTypes = useMemo(() => {
    const types = new Set<string>();
    [...writings, ...prompts, ...notes].forEach((doc) => {
      if (doc.metadata?.type) {
        types.add(doc.metadata.type);
      }
    });
    return Array.from(types).sort();
  }, [writings, prompts, notes]);

  const filterDocs = useCallback(
    (docs: Document[]) =>
      docs.filter((d) => {
        const matchesSearch =
          !searchQuery ||
          d.title.toLowerCase().includes(searchLower) ||
          d.content.toLowerCase().includes(searchLower);
        const docTags = d.metadata?.tags || [];
        const matchesTag =
          selectedTag === "all" || (Array.isArray(docTags) && docTags.includes(selectedTag));
        const matchesType = selectedType === "all" || d.metadata?.type === selectedType;
        return matchesSearch && matchesTag && matchesType;
      }),
    [searchQuery, searchLower, selectedTag, selectedType]
  );

  const filteredWritings = useMemo(() => filterDocs(writings), [filterDocs, writings]);
  const filteredPrompts = useMemo(() => filterDocs(prompts), [filterDocs, prompts]);
  const filteredNotes = useMemo(() => filterDocs(notes), [filterDocs, notes]);

  const hasActiveFilters = selectedTag !== "all" || selectedType !== "all" || searchQuery !== "";
  const clearFilters = useCallback(() => {
    setSelectedTag("all");
    setSelectedType("all");
    setSearchQuery("");
  }, []);

  // Save handlers
  const handleSaveSkill = useCallback(
    async (data: Partial<Skill>) => {
      try {
        const res = await fetch(`/api/cv/skills/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          setEditingSkill(null);
          invalidateTabCache("cv");
          fetchData(true);
        }
      } catch (error) {
        console.error("Failed to save skill:", error);
      }
    },
    [invalidateTabCache, fetchData]
  );

  const handleSaveExperience = useCallback(
    async (data: Partial<WorkExperience>) => {
      try {
        const res = await fetch(`/api/cv/experience/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          setEditingExperience(null);
          invalidateTabCache("cv");
          fetchData(true);
        }
      } catch (error) {
        console.error("Failed to save experience:", error);
      }
    },
    [invalidateTabCache, fetchData]
  );

  const handleSaveEducation = useCallback(
    async (data: Partial<Education>) => {
      try {
        const res = await fetch(`/api/cv/education/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          setEditingEducation(null);
          invalidateTabCache("cv");
          fetchData(true);
        }
      } catch (error) {
        console.error("Failed to save education:", error);
      }
    },
    [invalidateTabCache, fetchData]
  );

  const handleSaveProject = useCallback(
    async (data: Partial<PortfolioProject>) => {
      try {
        const res = await fetch(`/api/portfolio-projects/${data.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });
        if (res.ok) {
          setEditingProject(null);
          invalidateTabCache("portfolio");
          fetchData(true);
        }
      } catch (error) {
        console.error("Failed to save project:", error);
      }
    },
    [invalidateTabCache, fetchData]
  );

  return (
    <div className="flex h-full flex-col bg-[var(--tartarus-void)] text-[var(--tartarus-ivory)]">
      <header className="flex min-h-14 flex-col gap-2 border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-3 py-2 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">Library</h1>
          {hasActiveFilters && (
            <Badge variant="secondary" className="gap-1">
              <Search className="h-3 w-3" />
              Filtered
            </Badge>
          )}
        </div>
        <div className="text-muted-foreground flex items-center gap-4 text-sm">
          {activeTab === "writings" && (
            <span>
              {hasActiveFilters
                ? `${filteredWritings.length} of ${writings.length} writings`
                : `${writings.length} writings`}
            </span>
          )}
          {activeTab === "prompts" && (
            <span>
              {hasActiveFilters
                ? `${filteredPrompts.length} of ${prompts.length} prompts`
                : `${prompts.length} prompts`}
            </span>
          )}
          {activeTab === "cv" && (
            <span>
              {skills.length} skills • {experience.length} experiences
            </span>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <div className="flex flex-col gap-2 border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-3 py-2 md:flex-row md:items-center md:gap-4 md:px-6 md:py-3">
          <TabsList className="h-auto flex-wrap gap-1 overflow-x-auto">
            <TabsTrigger value="writings">
              <FileText className="mr-2 h-4 w-4" />
              Writings
            </TabsTrigger>
            <TabsTrigger value="notes">
              <StickyNote className="mr-2 h-4 w-4" />
              Notes
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <Code className="mr-2 h-4 w-4" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="linear">
              <Trello className="mr-2 h-4 w-4" />
              Linear
            </TabsTrigger>
            <TabsTrigger value="slite">
              <BookOpen className="mr-2 h-4 w-4" />
              Slite
            </TabsTrigger>
            <TabsTrigger value="notion">
              <FileText className="mr-2 h-4 w-4" />
              Notion
            </TabsTrigger>
            <TabsTrigger value="slack">
              <Hash className="mr-2 h-4 w-4" />
              Slack
            </TabsTrigger>
            <TabsTrigger value="cv">
              <Briefcase className="mr-2 h-4 w-4" />
              CV
            </TabsTrigger>
            <TabsTrigger value="portfolio">
              <Layers className="mr-2 h-4 w-4" />
              Portfolio
            </TabsTrigger>
            <TabsTrigger value="media">
              <Image className="mr-2 h-4 w-4" />
              Media
            </TabsTrigger>
            <TabsTrigger value="chats">
              <MessageSquare className="mr-2 h-4 w-4" />
              Chats
            </TabsTrigger>
            <TabsTrigger value="ai-integrations">
              <Bot className="mr-2 h-4 w-4" />
              AI Integrations
            </TabsTrigger>
          </TabsList>
          <div className="relative max-w-sm flex-1">
            <Search className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          {(activeTab === "writings" || activeTab === "prompts" || activeTab === "notes") && (
            <>
              {allTypes.length > 0 && (
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger className="w-[150px]">
                    <BookOpen className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {allTypes.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {allTags.length > 0 && (
                <Select value={selectedTag} onValueChange={setSelectedTag}>
                  <SelectTrigger className="w-[150px]">
                    <Tag className="mr-2 h-4 w-4" />
                    <SelectValue placeholder="Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tags</SelectItem>
                    {allTags.map((tag) => (
                      <SelectItem key={tag} value={tag}>
                        {tag}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => openDocTypeDialog()}
                className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)] hover:text-[var(--tartarus-teal)]"
              >
                <Settings className="mr-2 h-4 w-4" />
                Manage Types
              </Button>
            </>
          )}
          {activeTab === "cv" && categories.length > 0 && (
            <>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[220px]">
                  <Briefcase className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map((cat) => {
                    const config = categoryConfig[cat];
                    return (
                      <SelectItem key={cat} value={cat}>
                        <span className="flex items-center gap-2">
                          {config?.icon}
                          {cat}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
              {(selectedCategory !== "all" || searchQuery) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedCategory("all");
                    setSearchQuery("");
                  }}
                >
                  Clear filters
                </Button>
              )}
            </>
          )}
        </div>

        <ScrollArea className="flex-1 bg-[var(--tartarus-void)]">
          <div className="p-6">
            <TabsContent value="writings" className="mt-0">
              <WritingsTab
                writings={filteredWritings}
                loading={loading}
                hasActiveFilters={hasActiveFilters}
                clearFilters={clearFilters}
                expandedSummaries={expandedSummaries}
                toggleSummary={toggleSummary}
                editDocumentWithKronus={editDocumentWithKronus}
                getDocTypeColors={getDocTypeColors}
              />
            </TabsContent>

            <TabsContent value="prompts" className="mt-0">
              <PromptsTab
                prompts={filteredPrompts}
                loading={loading}
                hasActiveFilters={hasActiveFilters}
                clearFilters={clearFilters}
                expandedSummaries={expandedSummaries}
                toggleSummary={toggleSummary}
                editDocumentWithKronus={editDocumentWithKronus}
                getDocTypeColors={getDocTypeColors}
              />
            </TabsContent>

            <TabsContent value="portfolio" className="mt-0 space-y-6">
              <PortfolioTab
                loading={loading}
                portfolioProjects={portfolioProjects}
                editingProject={editingProject}
                setEditingProject={setEditingProject}
                handleSaveProject={handleSaveProject}
                addProjectWithKronus={addProjectWithKronus}
              />
            </TabsContent>

            <TabsContent value="cv" className="mt-0 space-y-8">
              <CVTab
                loading={loading}
                filteredSkills={filteredSkills}
                skillsByCategory={skillsByCategory}
                experience={experience}
                education={education}
                skillCategories={skillCategories}
                categoryConfig={categoryConfig}
                editingSkill={editingSkill}
                setEditingSkill={setEditingSkill}
                editingExperience={editingExperience}
                setEditingExperience={setEditingExperience}
                editingEducation={editingEducation}
                setEditingEducation={setEditingEducation}
                handleSaveSkill={handleSaveSkill}
                handleSaveExperience={handleSaveExperience}
                handleSaveEducation={handleSaveEducation}
                addSkillWithKronus={addSkillWithKronus}
                addExperienceWithKronus={addExperienceWithKronus}
                addEducationWithKronus={addEducationWithKronus}
                openCategoryDialog={openCategoryDialog}
              />
            </TabsContent>

            <TabsContent value="notes" className="mt-0">
              <NotesTab notes={filteredNotes} loading={loading} />
            </TabsContent>

            <TabsContent value="linear" className="mt-0">
              <LinearTab
                loading={loading}
                linearProjects={linearProjects}
                linearIssues={linearIssues}
                linearLastSync={linearLastSync}
                linearSyncing={linearSyncing}
                syncLinearData={syncLinearData}
              />
            </TabsContent>

            <TabsContent value="slite" className="mt-0">
              <SliteTab
                loading={loading}
                sliteNotes={sliteCachedNotes}
                sliteLastSync={sliteLastSync}
                sliteSyncing={sliteSyncing}
                syncSliteData={syncSliteData}
                currentUserId={sliteCurrentUserId}
              />
            </TabsContent>

            <TabsContent value="notion" className="mt-0">
              <NotionTab
                loading={loading}
                notionPages={notionCachedPages}
                notionLastSync={notionLastSync}
                notionSyncing={notionSyncing}
                syncNotionData={syncNotionData}
              />
            </TabsContent>

            <TabsContent value="slack" className="mt-0">
              <SlackTab
                loading={loading}
                conversations={slackConversations}
                messages={slackMessages}
                status={slackStatus}
                syncing={slackSyncing}
                syncSlackData={syncSlackData}
              />
            </TabsContent>

            <TabsContent value="media" className="mt-0">
              <MediaTab
                loading={loading}
                mediaAssets={mediaAssets}
                mediaTotal={mediaTotal}
              />
            </TabsContent>

            <TabsContent value="chats" className="mt-0">
              <ChatsTab
                loading={loading}
                conversations={conversations}
                conversationsPagination={conversationsPagination}
                kronusChats={kronusChats}
                kronusChatsPagination={kronusChatsPagination}
              />
            </TabsContent>

            <TabsContent value="ai-integrations" className="mt-0">
              <AiIntegrationsTab
                loading={loading}
                integrations={aiIntegrations}
                artifacts={aiArtifacts}
                sessions={aiLogSessions}
                proposals={aiProposals}
                scanning={aiIntegrationsScanning}
                scanAiIntegrations={scanAiIntegrations}
              />
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        editingCategory={editingCategory}
        categoryForm={categoryForm}
        setCategoryForm={setCategoryForm}
        categoryError={categoryError}
        savingCategory={savingCategory}
        deletingCategory={deletingCategory}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
        onClose={closeCategoryDialog}
        getSkillCountInCategory={getSkillCountInCategory}
      />

      <DocumentTypeDialog
        open={docTypeDialogOpen}
        onOpenChange={setDocTypeDialogOpen}
        editingDocType={editingDocType}
        docTypeForm={docTypeForm}
        setDocTypeForm={setDocTypeForm}
        docTypeError={docTypeError}
        savingDocType={savingDocType}
        deletingDocType={deletingDocType}
        documentTypes={documentTypes}
        onSave={handleSaveDocType}
        onDelete={handleDeleteDocType}
        onClose={closeDocTypeDialog}
        openDocTypeDialog={openDocTypeDialog}
        getDocCountWithType={getDocCountWithType}
      />
    </div>
  );
}
