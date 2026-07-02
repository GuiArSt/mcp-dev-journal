"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Zap,
  Code2,
  PenTool,
  Briefcase,
  Sparkles,
  Check,
  X,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Settings2,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TARTARUS,
  popoverStyles,
  headerStyles,
} from "./config-styles";
import type { SkillInfo } from "@/lib/ai/skills";
import type { SoulConfigState } from "./SoulConfig";
import type { ToolsConfigState } from "./ToolsConfig";

// Icon mapping for skill icons stored as strings in DB
const ICON_MAP: Record<string, typeof Zap> = {
  Zap,
  Code2,
  PenTool,
  Briefcase,
  Sparkles,
};

function getIcon(iconName: string) {
  return ICON_MAP[iconName] || Zap;
}

// Soul config section labels
const SOUL_SECTIONS: { key: keyof SoulConfigState; label: string }[] = [
  { key: "writings", label: "Writings" },
  { key: "portfolioProjects", label: "Portfolio" },
  { key: "skills", label: "Skills" },
  { key: "workExperience", label: "Experience" },
  { key: "education", label: "Education" },
  { key: "journalEntries", label: "Journal" },
  { key: "chatIndex", label: "Chat Index" },
  { key: "linearProjects", label: "Linear Projects" },
  { key: "linearIssues", label: "Linear Issues" },
  { key: "sliteNotes", label: "Slite Notes" },
  { key: "notionPages", label: "Notion Pages" },
  { key: "slackConversations", label: "Slack" },
];

// Tools config section labels
const TOOL_SECTIONS: { key: keyof ToolsConfigState; label: string }[] = [
  { key: "journal", label: "Journal" },
  { key: "repository", label: "Library" },
  { key: "cursorDelegate", label: "Cursor code" },
  { key: "aiIntegrations", label: "AI Integrations" },
  { key: "linear", label: "Linear" },
  { key: "slite", label: "Slite" },
  { key: "notion", label: "Notion" },
  { key: "slack", label: "Slack" },
  { key: "git", label: "Git" },
  { key: "media", label: "Media" },
  { key: "imageGeneration", label: "Image Gen" },
  { key: "webSearch", label: "Web Search" },
  { key: "google", label: "Google" },
  { key: "memory", label: "Memory" },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface SkillSelectorProps {
  activeSkillSlugs: string[];
  onChange: (slugs: string[]) => void;
  /** Whether the user has manually overridden soul/tools config */
  isManualOverride?: boolean;
  /** Current soul config (for advanced display) */
  soulConfig?: SoulConfigState;
  onSoulChange?: (config: SoulConfigState) => void;
  /** Current tools config (for advanced display) */
  toolsConfig?: ToolsConfigState;
  onToolsChange?: (config: ToolsConfigState) => void;
}

export function SkillSelector({
  activeSkillSlugs,
  onChange,
  isManualOverride = false,
  soulConfig,
  onSoulChange,
  toolsConfig,
  onToolsChange,
}: SkillSelectorProps) {
  const [open, setOpen] = useState(false);
  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);

  // Fetch available skills
  const fetchSkills = useCallback(async () => {
    if (availableSkills.length > 0) return;
    setLoading(true);
    try {
      const res = await fetch("/api/kronus/skills");
      if (res.ok) {
        const data = await res.json();
        setAvailableSkills(data.skills || []);
      }
    } catch (err) {
      console.error("[SkillSelector] Failed to fetch skills:", err);
    } finally {
      setLoading(false);
    }
  }, [availableSkills.length]);

  // Load skills when popover opens
  useEffect(() => {
    if (open) fetchSkills();
  }, [open, fetchSkills]);

  const toggleSkill = (slug: string) => {
    if (activeSkillSlugs.includes(slug)) {
      onChange(activeSkillSlugs.filter((s) => s !== slug));
    } else {
      onChange([...activeSkillSlugs, slug]);
    }
  };

  const clearAll = () => onChange([]);

  // Determine display state
  const activeCount = activeSkillSlugs.length;
  const isLean = activeCount === 0 && !isManualOverride;
  const isCustom = isManualOverride && activeCount === 0;

  // Find the single active skill for button display (if only one)
  const singleActiveSkill =
    activeCount === 1
      ? availableSkills.find((s) => s.slug === activeSkillSlugs[0])
      : null;

  // Button color
  let buttonColor: string = TARTARUS.textMuted;
  if (isCustom) {
    buttonColor = TARTARUS.gold;
  } else if (singleActiveSkill) {
    buttonColor = singleActiveSkill.color;
  } else if (activeCount > 1) {
    buttonColor = TARTARUS.teal;
  }

  // Button label
  let buttonLabel = "Lean";
  if (isCustom) {
    buttonLabel = "Custom";
  } else if (singleActiveSkill) {
    buttonLabel = singleActiveSkill.title;
  } else if (activeCount > 1) {
    buttonLabel = `${activeCount} Skills`;
  }

  const ButtonIcon = singleActiveSkill
    ? getIcon(singleActiveSkill.icon)
    : isCustom
      ? AlertTriangle
      : Zap;

  // Count active soul/tools sections for badge
  const soulActiveCount = soulConfig
    ? SOUL_SECTIONS.filter((s) => soulConfig[s.key]).length
    : 0;
  const toolsActiveCount = toolsConfig
    ? TOOL_SECTIONS.filter((t) => toolsConfig[t.key]).length
    : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 transition-colors"
          style={{ color: buttonColor }}
        >
          <ButtonIcon className="h-4 w-4" />
          <span className="hidden sm:inline">{buttonLabel}</span>
          {activeCount > 0 && (
            <span
              className="rounded-full px-1.5 py-0.5 font-mono text-[10px]"
              style={{
                backgroundColor: `${buttonColor}20`,
                color: buttonColor,
              }}
            >
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[320px] overflow-hidden rounded-xl p-0 shadow-2xl"
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
              <h4 style={headerStyles.title}>Skills</h4>
              <p style={headerStyles.subtitle}>On-demand context & tools</p>
            </div>
            {activeCount > 0 && (
              <button
                onClick={clearAll}
                className="flex items-center gap-1 rounded hover:bg-white/5"
                style={headerStyles.actionButton}
              >
                <X className="h-3 w-3" />
                Clear
              </button>
            )}
          </div>

          {/* Custom Override Warning */}
          {isCustom && (
            <div
              className="mx-4 mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
              style={{
                backgroundColor: TARTARUS.goldGlow,
                border: `1px solid ${TARTARUS.gold}40`,
              }}
            >
              <AlertTriangle
                className="h-3.5 w-3.5 shrink-0"
                style={{ color: TARTARUS.gold }}
              />
              <span className="text-[11px]" style={{ color: TARTARUS.gold }}>
                Manual override active — Soul/Tools set directly
              </span>
            </div>
          )}

          {/* Skill List */}
          <div className="space-y-1 p-2">
            {loading ? (
              <div className="px-3 py-4 text-center">
                <span className="text-[12px]" style={{ color: TARTARUS.textDim }}>
                  Loading skills...
                </span>
              </div>
            ) : availableSkills.length === 0 ? (
              <div className="px-3 py-4 text-center">
                <span className="text-[12px]" style={{ color: TARTARUS.textDim }}>
                  No skills configured
                </span>
              </div>
            ) : (
              availableSkills.map((skill) => {
                const Icon = getIcon(skill.icon);
                const isActive = activeSkillSlugs.includes(skill.slug);

                return (
                  <button
                    key={skill.slug}
                    onClick={() => toggleSkill(skill.slug)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,border-color] duration-150",
                      "hover:bg-white/[0.04]"
                    )}
                    style={{
                      backgroundColor: isActive ? `${skill.color}10` : undefined,
                      border: isActive
                        ? `1px solid ${skill.color}40`
                        : "1px solid transparent",
                    }}
                  >
                    <div
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                      style={{
                        backgroundColor: isActive
                          ? `${skill.color}20`
                          : TARTARUS.surface,
                      }}
                    >
                      <Icon
                        className="h-4 w-4"
                        style={{
                          color: isActive ? skill.color : TARTARUS.textDim,
                        }}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <span
                        className="block text-[13px] font-medium"
                        style={{
                          color: isActive ? skill.color : TARTARUS.text,
                        }}
                      >
                        {skill.title}
                      </span>
                      <span
                        className="block truncate text-[11px]"
                        style={{ color: TARTARUS.textDim }}
                      >
                        {skill.description}
                      </span>
                    </div>
                    {isActive && (
                      <Check
                        className="h-4 w-4 shrink-0"
                        style={{ color: skill.color }}
                      />
                    )}
                  </button>
                );
              })
            )}
          </div>

          {/* Advanced Config (Soul + Tools) */}
          {soulConfig && toolsConfig && onSoulChange && onToolsChange && (
            <>
              <div
                style={{ borderTop: `1px solid ${TARTARUS.borderSubtle}` }}
              >
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-white/[0.05]"
                >
                  <Settings2
                    className="h-3.5 w-3.5"
                    style={{ color: TARTARUS.textDim }}
                  />
                  <span className="flex-1 text-[12px] font-medium" style={{ color: TARTARUS.textDim }}>
                    Advanced Config
                  </span>
                  <span className="font-mono text-[10px]" style={{ color: TARTARUS.textMuted }}>
                    Soul {soulActiveCount}/{SOUL_SECTIONS.length} | Tools {toolsActiveCount}/{TOOL_SECTIONS.length}
                  </span>
                  {showAdvanced ? (
                    <ChevronDown className="h-3 w-3" style={{ color: TARTARUS.textDim }} />
                  ) : (
                    <ChevronRight className="h-3 w-3" style={{ color: TARTARUS.textDim }} />
                  )}
                </button>

                {showAdvanced && (
                  <div className="px-4 pb-3">
                    {/* Soul Config */}
                    <div className="mb-2">
                      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: TARTARUS.textMuted }}>
                        Soul Context
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {SOUL_SECTIONS.map((section) => {
                          const isOn = soulConfig[section.key];
                          return (
                            <button
                              key={section.key}
                              onClick={() => {
                                onSoulChange({ ...soulConfig, [section.key]: !isOn });
                              }}
                              className="rounded px-2 py-0.5 text-[11px] transition-colors"
                              style={{
                                backgroundColor: isOn ? `${TARTARUS.teal}20` : TARTARUS.surface,
                                color: isOn ? TARTARUS.teal : TARTARUS.textDim,
                                border: `1px solid ${isOn ? `${TARTARUS.teal}40` : TARTARUS.borderSubtle}`,
                              }}
                            >
                              {section.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Tools Config */}
                    <div>
                      <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: TARTARUS.textMuted }}>
                        Tools
                      </span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {TOOL_SECTIONS.map((section) => {
                          const isOn = toolsConfig[section.key];
                          return (
                            <button
                              key={section.key}
                              onClick={() => {
                                onToolsChange({ ...toolsConfig, [section.key]: !isOn });
                              }}
                              className="rounded px-2 py-0.5 text-[11px] transition-colors"
                              style={{
                                backgroundColor: isOn ? `${TARTARUS.teal}20` : TARTARUS.surface,
                                color: isOn ? TARTARUS.teal : TARTARUS.textDim,
                                border: `1px solid ${isOn ? `${TARTARUS.teal}40` : TARTARUS.borderSubtle}`,
                              }}
                            >
                              {section.label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Sync Buttons */}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={async () => {
                          setSyncing(true);
                          setSyncStatus(null);
                          try {
                            const res = await fetch("/api/integrations/linear/sync", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ includeCompleted: true }),
                            });
                            if (res.ok) {
                              setSyncStatus("Linear synced");
                              setTimeout(() => setSyncStatus(null), 3000);
                            } else {
                              setSyncStatus("Linear failed");
                              setTimeout(() => setSyncStatus(null), 3000);
                            }
                          } catch {
                            setSyncStatus("Error");
                            setTimeout(() => setSyncStatus(null), 3000);
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        disabled={syncing}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors hover:bg-white/[0.04]"
                        style={{
                          border: `1px solid ${TARTARUS.borderSubtle}`,
                          color: TARTARUS.textDim,
                        }}
                      >
                        <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                        Sync Linear
                      </button>
                      <button
                        onClick={async () => {
                          setSyncing(true);
                          setSyncStatus(null);
                          try {
                            const res = await fetch("/api/integrations/slite/sync", {
                              method: "POST",
                            });
                            if (res.ok) {
                              setSyncStatus("Slite synced");
                              setTimeout(() => setSyncStatus(null), 3000);
                            } else {
                              setSyncStatus("Slite failed");
                              setTimeout(() => setSyncStatus(null), 3000);
                            }
                          } catch {
                            setSyncStatus("Error");
                            setTimeout(() => setSyncStatus(null), 3000);
                          } finally {
                            setSyncing(false);
                          }
                        }}
                        disabled={syncing}
                        className="flex items-center gap-1.5 rounded px-2 py-1 text-[11px] transition-colors hover:bg-white/[0.04]"
                        style={{
                          border: `1px solid ${TARTARUS.borderSubtle}`,
                          color: TARTARUS.textDim,
                        }}
                      >
                        <RefreshCw className={cn("h-3 w-3", syncing && "animate-spin")} />
                        Sync Slite
                      </button>
                      {syncStatus && (
                        <span
                          className="text-[10px] font-medium"
                          style={{ color: syncStatus.includes("synced") ? TARTARUS.teal : TARTARUS.gold }}
                        >
                          {syncStatus}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Footer */}
          <div
            className="flex items-center justify-between px-4 py-2.5"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <span className="text-[11px]" style={{ color: TARTARUS.textDim }}>
              {isLean
                ? "Lean mode — minimal tokens"
                : isCustom
                  ? "Manual config override"
                  : `${activeCount} skill${activeCount !== 1 ? "s" : ""} active`}
            </span>
            <span
              className="font-mono text-[11px] font-medium"
              style={{ color: isLean ? TARTARUS.textDim : buttonColor }}
            >
              {isLean ? "~6k" : "dynamic"}
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
