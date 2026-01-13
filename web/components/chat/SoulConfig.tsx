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

// Model context limits - Gemini 3 Pro has 1M context
const MODEL_CONTEXT_LIMIT = 1000000;
const CONTEXT_WARNING_THRESHOLD = 0.5;

// SoulConfigState - controls which repository sections Kronus knows about
export interface SoulConfigState {
  writings: boolean;
  portfolioProjects: boolean;
  skills: boolean;
  workExperience: boolean;
  education: boolean;
  journalEntries: boolean;
  // Linear context - mirrored from Linear API
  linearProjects: boolean;
  linearIssues: boolean;
  linearIncludeCompleted: boolean;
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
  linearProjects: number;
  linearProjectsTokens: number;
  linearIssues: number;
  linearIssuesTokens: number;
  baseTokens: number;
  totalTokens: number;
}

interface SoulConfigProps {
  config: SoulConfigState;
  onChange: (config: SoulConfigState) => void;
}

const DEFAULT_CONFIG: SoulConfigState = {
  writings: true,
  portfolioProjects: true,
  skills: true,
  workExperience: true,
  education: true,
  journalEntries: true,
  linearProjects: true,
  linearIssues: true,
  linearIncludeCompleted: false,
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
  linearProjects: 0,
  linearProjectsTokens: 0,
  linearIssues: 0,
  linearIssuesTokens: 0,
  baseTokens: 6000,
  totalTokens: 78000,
};

// Section metadata with icons
const REPOSITORY_SECTIONS = [
  { key: "writings", label: "Writings", icon: FileText, statsKey: "writings", tokensKey: "writingsTokens" },
  { key: "portfolioProjects", label: "Portfolio", icon: Briefcase, statsKey: "portfolioProjects", tokensKey: "portfolioProjectsTokens" },
  { key: "skills", label: "Skills", icon: Code2, statsKey: "skills", tokensKey: "skillsTokens" },
  { key: "workExperience", label: "Experience", icon: Building2, statsKey: "workExperience", tokensKey: "workExperienceTokens" },
  { key: "education", label: "Education", icon: GraduationCap, statsKey: "education", tokensKey: "educationTokens" },
  { key: "journalEntries", label: "Journal", icon: BookOpen, statsKey: "journalEntries", tokensKey: "journalEntriesTokens" },
] as const;

const LINEAR_SECTIONS = [
  { key: "linearProjects", label: "Projects", icon: FolderKanban, statsKey: "linearProjects", tokensKey: "linearProjectsTokens" },
  { key: "linearIssues", label: "Issues", icon: ListTodo, statsKey: "linearIssues", tokensKey: "linearIssuesTokens" },
] as const;

export function SoulConfig({ config, onChange }: SoulConfigProps) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SectionStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);

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
  const estimatedTokens =
    currentStats.baseTokens +
    (config.writings ? currentStats.writingsTokens : 0) +
    (config.portfolioProjects ? currentStats.portfolioProjectsTokens : 0) +
    (config.skills ? currentStats.skillsTokens : 0) +
    (config.workExperience ? currentStats.workExperienceTokens : 0) +
    (config.education ? currentStats.educationTokens : 0) +
    (config.journalEntries ? currentStats.journalEntriesTokens : 0) +
    (config.linearProjects ? (currentStats.linearProjectsTokens || 0) : 0) +
    (config.linearIssues ? (currentStats.linearIssuesTokens || 0) : 0);

  const contextPercentage = (estimatedTokens / MODEL_CONTEXT_LIMIT) * 100;
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
      linearProjects: true,
      linearIssues: true,
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
      linearProjects: false,
      linearIssues: false,
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
    config.writings, config.portfolioProjects, config.skills,
    config.workExperience, config.education, config.journalEntries,
    config.linearProjects, config.linearIssues
  ].filter(Boolean).length;

  const totalSections = 8;

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
            className="text-[10px] px-1.5 py-0.5 rounded-full font-mono"
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
        className="w-[340px] z-[100] shadow-2xl rounded-xl p-0 overflow-hidden"
        align="start"
        sideOffset={8}
        style={popoverStyles.container}
      >
        <div style={popoverStyles.inner}>
          {/* Header */}
          <div
            className="px-4 py-3 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${TARTARUS.borderSubtle}` }}
          >
            <div>
              <h4 style={headerStyles.title}>Soul Repository</h4>
              <p style={headerStyles.subtitle}>Context for Kronus</p>
            </div>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                className="hover:bg-white/5 rounded"
                style={headerStyles.actionButton}
              >
                All
              </button>
              <button
                onClick={selectNone}
                className="hover:bg-white/5 rounded"
                style={headerStyles.actionButton}
              >
                None
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-4 max-h-[400px] overflow-y-auto">
            {/* Repository Section */}
            <div>
              <div style={sectionStyles.label}>Repository</div>
              <div className="space-y-1">
                {REPOSITORY_SECTIONS.map(({ key, label, icon: Icon, statsKey, tokensKey }) => {
                  const enabled = config[key as keyof SoulConfigState] as boolean;
                  const count = (currentStats[statsKey as keyof SectionStats] as number) ?? 0;
                  const tokens = (currentStats[tokensKey as keyof SectionStats] as number) ?? 0;

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => toggleSection(key as keyof SoulConfigState)}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleSection(key as keyof SoulConfigState)}
                        className="data-[state=checked]:bg-[#00CED1] data-[state=unchecked]:bg-[#12121a]"
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
                        className="text-[11px] font-mono px-2 py-0.5 rounded"
                        style={{
                          color: TARTARUS.textDim,
                          backgroundColor: TARTARUS.surface,
                        }}
                      >
                        {loading ? "..." : count}
                      </span>
                      <span
                        className="text-[11px] font-mono w-12 text-right"
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
              <div className="flex items-center justify-between mb-2">
                <div style={sectionStyles.label} className="mb-0">Linear</div>
                <button
                  onClick={syncLinear}
                  disabled={syncing}
                  className="flex items-center gap-1 text-[10px] px-2 py-1 rounded hover:bg-white/5 transition-colors"
                  style={{ color: TARTARUS.textMuted }}
                >
                  <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                  {syncing ? "Syncing..." : "Sync"}
                </button>
              </div>
              <div className="space-y-1">
                {LINEAR_SECTIONS.map(({ key, label, icon: Icon, statsKey, tokensKey }) => {
                  const enabled = config[key as keyof SoulConfigState] as boolean;
                  const count = (currentStats[statsKey as keyof SectionStats] as number) ?? 0;
                  const tokens = (currentStats[tokensKey as keyof SectionStats] as number) ?? 0;

                  return (
                    <div
                      key={key}
                      className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer"
                      onClick={() => toggleSection(key as keyof SoulConfigState)}
                    >
                      <Switch
                        checked={enabled}
                        onCheckedChange={() => toggleSection(key as keyof SoulConfigState)}
                        className="data-[state=checked]:bg-[#4285F4] data-[state=unchecked]:bg-[#12121a]"
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
                        className="text-[11px] font-mono px-2 py-0.5 rounded"
                        style={{
                          color: TARTARUS.textDim,
                          backgroundColor: TARTARUS.surface,
                        }}
                      >
                        {loading ? "..." : count}
                      </span>
                      <span
                        className="text-[11px] font-mono w-12 text-right"
                        style={{ color: TARTARUS.textDim }}
                      >
                        ~{loading ? "..." : formatNumber(tokens)}
                      </span>
                    </div>
                  );
                })}

                {/* Include Completed toggle */}
                <div
                  className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-white/[0.03] transition-colors cursor-pointer"
                  onClick={() => toggleSection("linearIncludeCompleted")}
                >
                  <Switch
                    checked={config.linearIncludeCompleted}
                    onCheckedChange={() => toggleSection("linearIncludeCompleted")}
                    className="data-[state=checked]:bg-[#D4AF37] data-[state=unchecked]:bg-[#12121a]"
                    onClick={(e) => e.stopPropagation()}
                  />
                  <CheckCircle2
                    className="h-4 w-4 transition-colors"
                    style={{ color: config.linearIncludeCompleted ? TARTARUS.gold : TARTARUS.textDim }}
                  />
                  <span
                    className="flex-1 text-[13px] font-medium transition-colors"
                    style={{ color: config.linearIncludeCompleted ? TARTARUS.text : TARTARUS.textMuted }}
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
            style={{ borderTop: `1px solid ${TARTARUS.borderSubtle}`, backgroundColor: TARTARUS.surface }}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[12px]" style={{ color: TARTARUS.textMuted }}>
                Estimated context
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="text-[13px] font-mono font-medium"
                  style={{ color: isHighContext ? TARTARUS.gold : TARTARUS.teal }}
                >
                  ~{formatNumber(estimatedTokens)}
                </span>
                <span className="text-[11px]" style={{ color: TARTARUS.textDim }}>
                  / {formatNumber(MODEL_CONTEXT_LIMIT)}
                </span>
              </div>
            </div>

            {/* Progress bar */}
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ backgroundColor: TARTARUS.border }}
            >
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.min(contextPercentage, 100)}%`,
                  backgroundColor: isHighContext ? TARTARUS.gold : TARTARUS.teal,
                  boxShadow: `0 0 8px ${isHighContext ? TARTARUS.gold : TARTARUS.teal}40`,
                }}
              />
            </div>

            {isHighContext && (
              <p
                className="text-[11px] mt-2 px-2 py-1.5 rounded"
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
