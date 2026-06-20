"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Zap,
  Code2,
  PenTool,
  Briefcase,
  Check,
  Leaf,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TARTARUS, popoverStyles, headerStyles } from "./config-styles";
import type { SoulConfigState } from "./SoulConfig";
import type { ToolsConfigState } from "./ToolsConfig";
import { isAlmightyConfig } from "@/lib/ai/skills";

// Mode definition — maps to skill slugs for on-demand loading
interface KronusModeConfig {
  id: string;
  name: string;
  description: string;
  icon: typeof Zap;
  color: string;
  colorGlow: string;
  /** Skill slugs this mode activates (primary path) */
  skillSlugs: string[];
}

// ============================================================================
// MODE PRESETS — now mapped to skills
// ============================================================================

const KRONUS_MODES: KronusModeConfig[] = [
  {
    id: "lite",
    name: "Lite",
    description: "All summaries, on-demand depth",
    icon: Leaf,
    color: TARTARUS.textMuted,
    colorGlow: `${TARTARUS.textMuted}15`,
    skillSlugs: [], // No skills = Kronus Lite (summary index)
  },
  {
    id: "developer",
    name: "Developer",
    description: "Code, journal, git",
    icon: Code2,
    color: "#22c55e",
    colorGlow: "rgba(34, 197, 94, 0.15)",
    skillSlugs: ["skill-developer"],
  },
  {
    id: "writer",
    name: "Writer",
    description: "Writings, creativity",
    icon: PenTool,
    color: TARTARUS.purple,
    colorGlow: TARTARUS.purpleGlow,
    skillSlugs: ["skill-writer"],
  },
  {
    id: "job-hunter",
    name: "Job Hunter",
    description: "CV, portfolio, tickets",
    icon: Briefcase,
    color: TARTARUS.gold,
    colorGlow: TARTARUS.goldGlow,
    skillSlugs: ["skill-job-hunter"],
  },
  {
    id: "almighty",
    name: "Almighty",
    description: "Everything enabled",
    icon: Zap,
    color: TARTARUS.teal,
    colorGlow: TARTARUS.tealGlow,
    skillSlugs: ["skill-almighty"],
  },
];

// ============================================================================
// COMPONENT
// ============================================================================

interface KronusModesProps {
  /** Legacy: set raw soul + tools config (manual override path) */
  onApply: (soul: SoulConfigState, tools: ToolsConfigState) => void;
  /** Primary: set active skill slugs */
  onApplySkills: (slugs: string[]) => void;
  currentSoul: SoulConfigState;
  currentTools: ToolsConfigState;
  activeSkillSlugs: string[];
}

function detectCurrentMode(
  activeSkillSlugs: string[],
  currentSoul: SoulConfigState,
  currentTools: ToolsConfigState
): string | null {
  // Check skill-based modes first
  for (const mode of KRONUS_MODES) {
    if (mode.skillSlugs.length === 0 && activeSkillSlugs.length === 0) {
      return mode.id; // Lean mode
    }
    if (
      mode.skillSlugs.length > 0 &&
      mode.skillSlugs.length === activeSkillSlugs.length &&
      mode.skillSlugs.every((s) => activeSkillSlugs.includes(s))
    ) {
      return mode.id;
    }
  }

  // If manual override results in everything on, show Almighty
  if (isAlmightyConfig(currentSoul, currentTools)) {
    return "almighty";
  }

  return null; // Custom
}

export function KronusModes({
  onApply,
  onApplySkills,
  currentSoul,
  currentTools,
  activeSkillSlugs,
}: KronusModesProps) {
  const [open, setOpen] = useState(false);
  const activeMode = detectCurrentMode(activeSkillSlugs, currentSoul, currentTools);

  const handleSelect = (mode: KronusModeConfig) => {
    // Use skill-based activation (primary path)
    onApplySkills(mode.skillSlugs);
    setOpen(false);
  };

  const activeModeData = KRONUS_MODES.find((m) => m.id === activeMode);
  const ActiveIcon = activeModeData?.icon ?? Zap;
  const activeColor = activeModeData?.color ?? TARTARUS.gold;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 transition-colors"
          style={{ color: activeMode ? activeColor : TARTARUS.gold }}
        >
          <ActiveIcon className="h-4 w-4" />
          <span className="hidden sm:inline">
            {activeModeData?.name ?? "Custom"}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="z-[100] w-[280px] overflow-hidden rounded-xl p-0 shadow-2xl"
        align="start"
        sideOffset={8}
        style={popoverStyles.container}
      >
        <div style={popoverStyles.inner}>
          {/* Header */}
          <div
            className="px-4 py-3"
            style={{ borderBottom: `1px solid ${TARTARUS.borderSubtle}` }}
          >
            <h4 style={headerStyles.title}>Kronus Mode</h4>
            <p style={headerStyles.subtitle}>Quick skill presets</p>
          </div>

          {/* Mode Cards */}
          <div className="space-y-1 p-2">
            {KRONUS_MODES.map((mode) => {
              const Icon = mode.icon;
              const isActive = activeMode === mode.id;

              return (
                <button
                  key={mode.id}
                  onClick={() => handleSelect(mode)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-[background-color,border-color] duration-150",
                    "hover:bg-white/[0.04]"
                  )}
                  style={{
                    backgroundColor: isActive ? `${mode.color}10` : undefined,
                    border: isActive
                      ? `1px solid ${mode.color}40`
                      : "1px solid transparent",
                  }}
                >
                  <div
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      backgroundColor: isActive ? mode.colorGlow : TARTARUS.surface,
                    }}
                  >
                    <Icon
                      className="h-4 w-4"
                      style={{ color: isActive ? mode.color : TARTARUS.textDim }}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      className="block text-[13px] font-medium"
                      style={{ color: isActive ? mode.color : TARTARUS.text }}
                    >
                      {mode.name}
                    </span>
                    <span className="text-[11px]" style={{ color: TARTARUS.textDim }}>
                      {mode.description}
                    </span>
                  </div>
                  {isActive && (
                    <Check
                      className="h-4 w-4 shrink-0"
                      style={{ color: mode.color }}
                    />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer hint */}
          <div
            className="px-4 py-2.5"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <p className="text-[11px]" style={{ color: TARTARUS.textDim }}>
              Sets active skills — dynamic, changes anytime
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
