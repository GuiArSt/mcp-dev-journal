"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Main European languages with flag emojis
const PRIMARY_LANGUAGES = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
] as const;

// Other supported languages
const OTHER_LANGUAGES = [
  { code: "nl", name: "Dutch", flag: "🇳🇱" },
  { code: "pl", name: "Polish", flag: "🇵🇱" },
  { code: "sv", name: "Swedish", flag: "🇸🇪" },
  { code: "da", name: "Danish", flag: "🇩🇰" },
  { code: "no", name: "Norwegian", flag: "🇳🇴" },
  { code: "fi", name: "Finnish", flag: "🇫🇮" },
  { code: "cs", name: "Czech", flag: "🇨🇿" },
  { code: "el", name: "Greek", flag: "🇬🇷" },
  { code: "hu", name: "Hungarian", flag: "🇭🇺" },
  { code: "ro", name: "Romanian", flag: "🇷🇴" },
  { code: "uk", name: "Ukrainian", flag: "🇺🇦" },
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "he", name: "Hebrew", flag: "🇮🇱" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "th", name: "Thai", flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", flag: "🇻🇳" },
  { code: "id", name: "Indonesian", flag: "🇮🇩" },
  { code: "ms", name: "Malay", flag: "🇲🇾" },
  { code: "ca", name: "Catalan", flag: "🏴" },
] as const;

const ALL_LANGUAGES = [...PRIMARY_LANGUAGES, ...OTHER_LANGUAGES];

export type LanguageCode = (typeof ALL_LANGUAGES)[number]["code"];

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  label?: string;
  excludeLanguage?: LanguageCode; // To exclude source language from target selection
  className?: string;
}

export function LanguageSelector({
  value,
  onChange,
  label,
  excludeLanguage,
  className,
}: LanguageSelectorProps) {
  const selectedLanguage = ALL_LANGUAGES.find((l) => l.code === value);
  const isPrimarySelected = PRIMARY_LANGUAGES.some((l) => l.code === value);

  // Filter out excluded language
  const filteredPrimary = PRIMARY_LANGUAGES.filter(
    (l) => l.code !== excludeLanguage
  );
  const filteredOther = OTHER_LANGUAGES.filter(
    (l) => l.code !== excludeLanguage
  );

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {label && (
        <span className="text-sm font-medium text-muted-foreground">
          {label}
        </span>
      )}

      <div className="flex items-center gap-1">
        {/* Primary language flag buttons */}
        <TooltipProvider delayDuration={300}>
          <div className="flex gap-1">
            {filteredPrimary.map((lang) => (
              <Tooltip key={lang.code}>
                <TooltipTrigger asChild>
                  <Button
                    variant={value === lang.code ? "default" : "outline"}
                    size="icon"
                    className={cn(
                      "h-9 w-9 text-lg",
                      value === lang.code && "ring-2 ring-primary ring-offset-2"
                    )}
                    onClick={() => onChange(lang.code)}
                  >
                    {lang.flag}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <p>{lang.name}</p>
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        </TooltipProvider>

        {/* Dropdown for other languages */}
        <Select
          value={!isPrimarySelected ? value : ""}
          onValueChange={(v) => onChange(v as LanguageCode)}
        >
          <SelectTrigger
            className={cn(
              "w-[140px]",
              !isPrimarySelected && "ring-2 ring-primary ring-offset-2"
            )}
          >
            <SelectValue
              placeholder={
                <span className="flex items-center gap-2 text-muted-foreground">
                  <span>🌍</span>
                  <span>More...</span>
                </span>
              }
            >
              {!isPrimarySelected && selectedLanguage && (
                <span className="flex items-center gap-2">
                  <span>{selectedLanguage.flag}</span>
                  <span>{selectedLanguage.name}</span>
                </span>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Other Languages</SelectLabel>
              {filteredOther.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  <span className="flex items-center gap-2">
                    <span>{lang.flag}</span>
                    <span>{lang.name}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

// Compact version for inline use
interface LanguageSelectorCompactProps {
  value: LanguageCode;
  onChange: (value: LanguageCode) => void;
  excludeLanguage?: LanguageCode;
}

export function LanguageSelectorCompact({
  value,
  onChange,
  excludeLanguage,
}: LanguageSelectorCompactProps) {
  const filteredLanguages = ALL_LANGUAGES.filter(
    (l) => l.code !== excludeLanguage
  );
  const selectedLanguage = ALL_LANGUAGES.find((l) => l.code === value);

  return (
    <Select value={value} onValueChange={(v) => onChange(v as LanguageCode)}>
      <SelectTrigger className="w-[160px]">
        <SelectValue>
          {selectedLanguage && (
            <span className="flex items-center gap-2">
              <span>{selectedLanguage.flag}</span>
              <span>{selectedLanguage.name}</span>
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>Primary</SelectLabel>
          {PRIMARY_LANGUAGES.filter((l) => l.code !== excludeLanguage).map(
            (lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </span>
              </SelectItem>
            )
          )}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>Other</SelectLabel>
          {OTHER_LANGUAGES.filter((l) => l.code !== excludeLanguage).map(
            (lang) => (
              <SelectItem key={lang.code} value={lang.code}>
                <span className="flex items-center gap-2">
                  <span>{lang.flag}</span>
                  <span>{lang.name}</span>
                </span>
              </SelectItem>
            )
          )}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

// Export language data for use elsewhere
export { PRIMARY_LANGUAGES, OTHER_LANGUAGES, ALL_LANGUAGES };
