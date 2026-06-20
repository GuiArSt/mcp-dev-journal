"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Cpu, Check, Brain, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { TARTARUS, popoverStyles, headerStyles } from "./config-styles";
import {
  CHAT_MODEL_CATALOG,
  DEFAULT_CHAT_MODEL,
  normalizeChatModelKey,
  type ChatModelKey,
} from "@/lib/ai/model-catalog";

export { MODEL_CONTEXT_LIMITS } from "@/lib/ai/model-catalog";

export type ModelSelection = ChatModelKey;

// ModelConfigState - controls which model is used
export interface ModelConfigState {
  model: ModelSelection;
  reasoningEnabled: boolean; // Toggle for reasoning/thinking budget
}

interface ModelConfigProps {
  config: ModelConfigState;
  onChange: (config: ModelConfigState) => void;
}

const DEFAULT_CONFIG: ModelConfigState = {
  model: DEFAULT_CHAT_MODEL,
  reasoningEnabled: true, // Reasoning on by default
};

// Model metadata with provider grouping
const providerColor = {
  google: TARTARUS.google,
  anthropic: TARTARUS.anthropic,
  openai: TARTARUS.openai,
  deepseek: TARTARUS.teal,
  nebius: TARTARUS.purple,
} as const;

const MODELS = Object.fromEntries(
  CHAT_MODEL_CATALOG.map((model) => [
    model.key,
    {
      name: model.label,
      shortName: model.shortLabel,
      description: model.description,
      context: model.contextWindow >= 1_000_000 ? "1M" : `${Math.round(model.contextWindow / 1000)}K`,
      color: providerColor[model.provider],
      hasThinking: model.hasThinking,
      provider: model.providerLabel,
    },
  ]),
) as Record<
  ModelSelection,
  {
    name: string;
    shortName: string;
    description: string;
    context: string;
    color: string;
    hasThinking: boolean;
    provider: string;
  }
>;

export function ModelConfig({ config, onChange }: ModelConfigProps) {
  const [open, setOpen] = useState(false);
  const activeModelKey = normalizeChatModelKey(config.model);
  const resolvedConfig =
    activeModelKey === config.model ? config : { ...config, model: activeModelKey };

  useEffect(() => {
    if (activeModelKey !== config.model) onChange(resolvedConfig);
  }, [activeModelKey, config.model, onChange, resolvedConfig]);

  const selectModel = (model: ModelSelection) => {
    onChange({ ...config, model });
    setOpen(false);
  };

  const toggleReasoning = () => {
    onChange({ ...config, reasoningEnabled: !config.reasoningEnabled });
  };

  const currentModel = MODELS[resolvedConfig.model];
  const supportsReasoning = currentModel.hasThinking;

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
          {supportsReasoning && config.reasoningEnabled && (
            <Brain className="h-3 w-3" style={{ color: TARTARUS.purple }} />
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
          <div className="px-4 py-3" style={{ borderBottom: `1px solid ${TARTARUS.borderSubtle}` }}>
            <h4 style={headerStyles.title}>AI Model</h4>
            <p style={headerStyles.subtitle}>Select model for Kronus</p>
          </div>

          {/* Model List */}
          <div className="space-y-1.5 px-4 py-3">
            {(Object.keys(MODELS) as ModelSelection[]).map((key) => {
              const model = MODELS[key];
              const isSelected = resolvedConfig.model === key;

              return (
                <button
                  key={key}
                  onClick={() => selectModel(key)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-[background-color,border-color] duration-150",
                    "hover:bg-white/[0.05]"
                  )}
                  style={{
                    backgroundColor: isSelected ? `${model.color}10` : "transparent",
                    border: isSelected ? `1px solid ${model.color}30` : "1px solid transparent",
                    cursor: "pointer",
                  }}
                >
                  {/* Provider Icon */}
                  <div
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: `${model.color}15` }}
                  >
                    <Cpu className="h-4 w-4" style={{ color: model.color }} />
                  </div>

                  {/* Model Info */}
                  <div className="min-w-0 flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-[13px] font-medium"
                        style={{ color: isSelected ? model.color : TARTARUS.text }}
                      >
                        {model.name}
                      </span>
                      {model.hasThinking ? (
                        <span title="Thinking/Reasoning">
                          <Brain className="h-3.5 w-3.5" style={{ color: TARTARUS.purple }} />
                        </span>
                      ) : (
                        <span title="Optimized for speed">
                          <Zap className="h-3.5 w-3.5" style={{ color: TARTARUS.teal }} />
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[11px]" style={{ color: TARTARUS.textMuted }}>
                        {model.description}
                      </span>
                      <span
                        className="rounded px-1.5 py-0.5 font-mono text-[10px]"
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

          {/* Reasoning Toggle */}
          {supportsReasoning && (
            <div className="px-4 py-3" style={{ borderTop: `1px solid ${TARTARUS.borderSubtle}` }}>
              <div
                className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-white/[0.05]"
                onClick={toggleReasoning}
              >
                <Switch
                  checked={resolvedConfig.reasoningEnabled}
                  onCheckedChange={toggleReasoning}
                  className="data-[state=checked]:bg-[var(--tartarus-purple)] data-[state=unchecked]:bg-[var(--tartarus-surface)]"
                  onClick={(e) => e.stopPropagation()}
                />
                <Brain
                  className="h-4 w-4 transition-colors"
                  style={{ color: config.reasoningEnabled ? TARTARUS.purple : TARTARUS.textDim }}
                />
                <div className="flex-1">
                  <span
                    className="text-[13px] font-medium transition-colors"
                    style={{ color: config.reasoningEnabled ? TARTARUS.text : TARTARUS.textMuted }}
                  >
                    Reasoning
                  </span>
                  <p className="text-[11px]" style={{ color: TARTARUS.textDim }}>
                    Enable thinking budget for complex tasks
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer Legend */}
          <div
            className="flex items-center gap-4 px-4 py-3"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: TARTARUS.textMuted }}
            >
              <Brain className="h-3 w-3" style={{ color: TARTARUS.purple }} />
              Thinking
            </span>
            <span
              className="flex items-center gap-1.5 text-[11px]"
              style={{ color: TARTARUS.textMuted }}
            >
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
