"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Type, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  TARTARUS,
  popoverStyles,
  headerStyles,
  sectionStyles,
} from "./config-styles";

// Font options for Kronus chat - mystical/oracle aesthetic
// Uses CSS variables from Next.js font loader (defined in layout.tsx)
export const KRONUS_FONTS = {
  inter: { name: "Inter", family: "var(--font-geist-sans), Inter, system-ui, sans-serif", style: "Modern Clean" },
  crimson: { name: "Crimson Pro", family: "var(--font-crimson-pro), 'Crimson Pro', Georgia, serif", style: "Classic Serif" },
  cormorant: { name: "Cormorant", family: "var(--font-cormorant), 'Cormorant Garamond', Georgia, serif", style: "Elegant Oracle" },
  cinzel: { name: "Cinzel", family: "var(--font-cinzel), 'Cinzel', Georgia, serif", style: "Ancient Roman" },
  ibmPlex: { name: "IBM Plex", family: "var(--font-ibm-plex), 'IBM Plex Sans', system-ui, sans-serif", style: "Tech Minimal" },
  sourceSerif: { name: "Source Serif", family: "var(--font-source-serif), 'Source Serif 4', Georgia, serif", style: "Readable Serif" },
  playfair: { name: "Playfair", family: "var(--font-playfair), 'Playfair Display', Georgia, serif", style: "Editorial Luxe" },
  spectral: { name: "Spectral", family: "var(--font-spectral), 'Spectral', Georgia, serif", style: "Literary Voice" },
} as const;

// Font size options
export const KRONUS_FONT_SIZES = {
  xs: { name: "XS", size: "12px", label: "Compact" },
  sm: { name: "SM", size: "13px", label: "Small" },
  base: { name: "M", size: "14px", label: "Default" },
  lg: { name: "LG", size: "15px", label: "Large" },
  xl: { name: "XL", size: "16px", label: "Spacious" },
} as const;

export type KronusFontSizeKey = keyof typeof KRONUS_FONT_SIZES;
export type KronusFontKey = keyof typeof KRONUS_FONTS;

export interface FormatConfigState {
  font: KronusFontKey;
  fontSize: KronusFontSizeKey;
}

interface FormatConfigProps {
  config: FormatConfigState;
  onChange: (config: FormatConfigState) => void;
}

const DEFAULT_FORMAT_CONFIG: FormatConfigState = {
  font: "inter",
  fontSize: "base",
};

export function FormatConfig({ config, onChange }: FormatConfigProps) {
  const [open, setOpen] = useState(false);

  const setFont = (font: KronusFontKey) => {
    onChange({ ...config, font });
  };

  const setFontSize = (fontSize: KronusFontSizeKey) => {
    onChange({ ...config, fontSize });
  };

  const currentFont = KRONUS_FONTS[config.font || "inter"];
  const currentSize = KRONUS_FONT_SIZES[config.fontSize || "base"];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 transition-colors"
          style={{ color: TARTARUS.textMuted }}
        >
          <Type className="h-4 w-4" />
          <span className="hidden sm:inline">Format</span>
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
              <h4 style={headerStyles.title}>Typography</h4>
              <p style={headerStyles.subtitle}>Customize chat appearance</p>
            </div>
            <span
              className="text-[11px] px-2 py-1 rounded"
              style={{
                color: TARTARUS.textMuted,
                backgroundColor: TARTARUS.surface,
              }}
            >
              {currentFont.style}
            </span>
          </div>

          {/* Content */}
          <div className="px-4 py-3 space-y-4">
            {/* Font Family Section */}
            <div>
              <div style={sectionStyles.label}>Font Family</div>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(KRONUS_FONTS) as KronusFontKey[]).map((fontKey) => {
                  const font = KRONUS_FONTS[fontKey];
                  const isSelected = (config.font || "inter") === fontKey;

                  return (
                    <button
                      key={fontKey}
                      onClick={() => setFont(fontKey)}
                      className="text-left px-3 py-2.5 rounded-lg transition-all hover:bg-white/[0.03]"
                      style={{
                        border: isSelected
                          ? `1px solid ${TARTARUS.teal}40`
                          : `1px solid ${TARTARUS.border}`,
                        backgroundColor: isSelected ? TARTARUS.tealGlow : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        className="block text-[13px] font-medium"
                        style={{
                          fontFamily: font.family,
                          color: isSelected ? TARTARUS.teal : TARTARUS.text,
                        }}
                      >
                        {font.name}
                      </span>
                      <span
                        className="block text-[10px] mt-0.5"
                        style={{ color: TARTARUS.textDim }}
                      >
                        {font.style}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Font Size Section */}
            <div style={sectionStyles.divider}>
              <div className="flex items-center justify-between mb-2">
                <span style={sectionStyles.label} className="mb-0">Font Size</span>
                <span className="text-[11px]" style={{ color: TARTARUS.textMuted }}>
                  {currentSize.label}
                </span>
              </div>
              <div className="flex gap-1.5">
                {(Object.keys(KRONUS_FONT_SIZES) as KronusFontSizeKey[]).map((sizeKey) => {
                  const sizeOption = KRONUS_FONT_SIZES[sizeKey];
                  const isSelected = (config.fontSize || "base") === sizeKey;

                  return (
                    <button
                      key={sizeKey}
                      onClick={() => setFontSize(sizeKey)}
                      className="flex-1 py-2 rounded-lg transition-all hover:bg-white/[0.03]"
                      style={{
                        border: isSelected
                          ? `1px solid ${TARTARUS.teal}40`
                          : `1px solid ${TARTARUS.border}`,
                        backgroundColor: isSelected ? TARTARUS.tealGlow : "transparent",
                        cursor: "pointer",
                      }}
                    >
                      <span
                        className="font-mono font-medium"
                        style={{
                          fontSize: sizeOption.size,
                          color: isSelected ? TARTARUS.teal : TARTARUS.text,
                        }}
                      >
                        {sizeOption.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div
            className="px-4 py-3"
            style={{
              borderTop: `1px solid ${TARTARUS.borderSubtle}`,
              backgroundColor: TARTARUS.surface,
            }}
          >
            <p className="text-[11px]" style={{ color: TARTARUS.textDim }}>
              Changes apply immediately to the chat interface.
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DEFAULT_FORMAT_CONFIG };
