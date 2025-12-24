"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Crown, Scale, MessageCircle } from "lucide-react";

export type TranslationTone = "formal" | "neutral" | "slang";

const TONES = [
  {
    value: "formal" as const,
    label: "Formal",
    description: "Professional, polished, suitable for business",
    icon: Crown,
  },
  {
    value: "neutral" as const,
    label: "Neutral",
    description: "Natural and conversational",
    icon: Scale,
  },
  {
    value: "slang" as const,
    label: "Casual",
    description: "Informal, friendly, colloquial",
    icon: MessageCircle,
  },
] as const;

interface ToneSelectorProps {
  value: TranslationTone;
  onChange: (value: TranslationTone) => void;
  className?: string;
}

export function ToneSelector({ value, onChange, className }: ToneSelectorProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className={cn("flex gap-1", className)}>
        {TONES.map((tone) => {
          const Icon = tone.icon;
          const isSelected = value === tone.value;

          return (
            <Tooltip key={tone.value}>
              <TooltipTrigger asChild>
                <Button
                  variant={isSelected ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "gap-1.5",
                    isSelected && "ring-2 ring-primary ring-offset-2"
                  )}
                  onClick={() => onChange(tone.value)}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tone.label}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom">
                <p>{tone.description}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
}

export { TONES };
