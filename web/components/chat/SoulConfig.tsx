"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  Flame,
  FileText,
  Briefcase,
  Code2,
  MessageSquareText,
  Building2,
  GraduationCap,
  BookOpen,
  FolderKanban,
  ListTodo,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TARTARUS,
  popoverStyles,
  headerStyles,
  sectionStyles,
  toggleRowStyles,
  footerStyles,
  switchStyles,
  formatNumber,
} from "./config-styles";

// Default context limit (will be overridden by prop)
const DEFAULT_CONTEXT_LIMIT = 1000000;
const CONTEXT_WARNING_THRESHOLD = 0.5;

// SoulConfigState - controls which repository sections Kronus knows about
export interface SoulConfigState {
  writings: boolean;
  portfolioProjects: boolean;
  skills: boolean;
  workExperience: boolean;
  education: boolean;
  journalEntries: boolean;
  // Chat memory context - summaries only; full chats stay behind memory tools.
  chatIndex: boolean;
  // Linear context - mirrored from Linear API
  linearProjects: boolean;
  linearIssues: boolean;
  linearIncludeCompleted: boolean;
  // Slite context - cached knowledge base notes
  sliteNotes: boolean;
  // Notion context - cached workspace pages
  notionPages: boolean;
}

// Linear breakdown stats
interface LinearBreakdown {
  total: number;
  active: number;
  completed: number;
  tokensActive: number;
  tokensAll: number;
}

// Stats returned from API with actual token counts
interface SectionStats {
  writings: number;
  writingsTokens: number;
  portfolioProjects: number;
  portfolioProjectsTokens: number;
  skills: number;
  skillsTokens: number;
  workExperience: number;
  workExperienceTokens: number;
  education: number;
  educationTokens: number;
  journalEntries: number;
  journalEntriesTokens: number;
  chatIndex: number;
  chatIndexTokens: number;
  sliteNotes?: number;
  sliteNotesTokens?: number;
  notionPages?: number;
  notionPagesTokens?: number;
  // Legacy fields for backwards compatibility
  linearProjects: number;
  linearProjectsTokens: number;
  linearIssues: number;
  linearIssuesTokens: number;
  // Enhanced Linear breakdown
  linear?: {
    projects: LinearBreakdown;
    issues: LinearBreakdown;
  };
  baseTokens: number;
  totalTokens: number;
  totalTokensWithCompleted?: number;
}

interface SoulConfigProps {
  config: SoulConfigState;
  onChange: (config: SoulConfigState) => void;
  contextLimit?: number; // Model-specific context limit
}

const DEFAULT_CONFIG: SoulConfigState = {
  writings: false,
  portfolioProjects: false,
  skills: false,
  workExperience: false,
  education: false,
  journalEntries: false,
  chatIndex: false,
  linearProjects: false,
  linearIssues: false,
  linearIncludeCompleted: false,
  sliteNotes: false,
  notionPages: false,
};

const FALLBACK_STATS: SectionStats = {
  writings: 35,
  writingsTokens: 50000,
  portfolioProjects: 13,
  portfolioProjectsTokens: 3000,
  skills: 45,
  skillsTokens: 2000,
  workExperience: 8,
  workExperienceTokens: 1500,
  education: 3,
  educationTokens: 500,
  journalEntries: 30,
  journalEntriesTokens: 15000,
  chatIndex: 0,
  chatIndexTokens: 0,
  linearProjects: 0,
  linearProjectsTokens: 0,
  linearIssues: 0,
  linearIssuesTokens: 0,
  linear: {
    projects: { total: 0, active: 0, completed: 0, tokensActive: 0, tokensAll: 0 },
    issues: { total: 0, active: 0, completed: 0, tokensActive: 0, tokensAll: 0 },
  },
  baseTokens: 6000,
  totalTokens: 78000,
  totalTokensWithCompleted: 78000,
};

// Section metadata with icons
const REPOSITORY_SECTIONS = [
  {
    key: "writings",
    label: "Writings",
    icon: FileText,
    statsKey: "writings",
    tokensKey: "writingsTokens",
  },
  {
    key: "portfolioProjects",
    label: "Portfolio",
    icon: Briefcase,
    statsKey: "portfolioProjects",
    tokensKey: "portfolioProjectsTokens",
  },
  { key: "skills", label: "Skills", icon: Code2, statsKey: "skills", tokensKey: "skillsTokens" },
  {
    key: "workExperience",
    label: "Experience",
    icon: Building2,
    statsKey: "workExperience",
    tokensKey: "workExperienceTokens",
  },
  {
    key: "education",
    label: "Education",
    icon: GraduationCap,
    statsKey: "education",
    tokensKey: "educationTokens",
  },
  {
    key: "journalEntries",
    label: "Journal",
    icon: BookOpen,
    statsKey: "journalEntries",
    tokensKey: "journalEntriesTokens",
  },
  {
    key: "chatIndex",
    label: "Chat Index",
    icon: MessageSquareText,
    statsKey: "chatIndex",
    tokensKey: "chatIndexTokens",
  },
  {
    key: "sliteNotes",
    label: "Slite",
    icon: BookOpen,
    statsKey: "sliteNotes",
    tokensKey: "sliteNotesTokens",
  },
  {
    key: "notionPages",
    label: "Notion",
    icon: BookOpen,
    statsKey: "notionPages",
    tokensKey: "notionPagesTokens",
  },
] as const;

const LINEAR_SECTIONS = [
  {
    key: "linearProjects",
    label: "Projects",
    icon: FolderKanban,
    statsKey: "linearProjects",
    tokensKey: "linearProjectsTokens",
  },
  {
    key: "linearIssues",
    label: "Issues",
    icon: ListTodo,
    statsKey: "linearIssues",
    tokensKey: "linearIssuesTokens",
  },
] as const;

export function SoulConfig({
  config,
  onChange,
  contextLimit = DEFAULT_CONTEXT_LIMIT,
}: SoulConfigProps) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SectionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [agentName, setAgentName] = useState<string>("Kronus");

  useEffect(() => {
    fetch("/api/agent/config")
      .then((res) => res.json())
      .then((data) => {
        if (data.name) {
          setAgentName(data.name);
        }
      })
      .catch(() => {
        // Fallback to default
        setAgentName("Kronus");
      });
  }, []);

  useEffect(() => {
    if (open) {
      setLoading(true);
      fetch("/api/kronus/stats")
        .then((res) => {
          if (!res.ok) throw new Error("Failed to fetch stats");
          return res.json();
        })
        .then((data) => {
          // Validate that we got actual stats data
          if (data && typeof data.writings === "number") {
            setStats(data);
          } else {
            setStats(FALLBACK_STATS);
          }
          setLoading(false);
        })
        .catch(() => {
          setStats(FALLBACK_STATS);
          setLoading(false);
        });
    }
  }, [open]);

  const currentStats = stats || FALLBACK_STATS;

  // Get Linear tokens based on includeCompleted toggle
  const linearProjectTokens = config.linearIncludeCompleted
    ? (currentStats.linear?.projects.tokensAll ?? currentStats.linearProjectsTokens ?? 0)
    : (currentStats.linear?.projects.tokensActive ?? currentStats.linearProjectsTokens ?? 0);
  const linearIssueTokens = config.linearIncludeCompleted
    ? (currentStats.linear?.issues.tokensAll ?? currentStats.linearIssuesTokens ?? 0)
    : (currentStats.linear?.issues.tokensActive ?? currentStats.linearIssuesTokens ?? 0);

  const estimatedTokens =
    currentStats.baseTokens +
    (config.writings ? currentStats.writingsTokens : 0) +
    (config.portfolioProjects ? currentStats.portfolioProjectsTokens : 0) +
    (config.skills ? currentStats.skillsTokens : 0) +
    (config.workExperience ? currentStats.workExperienceTokens : 0) +
    (config.education ? currentStats.educationTokens : 0) +
    (config.journalEntries ? currentStats.journalEntriesTokens : 0) +
    (config.chatIndex ? currentStats.chatIndexTokens : 0) +
    (config.linearProjects ? linearProjectTokens : 0) +
    (config.linearIssues ? linearIssueTokens : 0) +
    (config.sliteNotes ? (currentStats.sliteNotesTokens ?? 0) : 0) +
    (config.notionPages ? (currentStats.notionPagesTokens ?? 0) : 0);

  const contextPercentage = (estimatedTokens / contextLimit) * 100;
  const isHighContext = contextPercentage > CONTEXT_WARNING_THRESHOLD * 100;

  const toggleSection = (section: keyof SoulConfigState) => {
    onChange({ ...config, [section]: !config[section] });
  };

  const selectAll = () => {
    onChange({
      ...config,
      writings: true,
      portfolioProjects: true,
      skills: true,
      workExperience: true,
      education: true,
      journalEntries: true,
      chatIndex: true,
      linearProjects: true,
      linearIssues: true,
      sliteNotes: true,
      notionPages: true,
    });
  };

  const selectNone = () => {
    onChange({
      ...config,
      writings: false,
      portfolioProjects: false,
      skills: false,
      workExperience: false,
      education: false,
      journalEntries: false,
      chatIndex: false,
      linearProjects: false,
      linearIssues: false,
      sliteNotes: false,
      notionPages: false,
    });
  };

  const syncLinear = async () => {
    setSyncing(true);
    try {
      await fetch("/api/integrations/linear/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ includeCompleted: config.linearIncludeCompleted }),
      });
      // Refresh stats
      const res = await fetch("/api/kronus/stats");
      setStats(await res.json());
    } catch (e) {
      console.error("Linear sync failed:", e);
    }
    setSyncing(false);
  };

  const enabledCount = [
    config.writings,
    config.portfolioProjects,
    config.skills,
    config.workExperience,
    config.education,
    config.journalEntries,
    config.chatIndex,
    config.linearProjects,
    config.linearIssues,
  ].filter(Boolean).length;

  const totalSections = 9;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 transition-colors",
            enabledCount < totalSections ? "text-[#D4AF37]" : "text-[#888899]"
          )}
        >
          <Flame className="h-4 w-4" />
          <span className="hidden sm:inline">Soul</span>
          <span
            className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
            style={{
              backgroundColor: enabledCount < totalSections ? TARTARUS.goldGlow : TARTARUS.surface,
              color: enabledCount < totalSections ? TARTARUS.gold : TARTARUS.textMuted,
            }}
          >
            {enabledCount}/{totalSections}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[340px] overflow-hidden rounded-xl p-0 shadow-2xl"
        align="start"
        sideOffset={8}
        style={popoverStyles.container}
      >
        <div style={popoverStyles.inner}>
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: `1px solid ${TARTARUS.borderSubtle}` }}
          >
            <div>
              <h4 style={headerStyles.title}>Soul Library</h4>
              <p style={headerStyles.subtitle}>Context for {agentName}</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="rounded hover:bg-white/5"
                style={headerStyles.actionButton}
              >
                All
              </button>
              <button
                onClick={selectNone}
                className="rounded hover:bg-white/5"
                style={headerStyles.actionButton}
              >
                None
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="max-h-[400px] space-y-4 overflow-y-auto px-4 py-3">
            {/* Library Section */}
            <div>
              <div style={sectionStyles.label}>Library</div>
              <div className="space-y-1">
                {REPOSITORY_SECTIONS.map(({ key, label, icon: Icon, statsKey, tokensKey }) => {
                  const enabled = config[key as keyof SoulConfigState] as boolean;
                  const count = (currentStats[statsKey as keyof SectionStats] as number) ?? 0;
                  const tokens = (currentStats[tokensKey as keyof SectionStats] as number) ?? 0;

                  return (
                    <div
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.05]"
                      onClick={() => toggleSection(key as keyof SoulConfigState)}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleSection(key as keyof SoulConfigState)}
                        className="data-[state=checked]:bg-[var(--tartarus-teal)] data-[state=unchecked]:bg-[var(--tartarus-surface)]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Icon
                        className="h-4 w-4 transition-colors"
                        style={{ color: enabled ? TARTARUS.teal : TARTARUS.textDim }}
                      />
                      <span
                        className="flex-1 text-[13px] font-medium transition-colors"
                        style={{ color: enabled ? TARTARUS.text : TARTARUS.textMuted }}
                      >
                        {label}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-mono text-[11px]"
                        style={{
                          color: TARTARUS.textDim,
                          backgroundColor: TARTARUS.surface,
                        }}
                      >
                        {loading ? "..." : count}
                      </span>
                      <span
                        className="w-12 text-right font-mono text-[11px]"
                        style={{ color: TARTARUS.textDim }}
                      >
                        ~{loading ? "..." : formatNumber(tokens)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Linear Section */}
            <div style={sectionStyles.divider}>
              <div className="mb-2 flex items-center justify-between">
                <div style={sectionStyles.label} className="mb-0">
                  Linear
                </div>
                <button
                  onClick={syncLinear}
                  disabled={syncing}
                  className="flex items-center gap-1 rounded px-2 py-1 text-[10px] transition-colors hover:bg-white/5"
                  style={{ color: TARTARUS.textMuted }}
                >
                  <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                  {syncing ? "Syncing..." : "Sync"}
                </button>
              </div>
              <div className="space-y-1">
                {LINEAR_SECTIONS.map(({ key, label, icon: Icon }) => {
                  const enabled = config[key as keyof SoulConfigState] as boolean;
                  // Get breakdown from enhanced stats
                  const breakdown =
                    key === "linearProjects"
                      ? currentStats.linear?.projects
                      : currentStats.linear?.issues;

                  // Calculate count and tokens based on includeCompleted toggle
                  const activeCount = breakdown?.active ?? 0;
                  const completedCount = breakdown?.completed ?? 0;
                  const totalCount =
                    breakdown?.total ?? (currentStats[key as keyof SectionStats] as number) ?? 0;
                  const displayCount = config.linearIncludeCompleted ? totalCount : activeCount;
                  const tokens = config.linearIncludeCompleted
                    ? (breakdown?.tokensAll ?? 0)
                    : (breakdown?.tokensActive ?? 0);

                  return (
                    <div
                      key={key}
                      className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.05]"
                      onClick={() => toggleSection(key as keyof SoulConfigState)}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleSection(key as keyof SoulConfigState)}
                        className="data-[state=checked]:bg-[var(--tartarus-google)] data-[state=unchecked]:bg-[var(--tartarus-surface)]"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <Icon
                        className="h-4 w-4 transition-colors"
                        style={{ color: enabled ? TARTARUS.google : TARTARUS.textDim }}
                      />
                      <span
                        className="flex-1 text-[13px] font-medium transition-colors"
                        style={{ color: enabled ? TARTARUS.text : TARTARUS.textMuted }}
                      >
                        {label}
                      </span>
                      <span
                        className="rounded px-2 py-0.5 font-mono text-[11px]"
                        style={{
                          color: TARTARUS.textDim,
                          backgroundColor: TARTARUS.surface,
                        }}
                        title={
                          breakdown && !config.linearIncludeCompleted && completedCount > 0
                            ? `${completedCount} completed excluded`
                            : undefined
                        }
                      >
                        {loading ? "..." : displayCount}
                        {!loading && !config.linearIncludeCompleted && completedCount > 0 && (
                          <span style={{ color: TARTARUS.gold, marginLeft: 4 }}>
                            +{completedCount}
                          </span>
                        )}
                      </span>
                      <span
                        className="w-12 text-right font-mono text-[11px]"
                        style={{ color: TARTARUS.textDim }}
                      >
                        ~{loading ? "..." : formatNumber(tokens)}
                      </span>
                    </div>
                  );
                })}

                {/* Include Completed toggle */}
                <div
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.05]"
                  onClick={() => toggleSection("linearIncludeCompleted")}
                >
                  <Switch
                    checked={config.linearIncludeCompleted}
                    onCheckedChange={() => toggleSection("linearIncludeCompleted")}
                    className="data-[state=checked]:bg-[#D4AF37] data-[state=unchecked]:bg-[var(--tartarus-surface)]"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <CheckCircle2
                    className="h-4 w-4 transition-colors"
                    style={{
                      color: config.linearIncludeCompleted ? TARTARUS.gold : TARTARUS.textDim,
                    }}
                  />
                  <span
                    className="flex-1 text-[13px] font-medium transition-colors"
                    style={{
                      color: config.linearIncludeCompleted ? TARTARUS.text : TARTARUS.textMuted,
                    }}
                  >
                    Include Completed
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Footer - Token Estimate */}
          <div
            className="px-4 py-3"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[12px]" style={{ color: TARTARUS.textMuted }}>
                Estimated context
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="font-mono text-[13px] font-medium"
                  style={{ color: isHighContext ? TARTARUS.gold : TARTARUS.teal }}
                >
                  ~{formatNumber(estimatedTokens)}
                </span>
                <span className="text-[11px]" style={{ color: TARTARUS.textDim }}>
                  / {formatNumber(contextLimit)}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="h-1.5 overflow-hidden rounded-full"
              style={{ backgroundColor: TARTARUS.border }}
            >
              <div
                className="h-full rounded-full transition-[width,background-color,box-shadow] duration-200"
                style={{
                  width: `${Math.min(contextPercentage, 100)}%`,
                  backgroundColor: isHighContext ? TARTARUS.gold : TARTARUS.teal,
                  boxShadow: `0 0 8px ${isHighContext ? TARTARUS.gold : TARTARUS.teal}40`,
                }}
              />
            </div>

            {isHighContext && (
              <p
                className="mt-2 rounded px-2 py-1.5 text-[11px]"
                style={{
                  color: TARTARUS.gold,
                  backgroundColor: TARTARUS.goldGlow,
                  borderLeft: `2px solid ${TARTARUS.gold}`,
                }}
              >
                High context usage. Consider disabling some sections.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DEFAULT_CONFIG };
