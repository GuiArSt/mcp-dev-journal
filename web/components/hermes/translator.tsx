"use client";

import * as React from "react";
import { useState, useCallback, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  LanguageSelectorCompact,
  type LanguageCode,
  ALL_LANGUAGES,
} from "./language-selector";
import { ToneSelector, type TranslationTone } from "./tone-selector";
import {
  ArrowRightLeft,
  Loader2,
  Copy,
  Check,
  Brain,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Plus,
  X,
  RefreshCw,
  Trash2,
  Save,
  Sparkles,
  MessageCircleQuestion,
} from "lucide-react";

interface ClarificationQuestion {
  question: string;
  context: string;
  options: string[];
}

interface HermesMemoryEntry {
  content: string;
  sourceLanguage?: string;
  targetLanguage?: string;
  tags: string[];
  createdAt: string;
}

interface HermesMemory {
  protectedTerms: Array<{
    term: string;
    preserveAs?: string;
    sourceLanguage?: string;
  }>;
  memories: HermesMemoryEntry[];
  totalTranslations: number;
  languagePairs: Record<string, number>;
}

interface MemoryStats {
  totalTranslations: number;
  totalCharactersTranslated: number;
  languagePairs: Record<string, number>;
  protectedTerms: number;
  memoryEntries: number;
}

interface ExtractedLearnings {
  mainChanges: string[];
  newPatterns: string[];
  suggestedLabel: string;
  protectedTerms: string[];
}

export function HermesTranslator() {
  // Main flow state
  const [sourceLanguage, setSourceLanguage] = useState<LanguageCode>("en");
  const [targetLanguage, setTargetLanguage] = useState<LanguageCode>("es");
  const [tone, setTone] = useState<TranslationTone>("neutral");
  const [inputText, setInputText] = useState("");
  const [translatedText, setTranslatedText] = useState("");
  const [isTranslating, setIsTranslating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string | null>(null);

  // Clarification questions state
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  // Final version & memory save state
  const [finalVersion, setFinalVersion] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedLearnings, setExtractedLearnings] = useState<ExtractedLearnings | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [selectedTerms, setSelectedTerms] = useState<Set<string>>(new Set());
  const [editedLabel, setEditedLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Memory panel state
  const [memory, setMemory] = useState<HermesMemory | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [newTerm, setNewTerm] = useState("");

  // Direct memory add state
  const [newMemoryInput, setNewMemoryInput] = useState("");
  const [isAddingMemory, setIsAddingMemory] = useState(false);

  const sourceLang = ALL_LANGUAGES.find((l) => l.code === sourceLanguage);
  const targetLang = ALL_LANGUAGES.find((l) => l.code === targetLanguage);

  // Load memory
  const loadMemory = useCallback(async () => {
    setIsLoadingMemory(true);
    try {
      const res = await fetch("/api/hermes/memory");
      if (res.ok) {
        const data = await res.json();
        setMemory(data.memory);
        setStats(data.stats);
      }
    } catch (e) {
      console.error("Failed to load memory:", e);
    } finally {
      setIsLoadingMemory(false);
    }
  }, []);

  // Swap languages
  const handleSwapLanguages = () => {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
    if (translatedText) {
      setInputText(translatedText);
      setTranslatedText("");
      setFinalVersion("");
    }
  };

  // Translate text
  const handleTranslate = async (withAnswers = false) => {
    if (!inputText.trim()) return;

    setIsTranslating(true);
    setError(null);
    setTranslatedText("");
    setClarificationQuestions([]);
    setNotes(null);
    setFinalVersion("");

    try {
      const body: Record<string, unknown> = {
        text: inputText,
        sourceLanguage,
        targetLanguage,
        tone,
      };
      if (withAnswers && Object.keys(answers).length > 0) {
        body.answers = answers;
      }

      const res = await fetch("/api/hermes/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Translation failed");
      }

      const data = await res.json();
      setTranslatedText(data.translatedText);
      setNotes(data.notes || null);
      setClarificationQuestions(data.clarificationQuestions || []);

      if (data.clarificationQuestions?.length > 0) {
        setAnswers({});
        setSelectedOptions({});
      }

      if (showMemory) {
        loadMemory();
      }
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message);
    } finally {
      setIsTranslating(false);
    }
  };

  // Handle option selection for clarification questions
  const selectOption = (question: string, option: string) => {
    setSelectedOptions((prev) => ({ ...prev, [question]: option }));
    setAnswers((prev) => ({ ...prev, [question]: option }));
  };

  // Handle free text answer
  const setFreeTextAnswer = (question: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [question]: text }));
    if (text && selectedOptions[question]) {
      setSelectedOptions((prev) => {
        const next = { ...prev };
        delete next[question];
        return next;
      });
    }
  };

  // Submit answers and re-translate
  const submitAnswers = () => {
    handleTranslate(true);
  };

  // Copy to clipboard
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(translatedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract learnings from final version
  const extractLearnings = async () => {
    if (!finalVersion.trim() || !translatedText.trim()) return;

    setIsExtracting(true);
    setError(null);

    try {
      const res = await fetch("/api/hermes/extract-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiTranslation: translatedText,
          userFinal: finalVersion,
          sourceLanguage,
          targetLanguage,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Extraction failed");
      }

      const data = await res.json();
      setExtractedLearnings(data);
      setSelectedPatterns(new Set(data.newPatterns));
      setSelectedTerms(new Set(data.protectedTerms));
      setEditedLabel(data.suggestedLabel);
      setShowSaveDialog(true);
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Save confirmed learnings
  const saveToMemory = async () => {
    if (!extractedLearnings) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/hermes/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patterns: Array.from(selectedPatterns),
          protectedTerms: Array.from(selectedTerms),
          sourceLanguage,
          targetLanguage,
          label: editedLabel,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save memory");
      }

      setShowSaveDialog(false);
      setExtractedLearnings(null);
      loadMemory();
    } catch (e: unknown) {
      const err = e as Error;
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Add protected term
  const addProtectedTerm = async () => {
    if (!newTerm.trim()) return;
    try {
      const res = await fetch("/api/hermes/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", term: newTerm.trim() }),
      });
      if (res.ok) {
        setNewTerm("");
        loadMemory();
      }
    } catch (e) {
      console.error("Failed to add term:", e);
    }
  };

  // Remove protected term
  const removeProtectedTerm = async (term: string) => {
    try {
      const res = await fetch("/api/hermes/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", term }),
      });
      if (res.ok) {
        loadMemory();
      }
    } catch (e) {
      console.error("Failed to remove term:", e);
    }
  };

  // Add memory directly
  const handleAddMemory = async () => {
    if (!newMemoryInput.trim()) return;

    setIsAddingMemory(true);
    try {
      const res = await fetch("/api/hermes/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patterns: [newMemoryInput.trim()],
          protectedTerms: [],
          sourceLanguage,
          targetLanguage,
          label: "",
        }),
      });

      if (res.ok) {
        setNewMemoryInput("");
        loadMemory();
      }
    } catch (e) {
      console.error("Failed to add memory:", e);
    } finally {
      setIsAddingMemory(false);
    }
  };

  // Reset memory
  const resetMemory = async () => {
    if (!confirm("Reset all learned preferences? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/hermes/memory", { method: "DELETE" });
      if (res.ok) {
        loadMemory();
      }
    } catch (e) {
      console.error("Failed to reset memory:", e);
    }
  };

  // Format language pairs for display
  const topLanguagePairs = useMemo(() => {
    if (!stats?.languagePairs) return [];
    return Object.entries(stats.languagePairs)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);
  }, [stats]);

  return (
    <div className="flex flex-col h-full">
      {/* Main content area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Language and Tone Selection */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--tartarus-ivory-faded)]">From</span>
              <LanguageSelectorCompact
                value={sourceLanguage}
                onChange={setSourceLanguage}
                excludeLanguage={targetLanguage}
              />
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={handleSwapLanguages}
              className="h-9 w-9 text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-[var(--tartarus-ivory-faded)]">To</span>
              <LanguageSelectorCompact
                value={targetLanguage}
                onChange={setTargetLanguage}
                excludeLanguage={sourceLanguage}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-[var(--tartarus-ivory-faded)]">Tone</span>
            <ToneSelector value={tone} onChange={setTone} />
          </div>
        </div>

        {/* Input Text */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
              {sourceLang?.flag} {sourceLang?.name}
            </label>
            <span className="text-xs text-[var(--tartarus-ivory-faded)]">
              {inputText.length.toLocaleString()} characters
            </span>
          </div>
          <Textarea
            placeholder="Enter text to translate..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            className="min-h-[140px] resize-y bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-teal)] focus:ring-[var(--tartarus-teal)]"
          />
          <div className="flex justify-end">
            <Button
              onClick={() => handleTranslate(false)}
              disabled={isTranslating || !inputText.trim()}
              className="bg-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-bright)] text-[var(--tartarus-deep)]"
            >
              {isTranslating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Translating...
                </>
              ) : (
                <>
                  <span className="mr-2">🪶</span>
                  Translate
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="p-4 rounded-lg bg-[var(--tartarus-error)]/10 border border-[var(--tartarus-error)]/30 text-[var(--tartarus-error)]">
            {error}
          </div>
        )}

        {/* Translated Output */}
        {translatedText && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
                {targetLang?.flag} {targetLang?.name}
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={copyToClipboard}
                className="h-7 px-2 text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)] hover:bg-[var(--tartarus-surface)]"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--tartarus-teal)]" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <Textarea
              value={translatedText}
              readOnly
              className="min-h-[140px] resize-y bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
            />
          </div>
        )}

        {/* Translator's Notes */}
        {notes && (
          <div className="p-3 rounded-lg bg-[var(--tartarus-gold)]/10 border border-[var(--tartarus-gold)]/30 text-sm text-[var(--tartarus-gold)]">
            <strong>Translator&apos;s note:</strong> {notes}
          </div>
        )}

        {/* Clarification Questions */}
        {clarificationQuestions.length > 0 && (
          <div className="p-4 rounded-lg bg-[var(--tartarus-teal)]/10 border border-[var(--tartarus-teal)]/30 space-y-4">
            <div className="flex items-center gap-2 text-[var(--tartarus-teal)]">
              <MessageCircleQuestion className="h-5 w-5" />
              <span className="font-medium">Hermes seeks clarity:</span>
            </div>
            {clarificationQuestions.map((q, idx) => (
              <div key={idx} className="space-y-2">
                <p className="text-[var(--tartarus-ivory)]">&ldquo;{q.question}&rdquo;</p>
                <p className="text-xs text-[var(--tartarus-ivory-faded)] italic">
                  {q.context}
                </p>
                <div className="flex flex-wrap gap-2">
                  {q.options.map((option, optIdx) => (
                    <Button
                      key={optIdx}
                      variant="outline"
                      size="sm"
                      onClick={() => selectOption(q.question, option)}
                      className={cn(
                        "border-[var(--tartarus-border)]",
                        selectedOptions[q.question] === option
                          ? "bg-[var(--tartarus-teal)] text-[var(--tartarus-deep)] border-[var(--tartarus-teal)]"
                          : "text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
                      )}
                    >
                      {String.fromCharCode(65 + optIdx)}) {option}
                    </Button>
                  ))}
                </div>
                <Input
                  placeholder="Or type your own answer..."
                  value={selectedOptions[q.question] ? "" : answers[q.question] || ""}
                  onChange={(e) => setFreeTextAnswer(q.question, e.target.value)}
                  className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                />
              </div>
            ))}
            <Button
              onClick={submitAnswers}
              disabled={isTranslating || clarificationQuestions.some((q) => !answers[q.question])}
              className="bg-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-bright)] text-[var(--tartarus-deep)]"
            >
              Submit Answers
            </Button>
          </div>
        )}

        {/* Final Version & Save to Memory */}
        {translatedText && clarificationQuestions.length === 0 && (
          <div className="border-t border-[var(--tartarus-border)] pt-6 space-y-2">
            <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
              Your Final Version{" "}
              <span className="text-[var(--tartarus-ivory-faded)] font-normal">
                (optional - paste to teach Hermes)
              </span>
            </label>
            <Textarea
              placeholder="Paste your edited final version here to help Hermes learn your preferences..."
              value={finalVersion}
              onChange={(e) => setFinalVersion(e.target.value)}
              className="min-h-[100px] resize-y bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-gold)] focus:ring-[var(--tartarus-gold)]"
            />
            <div className="flex justify-end">
              <Button
                onClick={extractLearnings}
                disabled={isExtracting || !finalVersion.trim()}
                variant="outline"
                className="border-[var(--tartarus-gold)]/50 text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold)]/10"
              >
                {isExtracting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Extracting...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save to Memory
                  </>
                )}
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="text-[var(--tartarus-ivory)] flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-[var(--tartarus-gold)]" />
              Extracted Learnings
            </DialogTitle>
          </DialogHeader>
          {extractedLearnings && (
            <div className="flex-1 overflow-y-auto space-y-4 py-2 pr-2">
              {/* Label */}
              <div className="space-y-1">
                <label className="text-xs text-[var(--tartarus-ivory-faded)]">
                  Content Type
                </label>
                <Input
                  value={editedLabel}
                  onChange={(e) => setEditedLabel(e.target.value)}
                  className="bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                />
              </div>

              {/* Main Changes */}
              {extractedLearnings.mainChanges.length > 0 && (
                <details className="group" open>
                  <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--tartarus-ivory-faded)] hover:text-[var(--tartarus-ivory)] transition-colors">
                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                    Changes you made ({extractedLearnings.mainChanges.length})
                  </summary>
                  <ul className="text-sm text-[var(--tartarus-ivory-dim)] space-y-1 mt-2 ml-5">
                    {extractedLearnings.mainChanges.map((change, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="text-[var(--tartarus-teal)]">•</span>
                        {change}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {/* New Patterns */}
              {extractedLearnings.newPatterns.length > 0 && (
                <details className="group" open>
                  <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--tartarus-ivory-faded)] hover:text-[var(--tartarus-ivory)] transition-colors">
                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                    New patterns to remember ({extractedLearnings.newPatterns.length})
                  </summary>
                  <div className="space-y-1.5 mt-2 ml-5">
                    {extractedLearnings.newPatterns.map((pattern) => (
                      <label
                        key={pattern}
                        className="flex items-start gap-2 text-sm text-[var(--tartarus-ivory-dim)] cursor-pointer hover:text-[var(--tartarus-ivory)] transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPatterns.has(pattern)}
                          onChange={(e) => {
                            const newSet = new Set(selectedPatterns);
                            if (e.target.checked) {
                              newSet.add(pattern);
                            } else {
                              newSet.delete(pattern);
                            }
                            setSelectedPatterns(newSet);
                          }}
                          className="accent-[var(--tartarus-teal)] mt-0.5 flex-shrink-0"
                        />
                        <span>{pattern}</span>
                      </label>
                    ))}
                  </div>
                </details>
              )}

              {/* Protected Terms */}
              {extractedLearnings.protectedTerms.length > 0 && (
                <details className="group" open>
                  <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--tartarus-ivory-faded)] hover:text-[var(--tartarus-ivory)] transition-colors">
                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                    Protected terms ({extractedLearnings.protectedTerms.length})
                  </summary>
                  <div className="flex flex-wrap gap-2 mt-2 ml-5">
                    {extractedLearnings.protectedTerms.map((term) => (
                      <label key={term} className="flex items-center gap-1 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedTerms.has(term)}
                          onChange={(e) => {
                            const newSet = new Set(selectedTerms);
                            if (e.target.checked) {
                              newSet.add(term);
                            } else {
                              newSet.delete(term);
                            }
                            setSelectedTerms(newSet);
                          }}
                          className="accent-[var(--tartarus-gold)]"
                        />
                        <Badge
                          variant="outline"
                          className="border-[var(--tartarus-gold)]/30 text-[var(--tartarus-gold)]"
                        >
                          {term}
                        </Badge>
                      </label>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
          <DialogFooter className="flex-shrink-0 border-t border-[var(--tartarus-border)] pt-4 mt-2">
            <Button
              variant="ghost"
              onClick={() => setShowSaveDialog(false)}
              className="text-[var(--tartarus-ivory-dim)]"
            >
              Cancel
            </Button>
            <Button
              onClick={saveToMemory}
              disabled={isSaving}
              className="bg-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-bright)] text-[var(--tartarus-deep)]"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Confirm & Save
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Memory Insights Panel */}
      <div className="border-t border-[var(--tartarus-border)]">
        <button
          onClick={() => {
            setShowMemory(!showMemory);
            if (!showMemory && !memory) {
              loadMemory();
            }
          }}
          className="w-full px-6 py-3 flex items-center justify-between text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)] hover:bg-[var(--tartarus-surface)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="text-sm font-medium">Memory Insights</span>
            {stats && (
              <span className="text-xs text-[var(--tartarus-ivory-faded)]">
                {stats.memoryEntries} memories · {stats.protectedTerms} terms ·{" "}
                {stats.totalTranslations} translations
              </span>
            )}
          </div>
          {showMemory ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </button>

        {showMemory && (
          <div className="px-6 pb-4 space-y-4 bg-[var(--tartarus-deep)]/50">
            {isLoadingMemory ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--tartarus-teal)]" />
              </div>
            ) : memory ? (
              <>
                {/* Stats Row */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-teal)]">
                      {stats?.totalTranslations || 0}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Translations
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-gold)]">
                      {memory.memories.length}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Memories
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-ivory)]">
                      {memory.protectedTerms.length}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Protected Terms
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-lg font-bold text-[var(--tartarus-ivory)]">
                      {topLanguagePairs.length > 0 ? topLanguagePairs[0][0] : "—"}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Top Pair
                    </p>
                  </div>
                </div>

                {/* Add New Memory */}
                <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-teal)]/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Plus className="h-4 w-4 text-[var(--tartarus-teal)]" />
                    <span className="text-sm font-medium text-[var(--tartarus-teal)]">
                      Add new preference
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="e.g., 'Use vosotros form for Spanish'"
                      value={newMemoryInput}
                      onChange={(e) => setNewMemoryInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !isAddingMemory && handleAddMemory()}
                      className="text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                    <Button
                      size="sm"
                      onClick={handleAddMemory}
                      disabled={isAddingMemory || !newMemoryInput.trim()}
                      className="bg-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-bright)] text-[var(--tartarus-deep)]"
                    >
                      {isAddingMemory ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Plus className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                {/* Memories List */}
                {memory.memories.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                      Learned Preferences ({memory.memories.length})
                    </h4>
                    <div className="space-y-2 max-h-48 overflow-auto">
                      {memory.memories.slice().reverse().map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)] group"
                        >
                          <p className="text-sm text-[var(--tartarus-ivory-dim)]">
                            {m.content}
                          </p>
                          {(m.sourceLanguage || m.targetLanguage) && (
                            <span className="text-[10px] text-[var(--tartarus-teal)]">
                              {m.sourceLanguage}→{m.targetLanguage}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Protected Terms */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                    Protected Terms (don&apos;t translate)
                  </h4>
                  <div className="flex flex-wrap gap-2 max-h-32 overflow-auto">
                    {memory.protectedTerms.map((item) => (
                      <Badge
                        key={item.term}
                        variant="outline"
                        className="text-xs border-[var(--tartarus-gold)]/30 text-[var(--tartarus-gold)] bg-[var(--tartarus-gold)]/10 group"
                      >
                        {item.term}
                        {item.preserveAs && <span className="text-[var(--tartarus-ivory-faded)]"> → {item.preserveAs}</span>}
                        <button
                          onClick={() => removeProtectedTerm(item.term)}
                          className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Add term..."
                      value={newTerm}
                      onChange={(e) => setNewTerm(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addProtectedTerm()}
                      className="h-8 text-sm bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addProtectedTerm}
                      className="h-8 border-[var(--tartarus-border)] text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={loadMemory}
                    className="text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={resetMemory}
                    className="text-[var(--tartarus-error)] hover:text-[var(--tartarus-error)] hover:bg-[var(--tartarus-error)]/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Memory
                  </Button>
                </div>
              </>
            ) : (
              <p className="text-sm text-[var(--tartarus-ivory-faded)] py-4">
                No memory data available yet. Start translating to build your preferences.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
