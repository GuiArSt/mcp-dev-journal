"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Explicit colors for the Soul config popover (avoids CSS variable issues)
// Using the Tartarus palette colors for consistency
const COLORS = {
  bg: "#0a0a0f",
  border: "#2a2a3a",
  text: "#e8e6e3",
  muted: "#888",
  teal: "#00CED1",        // tartarus-teal - beautiful blue
  tealDim: "#008B8B",     // tartarus-teal-dim - for off state
  gold: "#D4AF37",        // tartarus-gold
  red: "#E74C3C",         // tartarus-error
  switchOff: "#1a1a1a",   // tartarus-surface
};

// Model context limits
const MODEL_CONTEXT_LIMIT = 200000; // Opus 4 has 200K context
const CONTEXT_WARNING_THRESHOLD = 0.5; // Warn at 50% (100K tokens)

export interface SoulConfigState {
  writings: boolean;
  portfolioProjects: boolean;
  skills: boolean;
  workExperience: boolean;
  education: boolean;
}

interface SectionStats {
  writings: number;
  portfolioProjects: number;
  skills: number;
  workExperience: number;
  education: number;
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
};

// Estimated tokens per section (rough estimates based on current data)
const SECTION_TOKEN_ESTIMATES = {
  writings: 50000,      // 35 writings, ~1400 tokens each avg
  portfolioProjects: 3000, // 13 projects, ~230 tokens each
  skills: 2000,         // 45 skills, ~45 tokens each
  workExperience: 1500, // 8 jobs, ~190 tokens each
  education: 500,       // 3 entries, ~170 tokens each
  base: 6000,           // Soul.xml + tool definitions
};

export function SoulConfig({ config, onChange }: SoulConfigProps) {
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<SectionStats | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch actual stats when popover opens
  useEffect(() => {
    if (open && !stats) {
      setLoading(true);
      fetch("/api/kronus/stats")
        .then((res) => res.json())
        .then((data) => {
          setStats(data);
          setLoading(false);
        })
        .catch(() => {
          // Use estimates if API fails
          setStats({
            writings: 35,
            portfolioProjects: 13,
            skills: 45,
            workExperience: 8,
            education: 3,
            totalTokens: 64000,
          });
          setLoading(false);
        });
    }
  }, [open, stats]);

  // Calculate estimated tokens based on current config
  const estimatedTokens =
    SECTION_TOKEN_ESTIMATES.base +
    (config.writings ? SECTION_TOKEN_ESTIMATES.writings : 0) +
    (config.portfolioProjects ? SECTION_TOKEN_ESTIMATES.portfolioProjects : 0) +
    (config.skills ? SECTION_TOKEN_ESTIMATES.skills : 0) +
    (config.workExperience ? SECTION_TOKEN_ESTIMATES.workExperience : 0) +
    (config.education ? SECTION_TOKEN_ESTIMATES.education : 0);

  const toggleSection = (section: keyof SoulConfigState) => {
    onChange({ ...config, [section]: !config[section] });
  };

  const selectAll = () => {
    onChange({
      writings: true,
      portfolioProjects: true,
      skills: true,
      workExperience: true,
      education: true,
    });
  };

  const selectNone = () => {
    onChange({
      writings: false,
      portfolioProjects: false,
      skills: false,
      workExperience: false,
      education: false,
    });
  };

  const enabledCount = Object.values(config).filter(Boolean).length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1",
            enabledCount < 5 && "text-[var(--kronus-gold)]"
          )}
        >
          <Settings2 className="h-4 w-4" />
          Soul
          {enabledCount < 5 && (
            <span className="text-xs bg-[var(--kronus-gold)]/20 px-1.5 py-0.5 rounded">
              {enabledCount}/5
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 z-[100] shadow-2xl rounded-lg"
        align="start"
        sideOffset={8}
        style={{
          backgroundColor: "#0a0a0f",
          border: "1px solid #2a2a3a",
          color: "#e8e6e3"
        }}
      >
        <div className="space-y-4 p-1" style={{ backgroundColor: "#0a0a0f" }}>
          <div className="flex items-center justify-between">
            <h4 style={{ fontWeight: 600, color: "#e8e6e3", fontSize: "14px" }}>Soul Repository</h4>
            <div className="flex gap-1">
              <button
                onClick={selectAll}
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  color: "#888",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                All
              </button>
              <button
                onClick={selectNone}
                style={{
                  fontSize: "12px",
                  padding: "2px 8px",
                  color: "#888",
                  background: "transparent",
                  border: "none",
                  cursor: "pointer"
                }}
              >
                None
              </button>
            </div>
          </div>

          <p style={{ fontSize: "12px", color: "#888" }}>
            Changes apply to your next new chat.
          </p>

          <div className="space-y-3">
            {/* Writings */}
            <div className="flex items-center gap-3 group">
              <Switch
                checked={config.writings}
                onCheckedChange={() => toggleSection("writings")}
                style={{ backgroundColor: config.writings ? COLORS.teal : COLORS.switchOff }}
              />
              <div className="flex-1">
                <span style={{ color: config.writings ? COLORS.teal : COLORS.muted, fontSize: "14px", transition: "color 0.2s" }}>
                  Writings
                </span>
                <span style={{ color: COLORS.muted, fontSize: "12px", marginLeft: "8px" }}>
                  {loading ? "..." : stats?.writings || 35}
                </span>
              </div>
              <span style={{ color: COLORS.muted, fontSize: "12px" }}>~50k</span>
            </div>

            {/* Portfolio Projects */}
            <div className="flex items-center gap-3 group">
              <Switch
                checked={config.portfolioProjects}
                onCheckedChange={() => toggleSection("portfolioProjects")}
                style={{ backgroundColor: config.portfolioProjects ? COLORS.teal : COLORS.switchOff }}
              />
              <div className="flex-1">
                <span style={{ color: config.portfolioProjects ? COLORS.teal : COLORS.muted, fontSize: "14px", transition: "color 0.2s" }}>
                  Portfolio Projects
                </span>
                <span style={{ color: COLORS.muted, fontSize: "12px", marginLeft: "8px" }}>
                  {loading ? "..." : stats?.portfolioProjects || 13}
                </span>
              </div>
              <span style={{ color: COLORS.muted, fontSize: "12px" }}>~3k</span>
            </div>

            {/* Skills */}
            <div className="flex items-center gap-3 group">
              <Switch
                checked={config.skills}
                onCheckedChange={() => toggleSection("skills")}
                style={{ backgroundColor: config.skills ? COLORS.teal : COLORS.switchOff }}
              />
              <div className="flex-1">
                <span style={{ color: config.skills ? COLORS.teal : COLORS.muted, fontSize: "14px", transition: "color 0.2s" }}>
                  Skills
                </span>
                <span style={{ color: COLORS.muted, fontSize: "12px", marginLeft: "8px" }}>
                  {loading ? "..." : stats?.skills || 45}
                </span>
              </div>
              <span style={{ color: COLORS.muted, fontSize: "12px" }}>~2k</span>
            </div>

            {/* Work Experience */}
            <div className="flex items-center gap-3 group">
              <Switch
                checked={config.workExperience}
                onCheckedChange={() => toggleSection("workExperience")}
                style={{ backgroundColor: config.workExperience ? COLORS.teal : COLORS.switchOff }}
              />
              <div className="flex-1">
                <span style={{ color: config.workExperience ? COLORS.teal : COLORS.muted, fontSize: "14px", transition: "color 0.2s" }}>
                  Work Experience
                </span>
                <span style={{ color: COLORS.muted, fontSize: "12px", marginLeft: "8px" }}>
                  {loading ? "..." : stats?.workExperience || 8}
                </span>
              </div>
              <span style={{ color: COLORS.muted, fontSize: "12px" }}>~1.5k</span>
            </div>

            {/* Education */}
            <div className="flex items-center gap-3 group">
              <Switch
                checked={config.education}
                onCheckedChange={() => toggleSection("education")}
                style={{ backgroundColor: config.education ? COLORS.teal : COLORS.switchOff }}
              />
              <div className="flex-1">
                <span style={{ color: config.education ? COLORS.teal : COLORS.muted, fontSize: "14px", transition: "color 0.2s" }}>
                  Education
                </span>
                <span style={{ color: COLORS.muted, fontSize: "12px", marginLeft: "8px" }}>
                  {loading ? "..." : stats?.education || 3}
                </span>
              </div>
              <span style={{ color: COLORS.muted, fontSize: "12px" }}>~0.5k</span>
            </div>
          </div>

          {/* Token estimate */}
          <div style={{ paddingTop: "12px", borderTop: `1px solid ${COLORS.border}` }}>
            <div className="flex items-center justify-between" style={{ fontSize: "14px" }}>
              <span style={{ color: COLORS.muted }}>Estimated tokens:</span>
              <span style={{
                fontFamily: "monospace",
                color: estimatedTokens > MODEL_CONTEXT_LIMIT * CONTEXT_WARNING_THRESHOLD
                  ? COLORS.gold
                  : COLORS.teal
              }}>
                ~{Math.round(estimatedTokens / 1000)}k / {MODEL_CONTEXT_LIMIT / 1000}k
              </span>
            </div>
            {estimatedTokens > MODEL_CONTEXT_LIMIT * CONTEXT_WARNING_THRESHOLD && (
              <p style={{
                fontSize: "12px",
                color: COLORS.gold,
                marginTop: "8px",
                padding: "8px",
                backgroundColor: "rgba(212, 175, 55, 0.1)",
                borderRadius: "6px",
                borderLeft: `3px solid ${COLORS.gold}`
              }}>
                💡 Using &gt;50% of context. Less context often means better focus and responses.
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DEFAULT_CONFIG };
