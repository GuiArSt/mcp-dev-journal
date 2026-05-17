"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  Edit,
  Save,
  X,
  ArrowLeft,
  Tag,
  Plus,
  FileText,
  Settings,
  Check,
  ImagePlus,
  Trash2,
  Image,
  Loader2,
  Eye,
  EyeOff,
  Brain,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Checkbox } from "@/components/ui/checkbox";
import { compressImage, formatBytes } from "@/lib/image-compression";
import { formatFlexibleDate } from "@/lib/utils";
import { PromptDisplay } from "@/components/prompts/PromptDisplay";

interface MediaAsset {
  id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  alt: string | null;
  drive_url: string | null;
  supabase_url: string | null;
  created_at: string;
}

interface Document {
  id: number;
  slug: string;
  type: "writing" | "prompt" | "note";
  title: string;
  content: string;
  language: string;
  metadata: any;
  summary: string | null;
  created_at: string;
  updated_at: string;
}

interface DocumentType {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export default function DocumentDetailPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;
  const [document, setDocument] = useState<Document | null>(null);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Edited fields
  const [editedContent, setEditedContent] = useState("");
  const [editedTitle, setEditedTitle] = useState("");
  const [editedTags, setEditedTags] = useState<string[]>([]);
  const [editedType, setEditedType] = useState("");
  const [editedPrimaryType, setEditedPrimaryType] = useState<"writing" | "prompt" | "note">(
    "writing"
  );
  const [editedAlsoShownIn, setEditedAlsoShownIn] = useState<string[]>([]);
  const [editedWrittenDate, setEditedWrittenDate] = useState("");
  const [newTag, setNewTag] = useState("");

  // Prompt-specific fields
  const [editedPurpose, setEditedPurpose] = useState("");
  const [editedRole, setEditedRole] = useState<"system" | "user" | "assistant" | "chat">("system");
  const [editedInputSchema, setEditedInputSchema] = useState("");
  const [editedOutputSchema, setEditedOutputSchema] = useState("");
  const [editedConfig, setEditedConfig] = useState("");

  // Media attachments
  const [attachments, setAttachments] = useState<MediaAsset[]>([]);
  const [loadingAttachments, setLoadingAttachments] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Index summary visibility
  const [showIndexSummary, setShowIndexSummary] = useState(false);

  // Prompt metadata visibility
  const [showPromptMetadata, setShowPromptMetadata] = useState(false);

  // Regenerate summary state
  const [regeneratingSummary, setRegeneratingSummary] = useState(false);

  useEffect(() => {
    fetchDocument();
    fetchDocumentTypes();
  }, [slug]);

  const fetchDocumentTypes = async () => {
    try {
      const res = await fetch("/api/document-types");
      if (res.ok) {
        const data = await res.json();
        setDocumentTypes(data || []);
      }
    } catch (error) {
      console.error("Failed to fetch document types:", error);
    }
  };

  const fetchAttachments = async (docId: number) => {
    setLoadingAttachments(true);
    try {
      const res = await fetch(`/api/media?document_id=${docId}`);
      if (res.ok) {
        const data = await res.json();
        setAttachments(data.assets || []);
      }
    } catch (error) {
      console.error("Failed to fetch attachments:", error);
    } finally {
      setLoadingAttachments(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0 || !document) return;

    setUploadingMedia(true);
    try {
      for (const file of Array.from(files)) {
        // Compress image if needed
        let fileToUpload: File = file;
        if (file.type.startsWith("image/") && file.size > 5 * 1024 * 1024) {
          const result = await compressImage(file);
          if (result.wasCompressed) {
            fileToUpload = new File([result.blob], file.name, { type: result.format });
          }
        }

        const formData = new FormData();
        formData.append("file", fileToUpload);
        formData.append("document_id", document.id.toString());

        const res = await fetch("/api/media/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const error = await res.json();
          console.error("Upload failed:", error);
        }
      }
      // Refresh attachments
      await fetchAttachments(document.id);
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAttachment = async (id: number) => {
    if (!confirm("Remove this attachment?")) return;
    try {
      const res = await fetch(`/api/media/${id}`, { method: "DELETE" });
      if (res.ok && document) {
        await fetchAttachments(document.id);
      }
    } catch (error) {
      console.error("Delete error:", error);
    }
  };

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setDocument(data);
        resetEditState(data);
        // Fetch attachments for this document
        fetchAttachments(data.id);
      }
    } catch (error) {
      console.error("Failed to fetch document:", error);
    } finally {
      setLoading(false);
    }
  };

  const resetEditState = (doc: Document) => {
    setEditedContent(doc.content);
    setEditedTitle(doc.title);
    setEditedTags(doc.metadata?.tags || []);
    setEditedType(doc.metadata?.type || "");
    setEditedPrimaryType(doc.type);
    setEditedAlsoShownIn(doc.metadata?.alsoShownIn || []);
    // Support both new writtenDate and legacy year field
    setEditedWrittenDate(doc.metadata?.writtenDate || doc.metadata?.year || "");

    // Prompt-specific fields - load if type is prompt OR if alsoShownIn includes "prompt"
    const isPromptOrShownAsPrompt =
      doc.type === "prompt" || doc.metadata?.alsoShownIn?.includes("prompt");
    if (isPromptOrShownAsPrompt || doc.metadata?.purpose || doc.metadata?.role) {
      setEditedPurpose(doc.metadata?.purpose || "");
      setEditedRole(doc.metadata?.role || "system");
      setEditedInputSchema(
        doc.metadata?.inputSchema
          ? typeof doc.metadata.inputSchema === "string"
            ? doc.metadata.inputSchema
            : JSON.stringify(doc.metadata.inputSchema, null, 2)
          : ""
      );
      setEditedOutputSchema(
        doc.metadata?.outputSchema
          ? typeof doc.metadata.outputSchema === "string"
            ? doc.metadata.outputSchema
            : JSON.stringify(doc.metadata.outputSchema, null, 2)
          : ""
      );
      setEditedConfig(doc.metadata?.config ? JSON.stringify(doc.metadata.config, null, 2) : "");
    } else {
      setEditedPurpose("");
      setEditedRole("system");
      setEditedInputSchema("");
      setEditedOutputSchema("");
      setEditedConfig("");
    }
  };

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    try {
      // Validate JSON fields for prompts (or documents shown as prompts)
      let parsedInputSchema: string | null = null;
      let parsedOutputSchema: string | null = null;
      let parsedConfig: Record<string, unknown> | null = null;

      // Check if this is a prompt or shown in prompts tab
      const isPromptOrShownAsPrompt =
        editedPrimaryType === "prompt" || editedAlsoShownIn.includes("prompt");

      if (isPromptOrShownAsPrompt) {
        if (editedInputSchema.trim()) {
          try {
            JSON.parse(editedInputSchema); // Validate JSON
            parsedInputSchema = editedInputSchema.trim();
          } catch (e) {
            alert("Invalid JSON in Input Schema. Please fix before saving.");
            setSaving(false);
            return;
          }
        }

        if (editedOutputSchema.trim()) {
          try {
            JSON.parse(editedOutputSchema); // Validate JSON
            parsedOutputSchema = editedOutputSchema.trim();
          } catch (e) {
            alert("Invalid JSON in Output Schema. Please fix before saving.");
            setSaving(false);
            return;
          }
        }

        if (editedConfig.trim()) {
          try {
            parsedConfig = JSON.parse(editedConfig); // Parse and validate JSON
          } catch (e) {
            alert("Invalid JSON in Configuration. Please fix before saving.");
            setSaving(false);
            return;
          }
        }
      }

      const res = await fetch(`/api/documents/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedContent,
          title: editedTitle,
          type: editedPrimaryType, // Allow changing primary type
          metadata: {
            ...document.metadata,
            tags: editedTags,
            type: editedType || null,
            writtenDate: editedWrittenDate || null,
            year: undefined, // Remove legacy field
            alsoShownIn: editedAlsoShownIn.length > 0 ? editedAlsoShownIn : undefined,
            // Prompt-specific fields (if type is prompt OR shown in prompts tab)
            ...(isPromptOrShownAsPrompt
              ? {
                  purpose: editedPurpose.trim() || null,
                  role: editedRole || "system",
                  inputSchema: parsedInputSchema,
                  outputSchema: parsedOutputSchema,
                  config: parsedConfig,
                }
              : {
                  // Remove prompt fields if not a prompt and not shown as prompt
                  purpose: undefined,
                  role: undefined,
                  inputSchema: undefined,
                  outputSchema: undefined,
                  config: undefined,
                }),
          },
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setDocument(updated);
        setIsEditing(false);
      }
    } catch (error) {
      console.error("Failed to save document:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    if (document) {
      resetEditState(document);
    }
    setIsEditing(false);
  };

  const addTag = () => {
    const tag = newTag.trim();
    if (tag && !editedTags.includes(tag)) {
      setEditedTags([...editedTags, tag]);
      setNewTag("");
    }
  };

  const removeTag = (tagToRemove: string) => {
    setEditedTags(editedTags.filter((t) => t !== tagToRemove));
  };

  const editWithKronus = () => {
    if (!document) return;
    const tags = document.metadata?.tags?.join(", ") || "";
    const context = `I want to UPDATE this ${document.type} in the repository. Please help me modify it:\n\n**Document Slug:** ${document.slug}\n**Title:** ${document.title}\n**Type:** ${document.type}${document.metadata?.type ? `\n**Category:** ${document.metadata.type}` : ""}${tags ? `\n**Tags:** ${tags}` : ""}\n\n**Current Content:**\n${document.content}\n\nWhat changes would you like to make? You can update the content or metadata (including tags) using the repository_update_document tool.`;

    sessionStorage.setItem("kronusPrefill", context);
    router.push("/chat");
  };

  const regenerateSummary = async () => {
    if (!document) return;
    setRegeneratingSummary(true);
    try {
      const response = await fetch("/api/ai/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "document",
          content: document.content,
          title: document.title,
          metadata: document.metadata,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        if (data.summary) {
          // Update document with new summary
          const updateResponse = await fetch(`/api/documents/${slug}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              summary: data.summary,
            }),
          });

          if (updateResponse.ok) {
            const updated = await updateResponse.json();
            setDocument(updated);
          }
        }
      }
    } catch (error) {
      console.error("Failed to regenerate summary:", error);
      alert("Failed to regenerate summary. Please try again.");
    } finally {
      setRegeneratingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-full flex-col bg-[var(--tartarus-void)] p-3 md:p-6">
        <Skeleton className="mb-4 h-8 w-1/3 bg-[var(--tartarus-elevated)]" />
        <Skeleton className="h-64 w-full bg-[var(--tartarus-elevated)]" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="flex h-full items-center justify-center bg-[var(--tartarus-void)]">
        <p className="text-[var(--tartarus-ivory-muted)]">Document not found</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col bg-[var(--tartarus-void)]">
      {/* Header */}
      <header className="flex min-h-14 flex-col gap-2 border-b border-[var(--tartarus-border)] px-3 py-2 md:flex-row md:items-center md:justify-between md:px-6 md:py-0">
        <div className="flex items-center gap-2 md:gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/library")}
            className="text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)] hover:text-[var(--tartarus-ivory)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">{document.title}</h1>
          <Badge className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
            {document.type}
          </Badge>
          {document.metadata?.type && (
            <Badge
              variant="outline"
              className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]"
            >
              {document.metadata.type}
            </Badge>
          )}
          {document.type === "prompt" && document.metadata?.purpose && (
            <Badge
              variant="outline"
              className="border-[var(--tartarus-gold-dim)] text-xs text-[var(--tartarus-gold)]"
            >
              {document.metadata.purpose}
            </Badge>
          )}
          {document.type === "prompt" && document.metadata?.role && (
            <Badge
              variant="outline"
              className="border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)] capitalize"
            >
              {document.metadata.role}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]"
              >
                <X className="mr-2 h-4 w-4" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSave}
                disabled={saving}
                className="bg-[var(--tartarus-teal)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-teal-bright)]"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : "Save"}
              </Button>
            </>
          ) : (
            <>
              {/* Index Summary Toggle */}
              {document.summary && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowIndexSummary(!showIndexSummary)}
                  className={`h-8 w-8 ${showIndexSummary ? "text-[var(--tartarus-teal)]" : "text-[var(--tartarus-ivory-muted)]"} hover:bg-[var(--tartarus-elevated)]`}
                  title="Toggle Index Summary"
                >
                  {showIndexSummary ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              )}
              {/* Regenerate Summary Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={regenerateSummary}
                disabled={regeneratingSummary}
                className="text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]"
                title="Regenerate AI Summary"
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${regeneratingSummary ? "animate-spin" : ""}`}
                />
                {regeneratingSummary ? "Regenerating..." : "Regenerate Summary"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsEditing(true)}
                className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)] hover:bg-[var(--tartarus-elevated)]"
              >
                <Edit className="mr-2 h-4 w-4" />
                Edit
              </Button>
              <Button
                size="sm"
                onClick={editWithKronus}
                className="bg-[var(--tartarus-gold)] font-medium text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)]"
              >
                <img
                  src="/chronus-logo.png"
                  alt="Kronus"
                  className="mr-2 h-4 w-4 rounded-full object-cover"
                />
                Edit with Kronus
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Index Summary Panel */}
      {showIndexSummary && document.summary && (
        <div className="mx-6 mt-4 rounded-lg border border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] p-4">
          <div className="mb-2 flex items-center gap-2 text-xs text-[var(--tartarus-teal)]">
            <Brain className="h-3 w-3" />
            <span className="font-medium">Index Summary</span>
            <span className="text-[var(--tartarus-ivory-muted)]">(for Kronus)</span>
          </div>
          <p className="text-sm leading-relaxed text-[var(--tartarus-ivory-dim)]">
            {document.summary}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-3 md:p-6">
        <div className="mx-auto max-w-4xl">
          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] shadow-lg">
            <CardHeader>
              {/* Title */}
              <div className="mb-4 flex items-center justify-between">
                {isEditing ? (
                  <div className="mr-4 flex-1">
                    <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                      Title
                    </Label>
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-xl font-semibold text-[var(--tartarus-ivory)]"
                    />
                  </div>
                ) : (
                  <CardTitle className="text-[var(--tartarus-ivory)]">{document.title}</CardTitle>
                )}
                <div className="flex shrink-0 flex-col items-end gap-0.5 text-sm">
                  {/* Written date - when the piece was originally created (gold) */}
                  {(document.metadata?.writtenDate || document.metadata?.year) && (
                    <span className="text-[var(--tartarus-gold)]">
                      Written:{" "}
                      {formatFlexibleDate(
                        document.metadata?.writtenDate || document.metadata?.year
                      )}
                    </span>
                  )}
                  {/* Added date - when it was added to the system (muted) */}
                  <span className="text-xs text-[var(--tartarus-ivory-faded)]">
                    Added: {formatFlexibleDate(document.created_at)}
                  </span>
                </div>
              </div>

              {/* Type & Tags Section */}
              <div className="border-t border-[var(--tartarus-border)] pt-4">
                <div className="mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                  <span className="text-sm font-medium text-[var(--tartarus-ivory-muted)]">
                    Type & Tags
                  </span>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    {/* Primary Type & Year - Row */}
                    <div className="grid grid-cols-2 gap-4">
                      {/* Primary Type (writing/prompt/note) */}
                      <div>
                        <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                          Primary Tab
                        </Label>
                        <Select
                          value={editedPrimaryType}
                          onValueChange={(v) => {
                            const newType = v as "writing" | "prompt" | "note";
                            setEditedPrimaryType(newType);
                            // Reset prompt-specific fields if changing away from prompt
                            if (newType !== "prompt") {
                              setEditedPurpose("");
                              setEditedRole("system");
                              setEditedInputSchema("");
                              setEditedOutputSchema("");
                              setEditedConfig("");
                            } else if (document?.type !== "prompt") {
                              // Initialize prompt fields if changing TO prompt
                              setEditedPurpose("");
                              setEditedRole("system");
                              setEditedInputSchema("");
                              setEditedOutputSchema("");
                              setEditedConfig("");
                            }
                          }}
                        >
                          <SelectTrigger className="h-9 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                            <SelectItem
                              value="writing"
                              className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]"
                            >
                              Writings
                            </SelectItem>
                            <SelectItem
                              value="prompt"
                              className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]"
                            >
                              Prompts
                            </SelectItem>
                            <SelectItem
                              value="note"
                              className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]"
                            >
                              Notes
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                          Which tab this document appears in by default
                        </p>
                      </div>

                      {/* Written Date */}
                      <div>
                        <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                          Date Written
                        </Label>
                        <Input
                          value={editedWrittenDate}
                          onChange={(e) => setEditedWrittenDate(e.target.value)}
                          placeholder="2024, 2024-03, or 2024-03-15"
                          className="h-9 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                        />
                        <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                          When originally written (year, year-month, or full date)
                        </p>
                      </div>
                    </div>

                    {/* Subtype (essay, poem, etc.) */}
                    <div>
                      <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                        Category/Subtype
                      </Label>
                      <Select
                        value={editedType || "_none_"}
                        onValueChange={(v) => setEditedType(v === "_none_" ? "" : v)}
                      >
                        <SelectTrigger className="h-9 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)]">
                          <SelectValue placeholder="Select a type..." />
                        </SelectTrigger>
                        <SelectContent className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                          <SelectItem
                            value="_none_"
                            className="text-[var(--tartarus-ivory-muted)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]"
                          >
                            No type
                          </SelectItem>
                          {documentTypes.map((dt) => (
                            <SelectItem
                              key={dt.id}
                              value={dt.name}
                              className="text-[var(--tartarus-ivory)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]"
                            >
                              <span className="flex items-center gap-2">
                                <span className="font-medium">{dt.name}</span>
                                {dt.description && (
                                  <span className="text-xs text-[var(--tartarus-ivory-faded)]">
                                    - {dt.description.substring(0, 40)}
                                    {dt.description.length > 40 ? "..." : ""}
                                  </span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                        Categorization (essay, poem, system-prompt, etc.)
                      </p>
                    </div>

                    {/* Also Show In - Cross-tab visibility */}
                    <div>
                      <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                        Also show in other tabs
                      </Label>
                      <div className="flex flex-wrap gap-4">
                        {["writing", "prompt", "note"]
                          .filter((t) => t !== editedPrimaryType) // Exclude current primary type
                          .map((tabType) => (
                            <label
                              key={tabType}
                              className="flex cursor-pointer items-center gap-2 text-sm"
                            >
                              <Checkbox
                                checked={editedAlsoShownIn.includes(tabType)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setEditedAlsoShownIn([...editedAlsoShownIn, tabType]);
                                  } else {
                                    setEditedAlsoShownIn(
                                      editedAlsoShownIn.filter((t) => t !== tabType)
                                    );
                                  }
                                }}
                                className="border-[var(--tartarus-border)] data-[state=checked]:border-[var(--tartarus-teal)] data-[state=checked]:bg-[var(--tartarus-teal)]"
                              />
                              <span className="text-[var(--tartarus-ivory-muted)] capitalize">
                                {tabType === "writing"
                                  ? "Writings"
                                  : tabType === "prompt"
                                    ? "Prompts"
                                    : "Notes"}
                              </span>
                            </label>
                          ))}
                      </div>
                      <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                        Document will appear in selected tabs in addition to its primary tab.
                      </p>
                    </div>

                    {/* Tags Editor */}
                    <div>
                      <Label className="mb-1.5 block flex items-center gap-1 text-xs text-[var(--tartarus-ivory-muted)]">
                        <Tag className="h-3 w-3" /> Tags
                      </Label>
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {editedTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-[var(--tartarus-teal-soft)] pr-1 text-[var(--tartarus-teal)]"
                          >
                            {tag}
                            <button
                              onClick={() => removeTag(tag)}
                              className="ml-1 hover:text-[var(--tartarus-error)]"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                      <div className="flex gap-2">
                        <Input
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          placeholder="Add new tag..."
                          className="h-8 max-w-xs flex-1 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addTag();
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                          onClick={addTag}
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                      </div>
                    </div>

                    {/* Prompt-Specific Fields - show if type is prompt OR shown in prompts tab */}
                    {(editedPrimaryType === "prompt" || editedAlsoShownIn.includes("prompt")) && (
                      <div className="space-y-4 border-t border-[var(--tartarus-border)] pt-4">
                        <h3 className="text-sm font-medium text-[var(--tartarus-ivory)]">
                          Prompt Configuration
                        </h3>

                        {/* Purpose */}
                        <div>
                          <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                            Purpose
                          </Label>
                          <Input
                            value={editedPurpose}
                            onChange={(e) => setEditedPurpose(e.target.value)}
                            placeholder="What this prompt is for (e.g., 'System prompt for Kronus oracle mode')"
                            className="h-9 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                          />
                          <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                            Brief description of what this prompt does
                          </p>
                        </div>

                        {/* Role */}
                        <div>
                          <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                            Role
                          </Label>
                          <Select
                            value={editedRole}
                            onValueChange={(v) =>
                              setEditedRole(v as "system" | "user" | "assistant" | "chat")
                            }
                          >
                            <SelectTrigger className="h-9 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                              <SelectItem value="system" className="text-[var(--tartarus-ivory)]">
                                System
                              </SelectItem>
                              <SelectItem value="user" className="text-[var(--tartarus-ivory)]">
                                User
                              </SelectItem>
                              <SelectItem
                                value="assistant"
                                className="text-[var(--tartarus-ivory)]"
                              >
                                Assistant
                              </SelectItem>
                              <SelectItem value="chat" className="text-[var(--tartarus-ivory)]">
                                Chat (Multi-turn)
                              </SelectItem>
                            </SelectContent>
                          </Select>
                          <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                            Message role type for this prompt
                          </p>
                        </div>

                        {/* Input Schema */}
                        <div>
                          <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                            Input Schema (JSON)
                          </Label>
                          <Textarea
                            value={editedInputSchema}
                            onChange={(e) => setEditedInputSchema(e.target.value)}
                            placeholder='{"type":"object","properties":{"question":{"type":"string"}}}'
                            className="min-h-[80px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] font-mono text-xs text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                          />
                          <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                            Zod schema for input validation (JSON format)
                          </p>
                        </div>

                        {/* Output Schema */}
                        <div>
                          <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                            Output Schema (JSON)
                          </Label>
                          <Textarea
                            value={editedOutputSchema}
                            onChange={(e) => setEditedOutputSchema(e.target.value)}
                            placeholder='{"type":"object","properties":{"answer":{"type":"string"}}}'
                            className="min-h-[80px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] font-mono text-xs text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                          />
                          <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                            Zod schema for expected output (JSON format)
                          </p>
                        </div>

                        {/* Config */}
                        <div>
                          <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                            Configuration (JSON)
                          </Label>
                          <Textarea
                            value={editedConfig}
                            onChange={(e) => setEditedConfig(e.target.value)}
                            placeholder='{"model":"claude-sonnet-4","temperature":0.7,"max_tokens":2000}'
                            className="min-h-[80px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] font-mono text-xs text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
                          />
                          <p className="mt-1 text-[10px] text-[var(--tartarus-ivory-faded)]">
                            Configuration metadata (model, temperature, max_tokens, etc.)
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Display Type */}
                    {document.metadata?.type && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--tartarus-ivory-muted)]">Type:</span>
                        <Badge
                          variant="outline"
                          className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]"
                        >
                          {document.metadata.type}
                        </Badge>
                      </div>
                    )}

                    {/* Display Also Shown In */}
                    {document.metadata?.alsoShownIn && document.metadata.alsoShownIn.length > 0 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--tartarus-ivory-muted)]">Also in:</span>
                        {document.metadata.alsoShownIn.map((tab: string) => (
                          <Badge
                            key={tab}
                            variant="outline"
                            className="border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)] capitalize"
                          >
                            {tab === "writing"
                              ? "Writings"
                              : tab === "prompt"
                                ? "Prompts"
                                : "Notes"}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Display Tags */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-[var(--tartarus-ivory-muted)]">Tags:</span>
                      {document.metadata?.tags && document.metadata.tags.length > 0 ? (
                        document.metadata.tags.map((tag: string) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]"
                          >
                            {tag}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-[var(--tartarus-ivory-faded)] italic">
                          No tags
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {isEditing ? (
                <div>
                  <Label className="mb-1.5 block text-xs text-[var(--tartarus-ivory-muted)]">
                    Content
                  </Label>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[500px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] font-mono text-sm text-[var(--tartarus-ivory)]"
                  />
                </div>
              ) : (
                <>
                  {/* Main Content - Prompt Text or Markdown */}
                  {document.type === "prompt" ? (
                    <PromptDisplay content={document.content} />
                  ) : (
                    <div className="prose prose-sm prose-invert prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory)] prose-strong:text-[var(--tartarus-ivory)] prose-a:text-[var(--tartarus-teal)] max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
                        rehypePlugins={[rehypeKatex]}
                      >
                        {document.content}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Collapsible Prompt Metadata Section - Show for prompts, alsoShownIn prompts, OR writings with prompt metadata */}
                  {(document.type === "prompt" ||
                    document.metadata?.alsoShownIn?.includes("prompt") ||
                    document.metadata?.purpose ||
                    document.metadata?.role ||
                    document.metadata?.inputSchema ||
                    document.metadata?.outputSchema ||
                    document.metadata?.config) && (
                    <div className="mt-6 border-t border-[var(--tartarus-border)] pt-6">
                      <Collapsible open={showPromptMetadata} onOpenChange={setShowPromptMetadata}>
                        <div className="overflow-hidden rounded-lg border border-[var(--tartarus-border)] transition-colors hover:border-[var(--tartarus-teal-dim)]">
                          <CollapsibleTrigger asChild>
                            <button className="group flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-[var(--tartarus-elevated)]">
                              {showPromptMetadata ? (
                                <ChevronDown className="h-4 w-4 text-[var(--tartarus-teal)] transition-transform" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-[var(--tartarus-ivory-muted)] transition-colors group-hover:text-[var(--tartarus-teal)]" />
                              )}
                              <Settings
                                className={`h-4 w-4 ${showPromptMetadata ? "text-[var(--tartarus-teal)]" : "text-[var(--tartarus-ivory-muted)]"}`}
                              />
                              <span
                                className={`text-sm font-medium ${showPromptMetadata ? "text-[var(--tartarus-ivory)]" : "text-[var(--tartarus-ivory-muted)]"}`}
                              >
                                Prompt Configuration & Metadata
                              </span>
                              {/* Show count of available fields */}
                              {(document.metadata?.purpose ||
                                document.metadata?.role ||
                                document.metadata?.inputSchema ||
                                document.metadata?.outputSchema ||
                                document.metadata?.config) && (
                                <Badge
                                  variant="outline"
                                  className="ml-auto border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)]"
                                >
                                  {
                                    [
                                      document.metadata?.purpose,
                                      document.metadata?.role,
                                      document.metadata?.inputSchema,
                                      document.metadata?.outputSchema,
                                      document.metadata?.config,
                                    ].filter(Boolean).length
                                  }{" "}
                                  fields
                                </Badge>
                              )}
                            </button>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="space-y-4 border-t border-[var(--tartarus-border)]/50 px-3 pt-3 pb-3">
                              {/* Purpose */}
                              {document.metadata?.purpose ? (
                                <div>
                                  <span className="mb-1.5 block text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                                    Purpose:
                                  </span>
                                  <p className="text-sm leading-relaxed text-[var(--tartarus-ivory)]">
                                    {document.metadata.purpose}
                                  </p>
                                </div>
                              ) : null}

                              {/* Role */}
                              {document.metadata?.role ? (
                                <div>
                                  <span className="mb-1.5 block text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                                    Role:
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className="border-[var(--tartarus-teal-dim)] text-xs text-[var(--tartarus-teal)] capitalize"
                                  >
                                    {document.metadata.role}
                                  </Badge>
                                </div>
                              ) : null}

                              {/* Input Schema */}
                              {document.metadata?.inputSchema ? (
                                <div>
                                  <span className="mb-1.5 block text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                                    Input Schema:
                                  </span>
                                  <pre className="overflow-x-auto rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 font-mono text-xs leading-relaxed text-[var(--tartarus-ivory)]">
                                    {typeof document.metadata.inputSchema === "string"
                                      ? document.metadata.inputSchema
                                      : JSON.stringify(document.metadata.inputSchema, null, 2)}
                                  </pre>
                                </div>
                              ) : null}

                              {/* Output Schema */}
                              {document.metadata?.outputSchema ? (
                                <div>
                                  <span className="mb-1.5 block text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                                    Output Schema:
                                  </span>
                                  <pre className="overflow-x-auto rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 font-mono text-xs leading-relaxed text-[var(--tartarus-ivory)]">
                                    {typeof document.metadata.outputSchema === "string"
                                      ? document.metadata.outputSchema
                                      : JSON.stringify(document.metadata.outputSchema, null, 2)}
                                  </pre>
                                </div>
                              ) : null}

                              {/* Configuration */}
                              {document.metadata?.config ? (
                                <div>
                                  <span className="mb-1.5 block text-xs font-medium text-[var(--tartarus-ivory-muted)]">
                                    Configuration:
                                  </span>
                                  <pre className="overflow-x-auto rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 font-mono text-xs leading-relaxed text-[var(--tartarus-ivory)]">
                                    {typeof document.metadata.config === "string"
                                      ? document.metadata.config
                                      : JSON.stringify(document.metadata.config, null, 2)}
                                  </pre>
                                </div>
                              ) : null}

                              {/* Prompt configuration hint - show if no metadata fields exist yet */}
                              {!document.metadata?.purpose &&
                                !document.metadata?.role &&
                                !document.metadata?.inputSchema &&
                                !document.metadata?.outputSchema &&
                                !document.metadata?.config && (
                                  <p className="text-xs text-[var(--tartarus-ivory-faded)] italic">
                                    {document.type === "prompt"
                                      ? "Legacy prompt - no structured configuration available. Edit to add purpose, role, schemas, and config."
                                      : "This document appears in the Prompts tab. Edit to add prompt metadata (purpose, role, schemas, config)."}
                                  </p>
                                )}
                            </div>
                          </CollapsibleContent>
                        </div>
                      </Collapsible>
                    </div>
                  )}
                </>
              )}
            </CardContent>

            {/* Attachments Section */}
            <div className="border-t border-[var(--tartarus-border)] p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Image className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                  <span className="text-sm font-medium text-[var(--tartarus-ivory)]">
                    Attachments {attachments.length > 0 && `(${attachments.length})`}
                  </span>
                </div>
                <div>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept="image/*"
                    multiple
                    className="hidden"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingMedia}
                    className="border-[var(--tartarus-teal-dim)] text-[var(--tartarus-teal)] hover:bg-[var(--tartarus-teal-soft)]"
                  >
                    {uploadingMedia ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <ImagePlus className="mr-2 h-4 w-4" />
                        Add Image
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {loadingAttachments ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--tartarus-ivory-muted)]" />
                </div>
              ) : attachments.length === 0 ? (
                <div className="py-8 text-center text-[var(--tartarus-ivory-faded)]">
                  <Image className="mx-auto mb-2 h-12 w-12 opacity-30" />
                  <p className="text-sm">No images attached yet</p>
                  <p className="mt-1 text-xs">
                    Click "Add Image" to attach artwork, diagrams, or photos
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {attachments.map((asset) => (
                    <div
                      key={asset.id}
                      className="group relative aspect-square overflow-hidden rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
                    >
                      <img
                        src={asset.supabase_url || asset.drive_url || `/api/media/${asset.id}/raw`}
                        alt={asset.alt || asset.filename}
                        className="h-full w-full object-cover"
                      />
                      {/* Overlay with info and actions */}
                      <div className="absolute inset-0 flex flex-col justify-between bg-black/60 p-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <div className="flex justify-end">
                          <button
                            onClick={() => handleDeleteAttachment(asset.id)}
                            className="rounded-full bg-red-500/80 p-1.5 text-white transition-colors hover:bg-red-500"
                            title="Remove attachment"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="text-white">
                          <p className="truncate text-xs font-medium">{asset.filename}</p>
                          <p className="text-[10px] text-white/70">
                            {formatBytes(asset.file_size)}
                          </p>
                          {asset.drive_url && (
                            <span className="mt-1 inline-block rounded bg-[var(--tartarus-gold)]/20 px-1.5 py-0.5 text-[9px] text-[var(--tartarus-gold)]">
                              Archived
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
