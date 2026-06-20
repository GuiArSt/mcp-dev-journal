"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Paperclip, AtSign, Star, Palette, Send, Cpu, SlidersHorizontal } from "lucide-react";
import { useFileUpload } from "@/lib/hooks/useFileUpload";
import type { ComposerMode } from "./types";
import { ModelsPopover } from "./ModelsPopover";

export interface ChatModelOption {
  key: string;
  label: string;
  provider: "anthropic" | "google" | "openai";
}

interface ComposerProps {
  mode: ComposerMode;
  onModeChange: (m: ComposerMode) => void;
  /** Increment to clear the draft after new/load chat (not tied to `conversationId`, which may appear mid-session after first save). */
  draftResetNonce: number;
  /** Called with trimmed text and any attached files; draft/files are cleared by the composer after invoke. */
  onSubmit: (text: string, files?: FileList) => void;
  disabled: boolean;
  contextPercent: number;
  contextTokenLabel?: string;
  contextTooltip?: string;
  activeSkillCount?: number;
  skillContextActive?: boolean;
  effectiveContextCount?: number;
  effectiveToolsCount?: number;
  // Chat model selection
  chatModel: string;
  chatModels: ChatModelOption[];
  onChatModelChange: (key: string) => void;
  // Images-in-chat toggle + provider
  imagesEnabled: boolean;
  onToggleImages: () => void;
  imagesProvider: "google" | "openai";
  onImagesProviderChange: (p: "google" | "openai") => void;
  // Other toolbar actions
  onPaint?: () => void;
  onSkillsClick?: (anchor: DOMRect) => void;
  onConfigClick?: (anchor: DOMRect) => void;
  onRequestCloseSkills?: () => void;
  onRequestCloseConfig?: () => void;
  onAttach?: () => void;
  daimonActive: boolean;
  onToggleDaimon: () => void;
  onStop?: () => void;
  isStreaming: boolean;
}

export function Composer({
  mode,
  onModeChange,
  draftResetNonce,
  onSubmit,
  disabled,
  contextPercent,
  contextTokenLabel,
  contextTooltip,
  activeSkillCount = 0,
  skillContextActive = false,
  effectiveContextCount,
  effectiveToolsCount,
  chatModel,
  chatModels,
  onChatModelChange,
  imagesEnabled,
  onToggleImages,
  imagesProvider,
  onImagesProviderChange,
  onPaint,
  onSkillsClick,
  onConfigClick,
  onRequestCloseSkills,
  onRequestCloseConfig,
  onAttach,
  daimonActive,
  onToggleDaimon,
  onStop,
  isStreaming,
}: ComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  const modelsButtonRef = useRef<HTMLButtonElement>(null);
  const skillsButtonRef = useRef<HTMLButtonElement>(null);
  const configButtonRef = useRef<HTMLButtonElement>(null);
  /** Local draft so typing does not re-render HourglassChat (Hero/Mood, etc.). */
  const [draft, setDraft] = useState("");
  const [floatPos, setFloatPos] = useState<{ left: number; top: number } | null>(null);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [extraHeight, setExtraHeight] = useState(0); // user-driven vertical resize while floating
  const visionCompression = useMemo(() => {
    if (chatModel.startsWith("claude-")) return { maxDimension: 2048 };
    return undefined;
  }, [chatModel]);
  const {
    fileInputRef,
    selectedFiles,
    imagePreviews,
    isCompressing,
    handleFileSelect,
    handleDrop,
    handleDragOver,
    removeImage,
    clearFiles,
  } = useFileUpload(visionCompression);
  const selectedFileArray = useMemo(
    () => (selectedFiles ? Array.from(selectedFiles) : []),
    [selectedFiles],
  );

  useEffect(() => {
    setDraft("");
    clearFiles();
  }, [draftResetNonce, clearFiles]);

  // Auto-grow textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 280)}px`;
  }, [draft]);

  // Drag handler (only when floating)
  const dragState = useRef<{ startX: number; startY: number; startL: number; startT: number; width: number; height: number; dragging: boolean }>({
    startX: 0, startY: 0, startL: 0, startT: 0, width: 0, height: 0, dragging: false,
  });

  const onHandleMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== "floating" || !composerRef.current) return;
    const rect = composerRef.current.getBoundingClientRect();
    setModelsOpen(false);
    onRequestCloseSkills?.();
    onRequestCloseConfig?.();
    dragState.current = {
      dragging: true,
      startX: e.clientX,
      startY: e.clientY,
      startL: rect.left,
      startT: rect.top,
      width: rect.width,
      height: rect.height,
    };
    document.body.style.cursor = "grabbing";
    e.preventDefault();
  }, [mode, onRequestCloseSkills, onRequestCloseConfig]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragState.current.dragging) return;
      const { startX, startY, startL, startT, width, height } = dragState.current;
      const margin = 12;
      const rawLeft = startL + (e.clientX - startX);
      const rawTop = startT + (e.clientY - startY);
      setFloatPos({
        left: Math.max(margin, Math.min(rawLeft, window.innerWidth - width - margin)),
        top: Math.max(margin, Math.min(rawTop, window.innerHeight - height - margin)),
      });
    };
    const onUp = () => {
      if (dragState.current.dragging) {
        dragState.current.dragging = false;
        document.body.style.cursor = "";
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  // When switching back to floating, clear manual position
  const handleModeChange = useCallback((m: ComposerMode) => {
    if (m === "floating") setFloatPos(null);
    onModeChange(m);
  }, [onModeChange]);

  const onHandleDblClick = () => {
    handleModeChange(mode === "docked" ? "floating" : "docked");
  };

  const submitDraft = useCallback(() => {
    const t = draft.trim();
    const hasFiles = Boolean(selectedFiles?.length);
    if (!disabled && !isCompressing && (t || hasFiles)) {
      onSubmit(t, selectedFiles);
      setDraft("");
      clearFiles();
    }
  }, [clearFiles, disabled, draft, isCompressing, onSubmit, selectedFiles]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitDraft();
    }
  };

  const style: React.CSSProperties = mode === "floating" && floatPos
    ? { left: floatPos.left, top: floatPos.top, bottom: "auto", transform: "none" }
    : {};

  // Resize handle (floating only) — drag bottom-right to grow vertically.
  const onResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (mode !== "floating") return;
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startExtra = extraHeight;
    const onMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY;
      setExtraHeight(Math.max(0, Math.min(420, startExtra + delta)));
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [mode, extraHeight]);

  // Apply user-driven extra height as a min-height on the textarea.
  const textareaStyle: React.CSSProperties = mode === "floating" && extraHeight > 0
    ? { minHeight: 60 + extraHeight }
    : {};

  // Active model label for the Models button.
  const activeModelLabel = chatModels.find((m) => m.key === chatModel)?.label ?? chatModel;

  return (
    <div
      ref={composerRef}
      className={`hg-composer${mode === "docked" ? " hg-docked" : ""}`}
      style={style}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div
        className="hg-composer-handle"
        onMouseDown={onHandleMouseDown}
        onDoubleClick={onHandleDblClick}
        title="drag to move · dbl-click to dock"
      />

      <textarea
        ref={textareaRef}
        placeholder="write the next turn — Kronos answers; the Muse holds the shelf…"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        disabled={disabled && !isStreaming}
        style={textareaStyle}
      />

      {imagePreviews.length > 0 && (
        <div className="hg-attachments" aria-label="attached files">
          {imagePreviews.map((preview, index) => {
            const file = selectedFileArray[index];
            const isPdf = preview.startsWith("pdf:");
            return (
              <div className="hg-attachment" key={`${preview}-${index}`}>
                {isPdf ? (
                  <div className="hg-attachment-pdf">PDF</div>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview} alt={file?.name ? `Preview of ${file.name}` : "Attached image preview"} />
                )}
                <div className="hg-attachment-meta">
                  <span>{file?.name || (isPdf ? preview.slice(4) : "image")}</span>
                  {file && <small>{formatBytes(file.size)}</small>}
                </div>
                <button type="button" onClick={() => removeImage(index)} aria-label="remove attachment">
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="hg-composer-toolbar">
        {/* Mode toggle — moved INTO the toolbar so the chamfered corner doesn't clip it */}
        <div className="hg-composer-mode-inline" role="radiogroup" aria-label="Composer mode">
          <button
            type="button"
            className={mode === "docked" ? "hg-on" : ""}
            onClick={() => handleModeChange("docked")}
            title="dock to bottom"
          >
            docked
          </button>
          <button
            type="button"
            className={mode === "floating" ? "hg-on" : ""}
            onClick={() => handleModeChange("floating")}
            title="float (drag to move)"
          >
            floating
          </button>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,application/pdf"
          multiple
          hidden
          onChange={handleFileSelect}
        />
        <button
          className={`hg-tbtn${selectedFiles?.length ? " hg-on" : ""}`}
          type="button"
          title="attach image or PDF"
          onClick={() => {
            onAttach?.();
            fileInputRef.current?.click();
          }}
          disabled={disabled || isCompressing}
        >
          <Paperclip />
          attach
          {selectedFiles?.length ? <span className="hg-tbtn-count">{selectedFiles.length}</span> : null}
        </button>
        {onSkillsClick && (
          <button
            ref={skillsButtonRef}
            className={`hg-tbtn${activeSkillCount > 0 ? " hg-on" : ""}`}
            type="button"
            title={activeSkillCount > 0 ? `${activeSkillCount} active skills` : "skills"}
            onClick={() => {
              const rect = skillsButtonRef.current?.getBoundingClientRect();
              if (rect) onSkillsClick(rect);
            }}
          >
            <AtSign />
            skills
            {activeSkillCount > 0 && <span className="hg-tbtn-count">{activeSkillCount}</span>}
          </button>
        )}
        {onConfigClick && (
          <button
            ref={configButtonRef}
            className={`hg-tbtn${skillContextActive ? " hg-skill-on" : ""}`}
            type="button"
            title={
              skillContextActive
                ? `context and tools (${effectiveContextCount ?? 0} context, ${effectiveToolsCount ?? 0} tools; includes skills)`
                : "context and tools"
            }
            onClick={() => {
              const rect = configButtonRef.current?.getBoundingClientRect();
              if (rect) onConfigClick(rect);
            }}
          >
            <SlidersHorizontal />
            context
            {skillContextActive && <span className="hg-tbtn-dot" />}
          </button>
        )}
        {/* Daimon (inline polish) — disabled per user request, slot held
            for re-enable. The Sync Library button takes the visible slot
            in Batch 3 (legacy /chat parity). */}
        {/*
        <button
          className={`hg-tbtn${daimonActive ? " hg-on" : ""}`}
          type="button"
          title="daimon · inline polish"
          onClick={onToggleDaimon}
        >
          <Star />
          daimon
        </button>
        */}
        {onPaint && (
          <button className="hg-tbtn" type="button" title="ask the muse for visual options" onClick={onPaint}>
            <Palette />
            visual
          </button>
        )}

        <div className="hg-spacer" />
        <span
          className="hg-model hg-ctx-meter"
          title={contextTooltip ?? `Estimated context vs ${contextPercent}% of model window`}
        >
          ctx{" "}
          <span className="hg-val">
            {contextTokenLabel ? `${contextTokenLabel} · ${contextPercent}%` : `${contextPercent}%`}
          </span>
        </span>

        {/* Single Models button keeps image-model details inside the popover. */}
        <div className="hg-composer-models-wrap">
          <button
            ref={modelsButtonRef}
            className={`hg-tbtn hg-models-btn${modelsOpen ? " hg-on" : ""}`}
            type="button"
            title={
              imagesEnabled
                ? `chat model: ${activeModelLabel}; image model configured inside`
                : `chat model: ${activeModelLabel}`
            }
            onClick={() => setModelsOpen((o) => !o)}
          >
            <Cpu />
            <span className="hg-models-btn-label">{activeModelLabel}</span>
          </button>
          <ModelsPopover
            open={modelsOpen}
            onOpenChange={setModelsOpen}
            anchorRef={modelsButtonRef}
            chatModel={chatModel}
            chatModels={chatModels}
            onChatModelChange={onChatModelChange}
            imagesEnabled={imagesEnabled}
            onToggleImages={onToggleImages}
            imagesProvider={imagesProvider}
            onImagesProviderChange={onImagesProviderChange}
          />
        </div>

        {isStreaming && onStop ? (
          <button className="hg-send" type="button" onClick={onStop} title="stop streaming">
            ⏹ stop
          </button>
        ) : (
          <button
            className="hg-send"
            type="button"
            onClick={submitDraft}
            disabled={disabled || isCompressing || (!draft.trim() && !selectedFiles?.length)}
            title={isCompressing ? "preparing attachment" : "send (⏎)"}
          >
            {isCompressing ? "prep" : "send"}
            <Send />
          </button>
        )}
      </div>

      {/* Resize handle — only when floating */}
      {mode === "floating" && (
        <div
          className="hg-composer-resize-handle"
          onMouseDown={onResizeMouseDown}
          title="drag to resize"
          aria-label="Resize composer"
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}
