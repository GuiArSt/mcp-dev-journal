"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Cpu, Check, Brain, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TARTARUS,
  popoverStyles,
  headerStyles,
  sectionStyles,
} from "./config-styles";

// Model selection type - matches route.ts ModelSelection
export type ModelSelection =
  | "gemini-3-flash"
  | "gemini-3-pro"
  | "claude-opus-4.5"
  | "claude-haiku-4.5"
  | "gpt-5.2";

// ModelConfigState - controls which model is used
export interface ModelConfigState {
  model: ModelSelection;
}

interface ModelConfigProps {
  config: ModelConfigState;
  onChange: (config: ModelConfigState) => void;
}

const DEFAULT_CONFIG: ModelConfigState = {
  model: "gemini-3-flash", // Default
};

// Model metadata with provider grouping
const MODELS: Record<ModelSelection, {
  name: string;
  shortName: string;
  description: string;
  context: string;
  color: string;
  hasThinking: boolean;
  provider: string;
}> = {
  "gemini-3-flash": {
    name: "Gemini 3 Flash",
    shortName: "Gemini 3 Flash",
    description: "Fast with thinking",
    context: "1M",
    color: TARTARUS.google,
    hasThinking: true,
    provider: "Google",
  },
  "gemini-3-pro": {
    name: "Gemini 3 Pro",
    shortName: "Gemini 3 Pro",
    description: "Most capable reasoning",
    context: "1M",
    color: TARTARUS.google,
    hasThinking: true,
    provider: "Google",
  },
  "claude-opus-4.5": {
    name: "Claude Opus 4.5",
    shortName: "Opus 4.5",
    description: "Most capable",
    context: "200K",
    color: TARTARUS.anthropic,
    hasThinking: true,
    provider: "Anthropic",
  },
  "claude-haiku-4.5": {
    name: "Claude Haiku 4.5",
    shortName: "Haiku 4.5",
    description: "Fastest response",
    context: "200K",
    color: TARTARUS.anthropic,
    hasThinking: false,
    provider: "Anthropic",
  },
  "gpt-5.2": {
    name: "GPT-5.2",
    shortName: "GPT-5.2",
    description: "Reasoning model",
    context: "400K",
    color: TARTARUS.openai,
    hasThinking: true,
    provider: "OpenAI",
  },
};

export function ModelConfig({ config, onChange }: ModelConfigProps) {
  const [open, setOpen] = useState(false);

  const selectModel = (model: ModelSelection) => {
    onChange({ model });
    setOpen(false);
  };

  const currentModel = MODELS[config.model];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 transition-colors"
          style={{ color: currentModel.color }}
        >
          <Cpu className="h-4 w-4" />
          <span className="hidden sm:inline">{currentModel.shortName}</span>
          {currentModel.hasThinking && (
            <Brain className="h-3 w-3 opacity-60" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] z-[100] shadow-2xl rounded-xl p-0 overflow-hidden"
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
            <h4 style={headerStyles.title}>AI Model</h4>
            <p style={headerStyles.subtitle}>Select model for Kronus</p>
          </div>

          {/* Model List */}
          <div className="px-4 py-3 space-y-1.5">
            {(Object.keys(MODELS) as ModelSelection[]).map((key) => {
              const model = MODELS[key];
              const isSelected = config.model === key;

              return (
                <button
                  key={key}
                  onClick={() => selectModel(key)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all",
                    "hover:bg-white/[0.03]"
                  )}
                  style={{
                    backgroundColor: isSelected ? `${model.color}10` : "transparent",
                    border: isSelected ? `1px solid ${model.color}30` : "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {/* Provider Icon */}
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${model.color}15` }}
                  >
                    <Cpu className="h-4 w-4" style={{ color: model.color }} />
                  </div>

                  {/* Model Info */}
                  <div className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: isSelected ? model.color : TARTARUS.text }}
                      >
                        {model.name}
                      </span>
                      {model.hasThinking ? (
                        <span title="Thinking/Reasoning">
                          <Brain
                            className="h-3.5 w-3.5"
                            style={{ color: TARTARUS.purple }}
                          />
                        </span>
                      ) : (
                        <span title="Optimized for speed">
                          <Zap
                            className="h-3.5 w-3.5"
                            style={{ color: TARTARUS.teal }}
                          />
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px]" style={{ color: TARTARUS.textMuted }}>
                        {model.description}
                      </span>
                      <span
                        className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          color: TARTARUS.textDim,
                          backgroundColor: TARTARUS.surface,
                        }}
                      >
                        {model.context}
                      </span>
                    </div>
                  </div>

                  {/* Selection Check */}
                  {isSelected && (
                    <Check className="h-4 w-4 flex-shrink-0" style={{ color: model.color }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer Legend */}
          <div
            className="px-4 py-3 flex items-center gap-4"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: TARTARUS.textMuted }}>
              <Brain className="h-3 w-3" style={{ color: TARTARUS.purple }} />
              Thinking
            </span>
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: TARTARUS.textMuted }}>
              <Zap className="h-3 w-3" style={{ color: TARTARUS.teal }} />
              Fast
            </span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DEFAULT_CONFIG };
