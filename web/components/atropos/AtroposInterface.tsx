"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
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
  Zap,
  Copy,
  Check,
  Loader2,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Brain,
  Trash2,
  Plus,
  X,
  RefreshCw,
  Save,
  MessageCircleQuestion,
  Sparkles,
  GitCompare,
  FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { computeSmartDiff, getDiffSummary, type DiffResult } from "@/lib/diff";

interface IntentQuestion {
  question: string;
  context: string;
  options: string[];
}

interface AtroposMemoryEntry {
  content: string;
  tags: string[];
  createdAt: string;
}

interface AtroposMemory {
  customDictionary: string[];
  memories: AtroposMemoryEntry[];
  totalChecks: number;
  totalCorrections: number;
}

interface MemoryStats {
  totalChecks: number;
  totalCorrections: number;
  dictionaryWords: number;
  memoryEntries: number;
}

interface ExtractedLearnings {
  mainChanges: string[];
  newPatterns: string[];
  suggestedLabel: string;
  newDictionaryWords: string[];
}

export function AtroposInterface() {
  // Main flow state
  const [draft, setDraft] = useState("");
  const [corrected, setCorrected] = useState("");
  const [isChecking, setIsChecking] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hadChanges, setHadChanges] = useState(false);

  // Diff view state
  const [showDiffView, setShowDiffView] = useState(true);
  const [currentChangeIndex, setCurrentChangeIndex] = useState(0);
  const changeRefs = useRef<Map<number, HTMLSpanElement>>(new Map());
  const diffContainerRef = useRef<HTMLDivElement>(null);

  // Intent questions state
  const [intentQuestions, setIntentQuestions] = useState<IntentQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});

  // Final version & memory save state
  const [finalVersion, setFinalVersion] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedLearnings, setExtractedLearnings] = useState<ExtractedLearnings | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [selectedPatterns, setSelectedPatterns] = useState<Set<string>>(new Set());
  const [selectedWords, setSelectedWords] = useState<Set<string>>(new Set());
  const [editedLabel, setEditedLabel] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  // Memory panel state
  const [memory, setMemory] = useState<AtroposMemory | null>(null);
  const [stats, setStats] = useState<MemoryStats | null>(null);
  const [showMemory, setShowMemory] = useState(false);
  const [isLoadingMemory, setIsLoadingMemory] = useState(false);
  const [newWord, setNewWord] = useState("");

  // Compute diff between draft and corrected text
  const diffResult = useMemo<DiffResult | null>(() => {
    if (!draft || !corrected || draft === corrected) return null;
    return computeSmartDiff(draft, corrected);
  }, [draft, corrected]);

  const diffSummary = useMemo(() => {
    if (!diffResult) return null;
    return getDiffSummary(diffResult);
  }, [diffResult]);

  // Reset change index when diff changes
  useEffect(() => {
    setCurrentChangeIndex(0);
    changeRefs.current.clear();
  }, [diffResult]);

  // Scroll to current change
  const scrollToChange = useCallback((index: number) => {
    const ref = changeRefs.current.get(index);
    if (ref && diffContainerRef.current) {
      ref.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, []);

  // Navigate to next change
  const goToNextChange = useCallback(() => {
    if (!diffResult || diffResult.changeCount === 0) return;
    const nextIndex = (currentChangeIndex + 1) % diffResult.changeCount;
    setCurrentChangeIndex(nextIndex);
    scrollToChange(nextIndex);
  }, [currentChangeIndex, diffResult, scrollToChange]);

  // Navigate to previous change
  const goToPrevChange = useCallback(() => {
    if (!diffResult || diffResult.changeCount === 0) return;
    const prevIndex = currentChangeIndex === 0 ? diffResult.changeCount - 1 : currentChangeIndex - 1;
    setCurrentChangeIndex(prevIndex);
    scrollToChange(prevIndex);
  }, [currentChangeIndex, diffResult, scrollToChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!showDiffView || !diffResult || diffResult.changeCount === 0) return;

      // F8 or Cmd/Ctrl + Down for next change (like Cursor)
      if (e.key === "F8" || ((e.metaKey || e.ctrlKey) && e.key === "ArrowDown")) {
        e.preventDefault();
        goToNextChange();
      }
      // Shift+F8 or Cmd/Ctrl + Up for previous change
      if ((e.shiftKey && e.key === "F8") || ((e.metaKey || e.ctrlKey) && e.key === "ArrowUp")) {
        e.preventDefault();
        goToPrevChange();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showDiffView, diffResult, goToNextChange, goToPrevChange]);

  // Load memory
  const loadMemory = useCallback(async () => {
    setIsLoadingMemory(true);
    try {
      const res = await fetch("/api/atropos/memory");
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

  // Correct text
  const correctText = async (withAnswers = false) => {
    if (!draft.trim()) return;

    setIsChecking(true);
    setError(null);
    setCorrected("");
    setIntentQuestions([]);

    try {
      const body: any = { text: draft };
      if (withAnswers && Object.keys(answers).length > 0) {
        body.answers = answers;
      }

      const res = await fetch("/api/atropos/correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Correction failed");
      }

      const data = await res.json();
      setCorrected(data.correctedText);
      setHadChanges(data.hadChanges);
      setIntentQuestions(data.intentQuestions || []);

      // Reset answers if we got new questions
      if (data.intentQuestions?.length > 0) {
        setAnswers({});
        setSelectedOptions({});
      }

      // Refresh memory stats if panel is open
      if (showMemory) {
        loadMemory();
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsChecking(false);
    }
  };

  // Handle option selection for intent questions
  const selectOption = (question: string, option: string) => {
    setSelectedOptions((prev) => ({ ...prev, [question]: option }));
    setAnswers((prev) => ({ ...prev, [question]: option }));
  };

  // Handle free text answer
  const setFreeTextAnswer = (question: string, text: string) => {
    setAnswers((prev) => ({ ...prev, [question]: text }));
    // Clear selected option if user types custom text
    if (text && selectedOptions[question]) {
      setSelectedOptions((prev) => {
        const next = { ...prev };
        delete next[question];
        return next;
      });
    }
  };

  // Submit answers and re-correct
  const submitAnswers = () => {
    correctText(true);
  };

  // Copy to clipboard
  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(corrected);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Extract learnings from final version
  const extractLearnings = async () => {
    if (!finalVersion.trim() || !corrected.trim()) return;

    setIsExtracting(true);
    setError(null);

    try {
      const res = await fetch("/api/atropos/extract-memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aiDraft: corrected,
          userFinal: finalVersion,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Extraction failed");
      }

      const data = await res.json();
      setExtractedLearnings(data);
      setSelectedPatterns(new Set(data.newPatterns));
      setSelectedWords(new Set(data.newDictionaryWords));
      setEditedLabel(data.suggestedLabel);
      setShowSaveDialog(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsExtracting(false);
    }
  };

  // Save confirmed learnings
  const saveToMemory = async () => {
    if (!extractedLearnings) return;

    setIsSaving(true);
    try {
      const res = await fetch("/api/atropos/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patterns: Array.from(selectedPatterns),
          dictionaryWords: Array.from(selectedWords),
          label: editedLabel,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save memory");
      }

      setShowSaveDialog(false);
      setExtractedLearnings(null);
      setFinalVersion("");
      loadMemory();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsSaving(false);
    }
  };

  // Add/remove dictionary word
  const addDictionaryWord = async () => {
    if (!newWord.trim()) return;
    try {
      const res = await fetch("/api/atropos/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", word: newWord.trim() }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemory((prev) =>
          prev ? { ...prev, customDictionary: data.customDictionary } : prev
        );
        setNewWord("");
      }
    } catch (e) {
      console.error("Failed to add word:", e);
    }
  };

  const removeDictionaryWord = async (word: string) => {
    try {
      const res = await fetch("/api/atropos/memory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", word }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemory((prev) =>
          prev ? { ...prev, customDictionary: data.customDictionary } : prev
        );
      }
    } catch (e) {
      console.error("Failed to remove word:", e);
    }
  };

  // Reset memory
  const resetMemory = async () => {
    if (!confirm("Reset all learned patterns? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/atropos/memory", { method: "DELETE" });
      if (res.ok) {
        loadMemory();
      }
    } catch (e) {
      console.error("Failed to reset memory:", e);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Main content area */}
      <div className="flex-1 p-6 space-y-6 overflow-auto">
        {/* Draft Input */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
            Your Draft
          </label>
          <Textarea
            placeholder="Paste or type your text here..."
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[160px] resize-y bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-teal)] focus:ring-[var(--tartarus-teal)]"
          />
          <div className="flex justify-between items-center">
            <span className="text-xs text-[var(--tartarus-ivory-faded)]">
              {draft.length.toLocaleString()} characters
            </span>
            <Button
              onClick={() => correctText(false)}
              disabled={isChecking || !draft.trim()}
              className="bg-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-bright)] text-[var(--tartarus-deep)]"
            >
              {isChecking ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Correcting...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Correct
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

        {/* Corrected Output */}
        {corrected && (
          <div className="space-y-3">
            {/* Header with status and controls */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
                  Result
                </label>
                {hadChanges ? (
                  <Badge className="bg-[var(--tartarus-teal)]/20 text-[var(--tartarus-teal)] border-[var(--tartarus-teal)]/30">
                    {diffSummary || "Corrections made"}
                  </Badge>
                ) : (
                  <Badge className="bg-[var(--tartarus-gold)]/20 text-[var(--tartarus-gold)] border-[var(--tartarus-gold)]/30">
                    Perfect as is
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-2">
                {/* View mode toggle */}
                {hadChanges && diffResult && (
                  <div className="flex rounded-md overflow-hidden border border-[var(--tartarus-border)]">
                    <button
                      onClick={() => setShowDiffView(true)}
                      className={cn(
                        "px-2.5 py-1 text-xs flex items-center gap-1.5 transition-colors",
                        showDiffView
                          ? "bg-[var(--tartarus-teal)] text-[var(--tartarus-deep)]"
                          : "bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
                      )}
                    >
                      <GitCompare className="h-3 w-3" />
                      Diff
                    </button>
                    <button
                      onClick={() => setShowDiffView(false)}
                      className={cn(
                        "px-2.5 py-1 text-xs flex items-center gap-1.5 transition-colors",
                        !showDiffView
                          ? "bg-[var(--tartarus-teal)] text-[var(--tartarus-deep)]"
                          : "bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)]"
                      )}
                    >
                      <FileText className="h-3 w-3" />
                      Clean
                    </button>
                  </div>
                )}

                {/* Copy button */}
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
            </div>

            {/* Change navigation bar */}
            {showDiffView && hadChanges && diffResult && diffResult.changeCount > 0 && (
              <div className="flex items-center justify-between px-3 py-2 rounded-md bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                <div className="flex items-center gap-2">
                  <button
                    onClick={goToPrevChange}
                    className="p-1 rounded hover:bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)] transition-colors"
                    title="Previous change (Shift+F8)"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <span className="text-xs font-medium text-[var(--tartarus-ivory)] min-w-[80px] text-center">
                    Change {currentChangeIndex + 1} of {diffResult.changeCount}
                  </span>
                  <button
                    onClick={goToNextChange}
                    className="p-1 rounded hover:bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)] transition-colors"
                    title="Next change (F8)"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                <span className="text-[10px] text-[var(--tartarus-ivory-faded)]">
                  F8 / Shift+F8 to navigate
                </span>
              </div>
            )}

            {/* Content area */}
            <div className="relative">
              {/* Diff view */}
              {showDiffView && hadChanges && diffResult ? (
                <div
                  ref={diffContainerRef}
                  className="min-h-[180px] max-h-[400px] p-4 rounded-lg bg-[var(--tartarus-deep)] border border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] overflow-auto whitespace-pre-wrap font-mono text-sm leading-relaxed"
                >
                  {diffResult.parts.map((part, idx) => {
                    const isCurrentChange = part.changeIndex === currentChangeIndex;

                    if (part.removed) {
                      return (
                        <span
                          key={idx}
                          ref={part.changeIndex !== undefined ? (el) => {
                            if (el) changeRefs.current.set(part.changeIndex!, el);
                          } : undefined}
                          className={cn(
                            "atropos-diff-removed",
                            isCurrentChange && "atropos-diff-current"
                          )}
                        >
                          {part.value}
                        </span>
                      );
                    }
                    if (part.added) {
                      return (
                        <span
                          key={idx}
                          ref={part.changeIndex !== undefined ? (el) => {
                            if (el) changeRefs.current.set(part.changeIndex!, el);
                          } : undefined}
                          className={cn(
                            "atropos-diff-added",
                            isCurrentChange && "atropos-diff-current"
                          )}
                        >
                          {part.value}
                        </span>
                      );
                    }
                    return <span key={idx}>{part.value}</span>;
                  })}
                </div>
              ) : (
                <Textarea
                  value={corrected}
                  readOnly
                  className="min-h-[180px] resize-y bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] rounded-lg"
                />
              )}
            </div>
          </div>
        )}

        {/* Intent Questions Section */}
        {intentQuestions.length > 0 && (
          <div className="p-4 rounded-lg bg-[var(--tartarus-gold)]/10 border border-[var(--tartarus-gold)]/30 space-y-4">
            <div className="flex items-center gap-2 text-[var(--tartarus-gold)]">
              <MessageCircleQuestion className="h-5 w-5" />
              <span className="font-medium">Atropos seeks clarity:</span>
            </div>
            {intentQuestions.map((q, idx) => (
              <div key={idx} className="space-y-2">
                <p className="text-[var(--tartarus-ivory)]">"{q.question}"</p>
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
                  value={
                    selectedOptions[q.question] ? "" : answers[q.question] || ""
                  }
                  onChange={(e) => setFreeTextAnswer(q.question, e.target.value)}
                  className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                />
              </div>
            ))}
            <Button
              onClick={submitAnswers}
              disabled={
                isChecking ||
                intentQuestions.some((q) => !answers[q.question])
              }
              className="bg-[var(--tartarus-gold)] hover:bg-[var(--tartarus-gold)]/80 text-[var(--tartarus-deep)]"
            >
              Submit Answers
            </Button>
          </div>
        )}

        {/* Final Version & Save to Memory */}
        {corrected && intentQuestions.length === 0 && (
          <>
            <div className="border-t border-[var(--tartarus-border)] pt-6 space-y-2">
              <label className="text-sm font-medium text-[var(--tartarus-ivory)]">
                Your Final Version{" "}
                <span className="text-[var(--tartarus-ivory-faded)] font-normal">
                  (optional - paste to teach Atropos)
                </span>
              </label>
              <Textarea
                placeholder="Paste your edited final version here to help Atropos learn your preferences..."
                value={finalVersion}
                onChange={(e) => setFinalVersion(e.target.value)}
                className="min-h-[120px] resize-y bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-gold)] focus:ring-[var(--tartarus-gold)]"
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
          </>
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

              {/* Main Changes - Collapsible */}
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

              {/* New Patterns - Collapsible */}
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

              {/* Dictionary Words - Collapsible */}
              {extractedLearnings.newDictionaryWords.length > 0 && (
                <details className="group" open>
                  <summary className="flex items-center gap-2 cursor-pointer text-xs text-[var(--tartarus-ivory-faded)] hover:text-[var(--tartarus-ivory)] transition-colors">
                    <ChevronRight className="h-3 w-3 transition-transform group-open:rotate-90" />
                    Add to dictionary ({extractedLearnings.newDictionaryWords.length})
                  </summary>
                  <div className="flex flex-wrap gap-2 mt-2 ml-5">
                    {extractedLearnings.newDictionaryWords.map((word) => (
                      <label
                        key={word}
                        className="flex items-center gap-1 text-sm cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedWords.has(word)}
                          onChange={(e) => {
                            const newSet = new Set(selectedWords);
                            if (e.target.checked) {
                              newSet.add(word);
                            } else {
                              newSet.delete(word);
                            }
                            setSelectedWords(newSet);
                          }}
                          className="accent-[var(--tartarus-gold)]"
                        />
                        <Badge
                          variant="outline"
                          className="border-[var(--tartarus-gold)]/30 text-[var(--tartarus-gold)]"
                        >
                          {word}
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
                {stats.memoryEntries} memories · {stats.dictionaryWords} words ·{" "}
                {stats.totalChecks} checks
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
                {/* Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-teal)]">
                      {stats?.totalChecks || 0}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Total Checks
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-gold)]">
                      {stats?.totalCorrections || 0}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Corrections
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-ivory)]">
                      {memory.memories.length}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Memories
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]">
                    <p className="text-2xl font-bold text-[var(--tartarus-ivory)]">
                      {memory.customDictionary.length}
                    </p>
                    <p className="text-xs text-[var(--tartarus-ivory-faded)]">
                      Dictionary
                    </p>
                  </div>
                </div>

                {/* Recent Memories */}
                {memory.memories.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                      Recent Learnings
                    </h4>
                    <div className="space-y-2 max-h-40 overflow-auto">
                      {memory.memories.slice(-5).reverse().map((m, idx) => (
                        <div
                          key={idx}
                          className="p-2 rounded bg-[var(--tartarus-surface)] border border-[var(--tartarus-border)]"
                        >
                          <p className="text-sm text-[var(--tartarus-ivory-dim)]">
                            {m.content}
                          </p>
                          {m.tags.length > 0 && (
                            <div className="flex gap-1 mt-1">
                              {m.tags.map((tag) => (
                                <Badge
                                  key={tag}
                                  variant="outline"
                                  className="text-[10px] border-[var(--tartarus-teal)]/30 text-[var(--tartarus-teal)]"
                                >
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Dictionary */}
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                    Protected Dictionary
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {memory.customDictionary.map((word) => (
                      <Badge
                        key={word}
                        variant="outline"
                        className="text-xs border-[var(--tartarus-gold)]/30 text-[var(--tartarus-gold)] bg-[var(--tartarus-gold)]/10 group"
                      >
                        {word}
                        <button
                          onClick={() => removeDictionaryWord(word)}
                          className="ml-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Add word..."
                      value={newWord}
                      onChange={(e) => setNewWord(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && addDictionaryWord()}
                      className="h-8 text-sm bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={addDictionaryWord}
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
                No memory data available yet. Start correcting text to build your
                writing memory.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
