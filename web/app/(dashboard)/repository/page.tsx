"use client";

import { useEffect, useState, useMemo, useCallback, memo } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Search, FileText, Code, Briefcase, GraduationCap, BookOpen, Calendar, Edit, Tag, Cpu, Palette, Database, Server, PenTool, Users, Plus, Trash2, Settings, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { SkillEditForm, ExperienceEditForm, EducationEditForm } from "@/components/repository/CVEditForms";
import { getSkillIconUrl } from "@/lib/skill-icons";

// Available Lucide icons for categories
const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "cpu": <Cpu className="h-4 w-4" />,
  "palette": <Palette className="h-4 w-4" />,
  "database": <Database className="h-4 w-4" />,
  "server": <Server className="h-4 w-4" />,
  "pen-tool": <PenTool className="h-4 w-4" />,
  "users": <Users className="h-4 w-4" />,
  "tag": <Tag className="h-4 w-4" />,
  "briefcase": <Briefcase className="h-4 w-4" />,
  "code": <Code className="h-4 w-4" />,
  "book-open": <BookOpen className="h-4 w-4" />,
  "graduation-cap": <GraduationCap className="h-4 w-4" />,
};

// Available colors for categories
const CATEGORY_COLORS = ["violet", "pink", "blue", "orange", "emerald", "amber", "red", "cyan", "indigo", "teal", "rose", "lime"] as const;

// Generate color classes from color name
function getColorClasses(color: string) {
  const colorMap: Record<string, { color: string; bgColor: string; barColor: string }> = {
    violet: { color: "text-violet-700 dark:text-violet-400", bgColor: "bg-violet-100 dark:bg-violet-900/30 border-violet-200 dark:border-violet-800", barColor: "bg-violet-500" },
    pink: { color: "text-pink-700 dark:text-pink-400", bgColor: "bg-pink-100 dark:bg-pink-900/30 border-pink-200 dark:border-pink-800", barColor: "bg-pink-500" },
    blue: { color: "text-blue-700 dark:text-blue-400", bgColor: "bg-blue-100 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800", barColor: "bg-blue-500" },
    orange: { color: "text-orange-700 dark:text-orange-400", bgColor: "bg-orange-100 dark:bg-orange-900/30 border-orange-200 dark:border-orange-800", barColor: "bg-orange-500" },
    emerald: { color: "text-emerald-700 dark:text-emerald-400", bgColor: "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800", barColor: "bg-emerald-500" },
    amber: { color: "text-amber-700 dark:text-amber-400", bgColor: "bg-amber-100 dark:bg-amber-900/30 border-amber-200 dark:border-amber-800", barColor: "bg-amber-500" },
    red: { color: "text-red-700 dark:text-red-400", bgColor: "bg-red-100 dark:bg-red-900/30 border-red-200 dark:border-red-800", barColor: "bg-red-500" },
    cyan: { color: "text-cyan-700 dark:text-cyan-400", bgColor: "bg-cyan-100 dark:bg-cyan-900/30 border-cyan-200 dark:border-cyan-800", barColor: "bg-cyan-500" },
    indigo: { color: "text-indigo-700 dark:text-indigo-400", bgColor: "bg-indigo-100 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800", barColor: "bg-indigo-500" },
    teal: { color: "text-teal-700 dark:text-teal-400", bgColor: "bg-teal-100 dark:bg-teal-900/30 border-teal-200 dark:border-teal-800", barColor: "bg-teal-500" },
    rose: { color: "text-rose-700 dark:text-rose-400", bgColor: "bg-rose-100 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800", barColor: "bg-rose-500" },
    lime: { color: "text-lime-700 dark:text-lime-400", bgColor: "bg-lime-100 dark:bg-lime-900/30 border-lime-200 dark:border-lime-800", barColor: "bg-lime-500" },
  };
  return colorMap[color] || colorMap.gray || { color: "text-gray-700 dark:text-gray-400", bgColor: "bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800", barColor: "bg-gray-500" };
}

// Skill category from API
interface SkillCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

// Magnitude bar component - memoized to prevent re-renders
const MagnitudeBar = memo(function MagnitudeBar({ magnitude, maxMagnitude = 5 }: { magnitude: number; maxMagnitude?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: maxMagnitude }).map((_, i) => (
        <div
          key={i}
          className={`h-2 w-4 rounded-sm ${
            i < magnitude
              ? "bg-primary"
              : "bg-muted"
          }`}
        />
      ))}
      <span className="ml-2 text-xs text-muted-foreground">{magnitude}/{maxMagnitude}</span>
    </div>
  );
});

// Skill icon component with proper fallback
const SkillIcon = memo(function SkillIcon({
  skillName,
  fallbackIcon,
  fallbackColor
}: {
  skillName: string;
  fallbackIcon: React.ReactNode;
  fallbackColor: string;
}) {
  const [showFallback, setShowFallback] = useState(false);
  const iconUrl = getSkillIconUrl(skillName);

  if (!iconUrl || showFallback) {
    return <span className={fallbackColor}>{fallbackIcon}</span>;
  }

  return (
    <img
      src={iconUrl}
      alt={skillName}
      className="h-6 w-6"
      onError={() => setShowFallback(true)}
    />
  );
});

// Strip markdown for plain text preview (faster than ReactMarkdown)
function stripMarkdown(text: string): string {
  return text
    .replace(/#{1,6}\s/g, '') // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/`(.+?)`/g, '$1') // code
    .replace(/\[(.+?)\]\(.+?\)/g, '$1') // links
    .replace(/^\s*[-*+]\s/gm, '') // list items
    .replace(/^\s*\d+\.\s/gm, '') // numbered lists
    .trim();
}

interface Document {
  id: number;
  slug: string;
  type: "writing" | "prompt" | "note";
  title: string;
  content: string;
  language: string;
  metadata: any;
  created_at: string;
  updated_at: string;
}

interface Skill {
  id: string;
  name: string;
  category: string;
  magnitude: number;
  description: string;
  tags: string[];
}

interface Achievement {
  category?: string;
  description: string;
  metrics?: string;
  tags?: string[];
}

interface WorkExperience {
  id: string;
  title: string;
  company: string;
  department?: string;
  location: string;
  dateStart: string;
  dateEnd: string | null;
  tagline: string;
  note?: string;
  achievements: Achievement[];
}

interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  location: string;
  dateStart: string;
  dateEnd: string;
  tagline: string;
  note?: string;
  focusAreas: string[];
  achievements: string[];
}

export default function RepositoryPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("writings");
  const [writings, setWritings] = useState<Document[]>([]);
  const [prompts, setPrompts] = useState<Document[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [skillCategories, setSkillCategories] = useState<SkillCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState<string>("all");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [editingSkill, setEditingSkill] = useState<string | null>(null);
  const [editingExperience, setEditingExperience] = useState<string | null>(null);
  const [editingEducation, setEditingEducation] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");

  // Category management state
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<SkillCategory | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: "", color: "violet", icon: "tag" });
  const [categoryError, setCategoryError] = useState<string | null>(null);
  const [savingCategory, setSavingCategory] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(false);

  // Navigate to chat to EDIT a document with Kronus
  const editDocumentWithKronus = useCallback((doc: Document, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const tags = doc.metadata?.tags && Array.isArray(doc.metadata.tags) ? doc.metadata.tags.join(", ") : "";
    const context = `I want to UPDATE this ${doc.type} in the repository. Please help me modify it:\n\n**Document Slug:** ${doc.slug}\n**Title:** ${doc.title}\n**Type:** ${doc.type}${doc.metadata?.type ? `\n**Category:** ${doc.metadata.type}` : ""}${tags ? `\n**Tags:** ${tags}` : ""}\n\n**Current Content:**\n${doc.content}\n\nWhat changes would you like to make? You can update the content or metadata (including tags) using the repository tools.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  }, [router]);

  // Navigate to chat to ADD a new skill with Kronus
  const addSkillWithKronus = useCallback(() => {
    const context = `I want to ADD a new skill to my CV. Please help me create it using the repository_create_skill tool.

**Required Fields:**
- **id**: Unique skill ID (lowercase, no spaces, e.g. 'react-native')
- **name**: Display name (e.g. 'React Native')
- **category**: One of: 'AI & Development', 'Languages & Frameworks', 'Data & Analytics', 'Infrastructure & DevOps', 'Design & UX', 'Leadership & Collaboration'
- **magnitude**: Proficiency level 1-5 (5=expert)
- **description**: Brief description of my expertise

**Optional Fields:**
- icon, color, url, tags, firstUsed, lastUsed

What skill would you like to add? Please provide the name and I'll help you fill in the details.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  }, [router]);

  // Navigate to chat to ADD a new work experience with Kronus
  const addExperienceWithKronus = useCallback(() => {
    const context = `I want to ADD a new work experience entry to my CV. Please help me create it using the repository_create_experience tool.

**Required Fields:**
- **id**: Unique ID (lowercase, no spaces, e.g. 'company-role-2024')
- **title**: Job title (e.g. 'Senior Software Engineer')
- **company**: Company name
- **location**: Location (e.g. 'Helsinki, Finland')
- **dateStart**: Start date (e.g. '2022-01')
- **tagline**: Brief role description/tagline

**Optional Fields:**
- department, dateEnd (leave empty for current position), note, achievements (list of key achievements)

What work experience would you like to add? Please provide the company and role, and I'll help you fill in the details.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  }, [router]);

  // Navigate to chat to ADD a new education entry with Kronus
  const addEducationWithKronus = useCallback(() => {
    const context = `I want to ADD a new education entry to my CV. Please help me create it using the repository_create_education tool.

**Required Fields:**
- **id**: Unique ID (lowercase, no spaces, e.g. 'university-degree-2020')
- **degree**: Degree type (e.g. 'Bachelor of Science', 'Master of Arts')
- **field**: Field of study (e.g. 'Computer Science')
- **institution**: Institution name
- **location**: Location (e.g. 'Helsinki, Finland')
- **dateStart**: Start date (e.g. '2016-09')
- **dateEnd**: End date (e.g. '2020-06')
- **tagline**: Brief description/tagline

**Optional Fields:**
- note, focusAreas (areas of focus/specialization), achievements (key achievements/honors)

What education entry would you like to add? Please provide the institution and degree, and I'll help you fill in the details.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  }, [router]);

  // Get unique categories from skills - memoized
  const categories = useMemo(() =>
    [...new Set(skills.map(s => s.category))].sort(),
    [skills]
  );

  // Build category config from API data
  const categoryConfig = useMemo(() => {
    const config: Record<string, { color: string; bgColor: string; barColor: string; icon: React.ReactNode }> = {};
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

  // Memoize lowercase search query to avoid recalculating
  const searchLower = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);

  // Filter skills by category and search - memoized
  const filteredSkills = useMemo(() =>
    skills.filter(s => {
      const matchesCategory = selectedCategory === "all" || s.category === selectedCategory;
      const matchesSearch = !searchQuery ||
        s.name.toLowerCase().includes(searchLower) ||
        s.description.toLowerCase().includes(searchLower);
      return matchesCategory && matchesSearch;
    }),
    [skills, selectedCategory, searchQuery, searchLower]
  );

  // Group skills by category for display - memoized
  const skillsByCategory = useMemo(() =>
    filteredSkills.reduce((acc, skill) => {
      if (!acc[skill.category]) acc[skill.category] = [];
      acc[skill.category].push(skill);
      return acc;
    }, {} as Record<string, Skill[]>),
    [filteredSkills]
  );

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === "writings") {
        const res = await fetch("/api/documents?type=writing");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        console.log("Fetched writings:", data.documents?.length || 0);
        setWritings(data.documents || []);
      } else if (activeTab === "prompts") {
        const res = await fetch("/api/documents?type=prompt");
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        const data = await res.json();
        console.log("Fetched prompts:", data.documents?.length || 0);
        setPrompts(data.documents || []);
      } else if (activeTab === "cv") {
        // Fetch CV data and categories in parallel
        const [cvRes, catRes] = await Promise.all([
          fetch("/api/cv"),
          fetch("/api/cv/categories"),
        ]);
        if (!cvRes.ok) {
          throw new Error(`HTTP error! status: ${cvRes.status}`);
        }
        const data = await cvRes.json();
        console.log("Fetched CV data:", {
          skills: data.skills?.length || 0,
          experience: data.experience?.length || 0,
          education: data.education?.length || 0,
        });
        setSkills(data.skills || []);
        setExperience(data.experience || []);
        setEducation(data.education || []);

        // Fetch categories
        if (catRes.ok) {
          const catData = await catRes.json();
          setSkillCategories(catData || []);
        }
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      // Set empty arrays on error to prevent stale data
      if (activeTab === "writings") setWritings([]);
      else if (activeTab === "prompts") setPrompts([]);
      else if (activeTab === "cv") {
        setSkills([]);
        setExperience([]);
        setEducation([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Extract all unique tags from documents - memoized
  const allTags = useMemo(() => {
    const tags = new Set<string>();
    [...writings, ...prompts].forEach((doc) => {
      const docTags = doc.metadata?.tags || [];
      if (Array.isArray(docTags)) {
        docTags.forEach((tag: string) => tags.add(tag));
      }
    });
    return Array.from(tags).sort();
  }, [writings, prompts]);

  // Extract all unique types from documents - memoized
  const allTypes = useMemo(() => {
    const types = new Set<string>();
    [...writings, ...prompts].forEach((doc) => {
      if (doc.metadata?.type) {
        types.add(doc.metadata.type);
      }
    });
    return Array.from(types).sort();
  }, [writings, prompts]);

  // Filtered writings - memoized
  const filteredWritings = useMemo(() =>
    writings.filter((d) => {
      const matchesSearch = !searchQuery || d.title.toLowerCase().includes(searchLower) || d.content.toLowerCase().includes(searchLower);
      const docTags = d.metadata?.tags || [];
      const matchesTag = selectedTag === "all" || (Array.isArray(docTags) && docTags.includes(selectedTag));
      const matchesType = selectedType === "all" || d.metadata?.type === selectedType;
      return matchesSearch && matchesTag && matchesType;
    }),
    [writings, searchQuery, searchLower, selectedTag, selectedType]
  );

  // Filtered prompts - memoized
  const filteredPrompts = useMemo(() =>
    prompts.filter((d) => {
      const matchesSearch = !searchQuery || d.title.toLowerCase().includes(searchLower) || d.content.toLowerCase().includes(searchLower);
      const docTags = d.metadata?.tags || [];
      const matchesTag = selectedTag === "all" || (Array.isArray(docTags) && docTags.includes(selectedTag));
      const matchesType = selectedType === "all" || d.metadata?.type === selectedType;
      return matchesSearch && matchesTag && matchesType;
    }),
    [prompts, searchQuery, searchLower, selectedTag, selectedType]
  );

  const hasActiveFilters = selectedTag !== "all" || selectedType !== "all" || searchQuery !== "";
  const clearFilters = useCallback(() => {
    setSelectedTag("all");
    setSelectedType("all");
    setSearchQuery("");
  }, []);

  const handleSaveSkill = useCallback(async (data: Partial<Skill>) => {
    try {
      const res = await fetch(`/api/cv/skills/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingSkill(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save skill:", error);
    }
  }, []);

  const handleSaveExperience = useCallback(async (data: Partial<WorkExperience>) => {
    try {
      const res = await fetch(`/api/cv/experience/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingExperience(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save experience:", error);
    }
  }, []);

  const handleSaveEducation = useCallback(async (data: Partial<Education>) => {
    try {
      const res = await fetch(`/api/cv/education/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (res.ok) {
        setEditingEducation(null);
        fetchData();
      }
    } catch (error) {
      console.error("Failed to save education:", error);
    }
  }, []);

  // Category management handlers
  const openCategoryDialog = useCallback((category?: SkillCategory) => {
    if (category) {
      setEditingCategory(category);
      setCategoryForm({ name: category.name, color: category.color, icon: category.icon });
    } else {
      setEditingCategory(null);
      setCategoryForm({ name: "", color: "violet", icon: "tag" });
    }
    setCategoryError(null);
    setCategoryDialogOpen(true);
  }, []);

  const closeCategoryDialog = useCallback(() => {
    setCategoryDialogOpen(false);
    setEditingCategory(null);
    setCategoryForm({ name: "", color: "violet", icon: "tag" });
    setCategoryError(null);
  }, []);

  const handleSaveCategory = useCallback(async () => {
    if (!categoryForm.name.trim()) {
      setCategoryError("Category name is required");
      return;
    }

    setSavingCategory(true);
    setCategoryError(null);

    try {
      if (editingCategory) {
        // Update existing category
        const res = await fetch(`/api/cv/categories/${editingCategory.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: categoryForm.name.trim(),
            color: categoryForm.color,
            icon: categoryForm.icon,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to update category");
        }
      } else {
        // Create new category
        const res = await fetch("/api/cv/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: categoryForm.name.trim(),
            color: categoryForm.color,
            icon: categoryForm.icon,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create category");
        }
      }

      closeCategoryDialog();
      fetchData();
    } catch (error: any) {
      setCategoryError(error.message);
    } finally {
      setSavingCategory(false);
    }
  }, [categoryForm, editingCategory, closeCategoryDialog]);

  const handleDeleteCategory = useCallback(async () => {
    if (!editingCategory) return;

    setDeletingCategory(true);
    setCategoryError(null);

    try {
      const res = await fetch(`/api/cv/categories/${editingCategory.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete category");
      }

      closeCategoryDialog();
      fetchData();
    } catch (error: any) {
      setCategoryError(error.message);
    } finally {
      setDeletingCategory(false);
    }
  }, [editingCategory, closeCategoryDialog]);

  // Get count of skills in a category (for delete warning)
  const getSkillCountInCategory = useCallback((categoryName: string) => {
    return skills.filter(s => s.category === categoryName).length;
  }, [skills]);

  return (
    <div className="journal-page flex h-full flex-col">
      <header className="journal-header flex h-14 items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <h1 className="journal-title text-lg">Repository</h1>
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
            <span>{skills.length} skills • {experience.length} experiences</span>
          )}
        </div>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
        <div className="journal-tabs flex items-center gap-4 px-6 py-3">
          <TabsList>
            <TabsTrigger value="writings">
              <FileText className="mr-2 h-4 w-4" />
              Writings
            </TabsTrigger>
            <TabsTrigger value="prompts">
              <Code className="mr-2 h-4 w-4" />
              Prompts
            </TabsTrigger>
            <TabsTrigger value="cv">
              <Briefcase className="mr-2 h-4 w-4" />
              CV
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
          {(activeTab === "writings" || activeTab === "prompts") && (
            <>
              {/* Type Filter */}
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

              {/* Tag Filter */}
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

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </>
          )}
          {activeTab === "cv" && categories.length > 0 && (
            <>
              {/* Category Filter */}
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
                <Button variant="ghost" size="sm" onClick={() => { setSelectedCategory("all"); setSearchQuery(""); }}>
                  Clear filters
                </Button>
              )}
            </>
          )}
        </div>

        <ScrollArea className="flex-1 bg-[var(--journal-paper)]">
          <div className="p-6">
            <TabsContent value="writings" className="mt-0">
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-emerald-400 to-emerald-600" />
                      <CardHeader>
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-1/2 mt-2" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-16 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredWritings.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                      <FileText className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <p className="text-muted-foreground">No writings found.</p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 auto-rows-fr">
                  {filteredWritings.map((doc) => (
                    <Link key={doc.id} href={`/repository/${doc.slug}`}>
                      <Card className="group cursor-pointer hover:shadow-md overflow-hidden border-emerald-100 dark:border-emerald-900/30 h-full flex flex-col relative">
                        {/* Edit with Kronus button - absolute positioned */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          onClick={(e) => editDocumentWithKronus(doc, e)}
                          title="Edit with Kronus"
                        >
                          <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 rounded-full object-cover" />
                        </Button>

                        {/* Decorative gradient bar */}
                        <div className="h-1 bg-gradient-to-r from-emerald-400 to-emerald-600 shrink-0" />

                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                              <FileText className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8">
                              <CardTitle className="text-base font-semibold line-clamp-2 h-12">
                                {doc.title}
                              </CardTitle>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {doc.metadata?.year && (
                                  <span className="flex items-center gap-1">
                                    <Calendar className="h-3 w-3" />
                                    {doc.metadata.year}
                                  </span>
                                )}
                                {doc.metadata?.type && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                                    {doc.metadata.type}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 flex-1 flex flex-col">
                          <p className="text-muted-foreground line-clamp-3 text-sm flex-1">
                            {stripMarkdown(doc.content).substring(0, 150)}...
                          </p>
                          <div className="mt-3 flex flex-wrap gap-1 min-h-[24px]">
                            {doc.metadata?.tags && Array.isArray(doc.metadata.tags) && doc.metadata.tags.length > 0 ? (
                              <>
                                {doc.metadata.tags.slice(0, 3).map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400">
                                    {tag}
                                  </Badge>
                                ))}
                                {doc.metadata.tags.length > 3 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    +{doc.metadata.tags.length - 3}
                                  </Badge>
                                )}
                              </>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="prompts" className="mt-0">
              {loading ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="overflow-hidden">
                      <div className="h-1 bg-gradient-to-r from-violet-400 to-violet-600" />
                      <CardHeader>
                        <Skeleton className="h-5 w-2/3" />
                      </CardHeader>
                      <CardContent>
                        <Skeleton className="h-20 w-full" />
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : filteredPrompts.length === 0 ? (
                <div className="py-12 text-center">
                  <div className="flex flex-col items-center gap-3">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
                      <Code className="h-8 w-8 text-violet-600 dark:text-violet-400" />
                    </div>
                    <p className="text-muted-foreground">No prompts found.</p>
                    {hasActiveFilters && (
                      <Button variant="outline" size="sm" onClick={clearFilters}>
                        Clear filters
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2 auto-rows-fr">
                  {filteredPrompts.map((doc) => (
                    <Link key={doc.id} href={`/repository/${doc.slug}`}>
                      <Card className="group cursor-pointer hover:shadow-md overflow-hidden border-violet-100 dark:border-violet-900/30 h-full flex flex-col relative">
                        {/* Edit with Kronus button - absolute positioned */}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute top-3 right-3 h-8 w-8 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950 opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          onClick={(e) => editDocumentWithKronus(doc, e)}
                          title="Edit with Kronus"
                        >
                          <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 rounded-full object-cover" />
                        </Button>

                        {/* Decorative gradient bar */}
                        <div className="h-1 bg-gradient-to-r from-violet-400 to-violet-600 shrink-0" />

                        <CardHeader className="pb-2">
                          <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100 dark:bg-violet-900/30">
                              <Code className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                            </div>
                            <div className="flex-1 min-w-0 pr-8">
                              <CardTitle className="text-base font-semibold line-clamp-2 h-12">
                                {doc.title}
                              </CardTitle>
                              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                                {doc.metadata?.type && (
                                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400">
                                    {doc.metadata.type}
                                  </Badge>
                                )}
                                {doc.language && doc.language !== 'en' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    {doc.language.toUpperCase()}
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="pt-0 flex-1 flex flex-col">
                          <div className="relative flex-1">
                            <pre className="text-muted-foreground overflow-hidden text-xs bg-violet-50 dark:bg-violet-900/10 p-3 rounded-lg border border-violet-100 dark:border-violet-900/30 h-24 font-mono whitespace-pre-wrap break-words">
                              {doc.content.substring(0, 200)}...
                            </pre>
                            <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-violet-50 dark:from-violet-900/10 to-transparent pointer-events-none rounded-b-lg" />
                          </div>
                          <div className="mt-3 flex flex-wrap gap-1 min-h-[24px]">
                            {doc.metadata?.tags && Array.isArray(doc.metadata.tags) && doc.metadata.tags.length > 0 ? (
                              <>
                                {doc.metadata.tags.slice(0, 4).map((tag: string) => (
                                  <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0 border-violet-200 dark:border-violet-800 text-violet-700 dark:text-violet-400">
                                    {tag}
                                  </Badge>
                                ))}
                                {doc.metadata.tags.length > 4 && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                    +{doc.metadata.tags.length - 4}
                                  </Badge>
                                )}
                              </>
                            ) : null}
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="cv" className="mt-0 space-y-8">
              {loading ? (
                <div className="space-y-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i}>
                      <Skeleton className="h-8 w-48 mb-4" />
                      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {Array.from({ length: 4 }).map((_, j) => (
                          <Skeleton key={j} className="h-32 w-full" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {/* Skills Section - Grouped by Category */}
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <Briefcase className="h-5 w-5" />
                        Skills
                        <Badge variant="secondary" className="ml-2">{filteredSkills.length}</Badge>
                      </h2>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => openCategoryDialog()}
                          className="border-[var(--tartarus-teal)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal)]/10"
                        >
                          <Settings className="mr-2 h-4 w-4" />
                          New Category
                        </Button>
                        <Button
                          size="sm"
                          onClick={addSkillWithKronus}
                          className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold)]/90 font-medium"
                        >
                          <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                          Add with Kronus
                        </Button>
                      </div>
                    </div>

                    {Object.entries(skillsByCategory).length === 0 ? (
                      <div className="py-12 text-center">
                        <p className="text-muted-foreground">No skills match your filters.</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        {Object.entries(skillsByCategory).map(([category, categorySkills]) => {
                          const config = categoryConfig[category] || {
                            color: "text-gray-700 dark:text-gray-400",
                            bgColor: "bg-gray-100 dark:bg-gray-900/30 border-gray-200 dark:border-gray-800",
                            barColor: "bg-gray-500",
                            icon: <Tag className="h-4 w-4" />
                          };
                          // Find the category object to pass to edit dialog
                          const categoryObj = skillCategories.find(c => c.name === category);

                          return (
                            <div key={category}>
                              {/* Category Header */}
                              <div className={`mb-4 flex items-center gap-3 rounded-lg border p-3 ${config.bgColor} group`}>
                                <span className={config.color}>{config.icon}</span>
                                <h3 className={`font-semibold ${config.color}`}>{category}</h3>
                                <Badge variant="outline" className={config.color}>
                                  {categorySkills.length} skills
                                </Badge>
                                <div className="flex-1" />
                                {categoryObj && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className={`h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity ${config.color}`}
                                    onClick={() => openCategoryDialog(categoryObj)}
                                    title="Edit category"
                                  >
                                    <Edit className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>

                              {/* Skills Grid */}
                              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                                {categorySkills.map((skill) =>
                                  editingSkill === skill.id ? (
                                    <SkillEditForm
                                      key={skill.id}
                                      skill={skill}
                                      categories={skillCategories}
                                      onSave={handleSaveSkill}
                                      onCancel={() => setEditingSkill(null)}
                                    />
                                  ) : (
                                    <Link key={skill.id} href={`/repository/skill/${skill.id}`}>
                                      <Card className={`group hover:shadow-md cursor-pointer transition-all h-full border ${config.bgColor.replace('bg-', 'border-').replace('/30', '/50')}`}>
                                        <CardHeader className="pb-2">
                                          <div className="flex items-start justify-between">
                                            <div className="flex items-center gap-3">
                                              <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${config.bgColor}`}>
                                                <SkillIcon
                                                  skillName={skill.name}
                                                  fallbackIcon={config.icon}
                                                  fallbackColor={config.color}
                                                />
                                              </div>
                                              <div className="flex-1 min-w-0">
                                                <CardTitle className="text-sm font-semibold line-clamp-1">
                                                  {skill.name}
                                                </CardTitle>
                                                <div className="flex items-center gap-0.5 mt-0.5">
                                                  {Array.from({ length: 5 }).map((_, i) => (
                                                    <div
                                                      key={i}
                                                      className={`h-2 w-3 rounded-sm ${
                                                        i < skill.magnitude
                                                          ? config.barColor
                                                          : 'bg-muted-foreground/20 border border-muted-foreground/30'
                                                      }`}
                                                    />
                                                  ))}
                                                </div>
                                              </div>
                                            </div>
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 shrink-0"
                                              onClick={(e) => { e.preventDefault(); setEditingSkill(skill.id); }}
                                            >
                                              <Edit className="h-3 w-3" />
                                            </Button>
                                          </div>
                                        </CardHeader>
                                        <CardContent className="pt-0">
                                          <p className="text-muted-foreground text-xs line-clamp-2 leading-relaxed">
                                            {skill.description}
                                          </p>
                                        </CardContent>
                                      </Card>
                                    </Link>
                                  )
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Work Experience Section - Timeline Style */}
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <Briefcase className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                        Work Experience
                        <Badge variant="secondary" className="ml-2">{experience.length}</Badge>
                      </h2>
                      <Button
                        size="sm"
                        onClick={addExperienceWithKronus}
                        className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold)]/90 font-medium"
                      >
                        <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                        Add with Kronus
                      </Button>
                    </div>

                    <div className="relative">
                      {/* Timeline line */}
                      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gradient-to-b from-[var(--tartarus-gold)] via-[var(--tartarus-gold)]/50 to-transparent" />

                      <div className="space-y-6">
                        {experience.map((exp, index) => (
                          editingExperience === exp.id ? (
                            <div key={exp.id} className="ml-10">
                              <ExperienceEditForm
                                experience={exp}
                                onSave={handleSaveExperience}
                                onCancel={() => setEditingExperience(null)}
                              />
                            </div>
                          ) : (
                            <div key={exp.id} className="relative flex gap-4">
                              {/* Timeline dot */}
                              <div className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${
                                !exp.dateEnd
                                  ? "border-amber-500 bg-amber-100 dark:bg-amber-900/50"
                                  : "border-amber-300 bg-white dark:bg-gray-900"
                              }`}>
                                <Briefcase className={`h-4 w-4 ${
                                  !exp.dateEnd ? "text-amber-600" : "text-amber-400"
                                }`} />
                              </div>

                              {/* Experience Card */}
                              <Link href={`/repository/experience/${exp.id}`} className="flex-1">
                                <Card className={`group hover:shadow-md cursor-pointer transition-all ${
                                  !exp.dateEnd
                                    ? "border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10"
                                    : ""
                                }`}>
                                  <CardHeader className="pb-3">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="flex items-center gap-2 mb-1">
                                          <CardTitle className="text-base font-semibold">
                                            {exp.title}
                                          </CardTitle>
                                          {!exp.dateEnd && (
                                            <Badge className="bg-amber-500 text-white text-xs">
                                              Current
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm font-medium text-amber-700 dark:text-amber-400">
                                          {exp.company}
                                        </p>
                                        <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                                          <span className="flex items-center gap-1">
                                            <Calendar className="h-3 w-3" />
                                            {exp.dateStart} - {exp.dateEnd || "Present"}
                                          </span>
                                          <span className="flex items-center gap-1">
                                            •
                                          </span>
                                          <span>{exp.location}</span>
                                        </div>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                                        onClick={(e) => { e.preventDefault(); setEditingExperience(exp.id); }}
                                      >
                                        <Edit className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </CardHeader>
                                <CardContent className="pt-0 space-y-3">
                                  {exp.tagline && (
                                    <p className="text-sm text-muted-foreground italic">
                                      {exp.tagline}
                                    </p>
                                  )}
                                  {exp.department && (
                                    <p className="text-xs text-muted-foreground">
                                      <span className="font-medium">Department:</span> {exp.department}
                                    </p>
                                  )}
                                  {exp.note && (
                                    <p className="text-xs text-muted-foreground bg-amber-50 dark:bg-amber-900/20 p-2 rounded border border-amber-100 dark:border-amber-800">
                                      {exp.note}
                                    </p>
                                  )}
                                  {exp.achievements && exp.achievements.length > 0 && (
                                    <div className="pt-2 border-t border-amber-100 dark:border-amber-800">
                                      <p className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-2">
                                        Key Achievements ({exp.achievements.length})
                                      </p>
                                      <div className="space-y-2">
                                        {/* Group achievements by category */}
                                        {Object.entries(
                                          exp.achievements.reduce((acc, ach) => {
                                            const cat = ach.category || "General";
                                            if (!acc[cat]) acc[cat] = [];
                                            acc[cat].push(ach);
                                            return acc;
                                          }, {} as Record<string, Achievement[]>)
                                        ).slice(0, 3).map(([category, achievements]) => (
                                          <div key={category}>
                                            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-500 mb-1">
                                              {category}
                                            </p>
                                            <ul className="space-y-1">
                                              {achievements.slice(0, 2).map((ach, i) => (
                                                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                                                  <span className="text-amber-400 shrink-0">•</span>
                                                  <span>
                                                    {ach.description}
                                                    {ach.metrics && (
                                                      <Badge variant="outline" className="ml-2 text-[9px] px-1 py-0 border-amber-200 dark:border-amber-700 text-amber-600 dark:text-amber-400">
                                                        {ach.metrics}
                                                      </Badge>
                                                    )}
                                                  </span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        ))}
                                        {exp.achievements.length > 6 && (
                                          <p className="text-[10px] text-muted-foreground">
                                            +{exp.achievements.length - 6} more achievements...
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </CardContent>
                              </Card>
                              </Link>
                            </div>
                          )
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Education Section - Card Grid Style */}
                  <div>
                    <div className="mb-6 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-xl font-semibold">
                        <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                        Education
                        <Badge variant="secondary" className="ml-2">{education.length}</Badge>
                      </h2>
                      <Button
                        size="sm"
                        onClick={addEducationWithKronus}
                        className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold)]/90 font-medium"
                      >
                        <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                        Add with Kronus
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {education.map((edu) => (
                        editingEducation === edu.id ? (
                          <EducationEditForm
                            key={edu.id}
                            education={edu}
                            onSave={handleSaveEducation}
                            onCancel={() => setEditingEducation(null)}
                          />
                        ) : (
                          <Link key={edu.id} href={`/repository/education/${edu.id}`}>
                            <Card className="group hover:shadow-md cursor-pointer transition-all border-blue-100 dark:border-blue-900/30 h-full">
                              <CardHeader className="pb-3">
                                {/* Decorative top bar */}
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-400 to-blue-600 rounded-t-lg" />

                                <div className="flex items-start justify-between pt-2">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                                        <GraduationCap className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                                      </div>
                                      <div>
                                        <CardTitle className="text-base font-semibold">
                                          {edu.degree}
                                        </CardTitle>
                                        <p className="text-sm text-blue-700 dark:text-blue-400 font-medium">
                                          {edu.field}
                                        </p>
                                      </div>
                                    </div>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100"
                                    onClick={(e) => { e.preventDefault(); setEditingEducation(edu.id); }}
                                  >
                                    <Edit className="h-3 w-3" />
                                  </Button>
                                </div>
                              </CardHeader>
                            <CardContent className="space-y-3">
                              <p className="text-sm font-medium">
                                {edu.institution}
                              </p>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Calendar className="h-3 w-3" />
                                <span>{edu.dateStart} - {edu.dateEnd}</span>
                                <span>•</span>
                                <span>{edu.location}</span>
                              </div>
                              {edu.tagline && (
                                <p className="text-xs text-muted-foreground italic pt-2 border-t border-blue-100 dark:border-blue-800">
                                  {edu.tagline}
                                </p>
                              )}
                              {edu.note && (
                                <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 p-2 rounded border border-blue-100 dark:border-blue-800">
                                  {edu.note}
                                </p>
                              )}
                              {edu.focusAreas && edu.focusAreas.length > 0 && (
                                <div className="pt-2 border-t border-blue-100 dark:border-blue-800">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-500 mb-1">
                                    Focus Areas
                                  </p>
                                  <ul className="space-y-0.5">
                                    {edu.focusAreas.slice(0, 3).map((area, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                                        <span className="text-blue-400 shrink-0">•</span>
                                        <span className="line-clamp-1">{area}</span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {edu.achievements && edu.achievements.length > 0 && (
                                <div className="pt-2 border-t border-blue-100 dark:border-blue-800">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-500 mb-1">
                                    Achievements
                                  </p>
                                  <ul className="space-y-0.5">
                                    {edu.achievements.slice(0, 2).map((ach, i) => (
                                      <li key={i} className="text-xs text-muted-foreground flex gap-2">
                                        <span className="text-blue-400 shrink-0">•</span>
                                        <span className="line-clamp-2">{ach}</span>
                                      </li>
                                    ))}
                                    {edu.achievements.length > 2 && (
                                      <li className="text-[10px] text-muted-foreground pl-4">
                                        +{edu.achievements.length - 2} more...
                                      </li>
                                    )}
                                  </ul>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                          </Link>
                        )
                      ))}
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </div>
        </ScrollArea>
      </Tabs>

      {/* Category Edit/Create Dialog */}
      <Dialog open={categoryDialogOpen} onOpenChange={setCategoryDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {editingCategory ? (
                <>
                  <Edit className="h-5 w-5" />
                  Edit Category
                </>
              ) : (
                <>
                  <Plus className="h-5 w-5" />
                  New Category
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? "Update the category name, color, and icon."
                : "Create a new skill category to organize your skills."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Category Name */}
            <div className="grid gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., AI & Development"
              />
            </div>

            {/* Color Selector */}
            <div className="grid gap-2">
              <Label>Color</Label>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_COLORS.map((color) => {
                  const colorClasses = getColorClasses(color);
                  return (
                    <button
                      key={color}
                      type="button"
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        categoryForm.color === color
                          ? "ring-2 ring-offset-2 ring-primary scale-110"
                          : "hover:scale-105"
                      } ${colorClasses.barColor}`}
                      onClick={() => setCategoryForm(prev => ({ ...prev, color }))}
                      title={color}
                    />
                  );
                })}
              </div>
            </div>

            {/* Icon Selector */}
            <div className="grid gap-2">
              <Label>Icon</Label>
              <div className="flex flex-wrap gap-2">
                {Object.entries(CATEGORY_ICONS).map(([iconName, iconElement]) => {
                  const colorClasses = getColorClasses(categoryForm.color);
                  return (
                    <button
                      key={iconName}
                      type="button"
                      className={`w-10 h-10 rounded-lg border-2 flex items-center justify-center transition-all ${
                        categoryForm.icon === iconName
                          ? `${colorClasses.bgColor} border-current ring-2 ring-offset-1 ring-primary`
                          : "border-muted hover:border-muted-foreground/50"
                      }`}
                      onClick={() => setCategoryForm(prev => ({ ...prev, icon: iconName }))}
                      title={iconName}
                    >
                      <span className={categoryForm.icon === iconName ? colorClasses.color : "text-muted-foreground"}>
                        {iconElement}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Preview */}
            <div className="grid gap-2">
              <Label>Preview</Label>
              <div className={`flex items-center gap-3 rounded-lg border p-3 ${getColorClasses(categoryForm.color).bgColor}`}>
                <span className={getColorClasses(categoryForm.color).color}>
                  {CATEGORY_ICONS[categoryForm.icon] || <Tag className="h-4 w-4" />}
                </span>
                <h3 className={`font-semibold ${getColorClasses(categoryForm.color).color}`}>
                  {categoryForm.name || "Category Name"}
                </h3>
              </div>
            </div>

            {/* Error Message */}
            {categoryError && (
              <div className="text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800">
                {categoryError}
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2">
            {editingCategory && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleDeleteCategory}
                disabled={deletingCategory || savingCategory || getSkillCountInCategory(editingCategory.name) > 0}
                className="mr-auto"
                title={getSkillCountInCategory(editingCategory.name) > 0
                  ? `Cannot delete: ${getSkillCountInCategory(editingCategory.name)} skills use this category`
                  : "Delete category"}
              >
                {deletingCategory ? (
                  "Deleting..."
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </>
                )}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={closeCategoryDialog} disabled={savingCategory || deletingCategory}>
              Cancel
            </Button>
            <Button type="button" onClick={handleSaveCategory} disabled={savingCategory || deletingCategory || !categoryForm.name.trim()}>
              {savingCategory ? "Saving..." : editingCategory ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
