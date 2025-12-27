"use client";

import { useEffect, useState } from "react";
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
import { Edit, Save, X, ArrowLeft, Tag, Plus, FileText, Settings } from "lucide-react";

interface Document {
  id: number;
  slug: string;
  type: "writing" | "prompt" | "note";
  title: string;
  content: string;
  language: string;
  metadata: any;
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
  const [newTag, setNewTag] = useState("");

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

  const fetchDocument = async () => {
    try {
      const res = await fetch(`/api/documents/${slug}`);
      if (res.ok) {
        const data = await res.json();
        setDocument(data);
        resetEditState(data);
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
  };

  const handleSave = async () => {
    if (!document) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/documents/${slug}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: editedContent,
          title: editedTitle,
          metadata: { ...document.metadata, tags: editedTags, type: editedType || null },
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

  if (loading) {
    return (
      <div className="flex h-full flex-col p-6 bg-[var(--tartarus-void)]">
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
      <header className="flex h-14 items-center justify-between px-6 border-b border-[var(--tartarus-border)]">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/repository")}
            className="text-[var(--tartarus-ivory-muted)] hover:text-[var(--tartarus-ivory)] hover:bg-[var(--tartarus-elevated)]"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
          <h1 className="text-lg font-semibold text-[var(--tartarus-ivory)]">{document.title}</h1>
          <Badge className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">{document.type}</Badge>
          {document.metadata?.type && (
            <Badge variant="outline" className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]">
              {document.metadata.type}
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
                className="bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold-bright)] font-medium"
              >
                <img src="/chronus-logo.png" alt="Kronus" className="h-4 w-4 mr-2 rounded-full object-cover" />
                Edit with Kronus
              </Button>
            </>
          )}
        </div>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)] shadow-lg">
            <CardHeader>
              {/* Title */}
              <div className="flex items-center justify-between mb-4">
                {isEditing ? (
                  <div className="flex-1 mr-4">
                    <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1.5 block">Title</Label>
                    <Input
                      value={editedTitle}
                      onChange={(e) => setEditedTitle(e.target.value)}
                      className="text-xl font-semibold bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                    />
                  </div>
                ) : (
                  <CardTitle className="text-[var(--tartarus-ivory)]">{document.title}</CardTitle>
                )}
                <div className="text-[var(--tartarus-ivory-muted)] text-sm shrink-0">
                  Updated: {new Date(document.updated_at).toLocaleDateString()}
                </div>
              </div>

              {/* Type & Tags Section */}
              <div className="pt-4 border-t border-[var(--tartarus-border)]">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
                  <span className="text-sm font-medium text-[var(--tartarus-ivory-muted)]">Type & Tags</span>
                </div>

                {isEditing ? (
                  <div className="space-y-4">
                    {/* Type Editor - Dropdown from predefined types */}
                    <div>
                      <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1.5 block">Document Type</Label>
                      <Select value={editedType || "_none_"} onValueChange={(v) => setEditedType(v === "_none_" ? "" : v)}>
                        <SelectTrigger className="h-9 bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]">
                          <SelectValue placeholder="Select a type..." />
                        </SelectTrigger>
                        <SelectContent className="bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
                          <SelectItem value="_none_" className="text-[var(--tartarus-ivory-muted)] focus:bg-[var(--tartarus-teal-soft)] focus:text-[var(--tartarus-teal)]">
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
                                  <span className="text-xs text-[var(--tartarus-ivory-faded)]">- {dt.description.substring(0, 40)}{dt.description.length > 40 ? "..." : ""}</span>
                                )}
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[10px] text-[var(--tartarus-ivory-faded)] mt-1">
                        Types are predefined. Manage them from the Repository page.
                      </p>
                    </div>

                    {/* Tags Editor */}
                    <div>
                      <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1.5 block flex items-center gap-1">
                        <Tag className="h-3 w-3" /> Tags
                      </Label>
                      <div className="flex flex-wrap gap-1.5 mb-2">
                        {editedTags.map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)] pr-1"
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
                          className="h-8 text-sm flex-1 max-w-xs bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)]"
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
                          <Plus className="h-3 w-3 mr-1" />
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Display Type */}
                    {document.metadata?.type && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[var(--tartarus-ivory-muted)]">Type:</span>
                        <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                          {document.metadata.type}
                        </Badge>
                      </div>
                    )}

                    {/* Display Tags */}
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-xs text-[var(--tartarus-ivory-muted)] mr-1">Tags:</span>
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
                        <span className="text-sm text-[var(--tartarus-ivory-faded)] italic">No tags</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardHeader>

            <CardContent>
              {isEditing ? (
                <div>
                  <Label className="text-xs text-[var(--tartarus-ivory-muted)] mb-1.5 block">Content</Label>
                  <Textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    className="min-h-[500px] font-mono text-sm bg-[var(--tartarus-deep)] border-[var(--tartarus-border)] text-[var(--tartarus-ivory)]"
                  />
                </div>
              ) : (
                <div className="prose prose-sm max-w-none prose-invert prose-headings:text-[var(--tartarus-ivory)] prose-p:text-[var(--tartarus-ivory)] prose-strong:text-[var(--tartarus-ivory)] prose-a:text-[var(--tartarus-teal)]">
                  {document.type === "prompt" ? (
                    <pre className="whitespace-pre-wrap break-words bg-[var(--tartarus-deep)] text-[var(--tartarus-ivory)] p-4 rounded-lg border border-[var(--tartarus-border)] font-mono text-sm leading-relaxed">{document.content}</pre>
                  ) : (
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{document.content}</ReactMarkdown>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
