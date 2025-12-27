"use client";

import { useRef, useEffect, useState, useCallback, memo, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  Send,
  User,
  Loader2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CheckCircle2,
  AlertCircle,
  Wrench,
  Save,
  History,
  Plus,
  Trash2,
  ImagePlus,
  X,
  Search,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SoulConfig, SoulConfigState, DEFAULT_CONFIG } from "./SoulConfig";

// Memoized markdown components - tighter spacing for better density
const markdownComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-lg font-bold mt-3 mb-1.5 text-[var(--kronus-ivory)]">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-semibold mt-2.5 mb-1 text-[var(--kronus-ivory)]">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-medium mt-2 mb-0.5 text-[var(--kronus-teal)]">{children}</h3>
  ),
  p: ({ children }: any) => (
    <p className="mb-1.5 leading-snug text-[var(--kronus-ivory-dim)]">{children}</p>
  ),
  ul: ({ children }: any) => (
    <ul className="list-disc list-inside mb-1.5 space-y-0.5 ml-3 text-[var(--kronus-ivory-dim)]">{children}</ul>
  ),
  ol: ({ children }: any) => (
    <ol className="list-decimal list-inside mb-1.5 space-y-0.5 ml-3 text-[var(--kronus-ivory-dim)]">{children}</ol>
  ),
  li: ({ children }: any) => (
    <li className="leading-snug marker:text-[var(--kronus-teal)]">{children}</li>
  ),
  code: ({ children, className }: any) => {
    const isInline = !className;
    return isInline ? (
      <code className="bg-[var(--kronus-deep)] px-1 py-0.5 rounded text-xs font-mono text-[var(--kronus-teal)]">
        {children}
      </code>
    ) : (
      <code className={cn("block bg-[var(--kronus-deep)] border border-[var(--kronus-border)] p-2 rounded-md text-xs font-mono overflow-x-auto text-[var(--kronus-ivory-dim)]", className)}>
        {children}
      </code>
    );
  },
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-[var(--kronus-teal)] bg-[var(--kronus-deep)] pl-3 pr-2 py-1.5 rounded-r-lg italic my-1.5 text-[var(--kronus-ivory-muted)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-2.5 border-[var(--kronus-border)]" />,
  strong: ({ children }: any) => (
    <strong className="font-semibold text-[var(--kronus-ivory)]">{children}</strong>
  ),
  em: ({ children }: any) => (
    <em className="italic text-[var(--kronus-ivory-dim)]">{children}</em>
  ),
  a: ({ children, href }: any) => (
    <a href={href} className="text-[var(--kronus-teal)] underline underline-offset-2 hover:text-[var(--kronus-gold)]" target="_blank" rel="noopener noreferrer">{children}</a>
  ),
  table: ({ children }: any) => (
    <table className="w-full my-2 border-collapse">{children}</table>
  ),
  th: ({ children }: any) => (
    <th className="border border-[var(--kronus-border)] bg-[var(--kronus-deep)] px-2 py-1.5 text-left text-[var(--kronus-ivory)] font-semibold text-sm">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="border border-[var(--kronus-border)] px-2 py-1.5 text-[var(--kronus-ivory-dim)] text-sm">{children}</td>
  ),
};

// Memoized markdown renderer for completed messages
const MemoizedMarkdown = memo(function MemoizedMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {text}
    </ReactMarkdown>
  );
});

// Simple streaming text renderer (no markdown parsing during streaming)
const StreamingText = memo(function StreamingText({ text }: { text: string }) {
  return <div className="whitespace-pre-wrap text-[var(--kronus-ivory-dim)]">{text}</div>;
});

interface ToolState {
  isLoading: boolean;
  completed?: boolean;
  error?: string;
  result?: string;
  images?: string[];
  model?: string;
  prompt?: string;
}

interface SavedConversation {
  id: number;
  title: string;
  created_at: string;
  updated_at: string;
}

export function ChatInterface() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [toolStates, setToolStates] = useState<Record<string, ToolState>>({});
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  // Conversation management
  const [showHistory, setShowHistory] = useState(false);
  const [savedConversations, setSavedConversations] = useState<SavedConversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(null);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveTitle, setSaveTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [input, setInput] = useState("");

  // Image upload state
  const [selectedFiles, setSelectedFiles] = useState<FileList | undefined>(undefined);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);

  // Chat search state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<number[]>([]); // indices of matching messages
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);
  const messageRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Soul config - controls which repository sections Kronus knows about
  const [soulConfig, setSoulConfig] = useState<SoulConfigState>(DEFAULT_CONFIG);
  // Store the config that was used when the conversation started (locked after first message)
  const [lockedSoulConfig, setLockedSoulConfig] = useState<SoulConfigState | null>(null);

  // Custom transport that includes soul config
  const chatTransport = useMemo(() => {
    return new DefaultChatTransport({
      api: "/api/chat",
      body: { soulConfig: lockedSoulConfig || soulConfig },
    });
  }, [lockedSoulConfig, soulConfig]);

  const { messages, sendMessage, status, setMessages, addToolResult, error } = useChat({
    transport: chatTransport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,

    async onToolCall({ toolCall }) {
      const { toolName, input, toolCallId } = toolCall;
      const typedArgs = input as Record<string, unknown>;

      setToolStates((prev) => ({
        ...prev,
        [toolCallId]: { isLoading: true },
      }));

      let output = "Tool execution completed";

      try {
        switch (toolName) {
          // ===== Journal Tools =====
          case "journal_create_entry": {
            const res = await fetch("/api/kronus/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            output = `Created journal entry for ${typedArgs.repository}/${typedArgs.branch} (${String(typedArgs.commit_hash).substring(0, 7)})`;
            break;
          }

          case "journal_get_entry": {
            const res = await fetch(`/api/entries/${typedArgs.commit_hash}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Entry not found");
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_list_by_repository": {
            const params = new URLSearchParams({
              repository: String(typedArgs.repository),
              limit: String(typedArgs.limit || 20),
              offset: String(typedArgs.offset || 0),
            });
            const res = await fetch(`/api/entries?${params}`);
            const data = await res.json();
            output = `Found ${data.total} entries for ${typedArgs.repository}:\n${JSON.stringify(data.entries, null, 2)}`;
            break;
          }

          case "journal_list_by_branch": {
            const params = new URLSearchParams({
              repository: String(typedArgs.repository),
              branch: String(typedArgs.branch),
              limit: String(typedArgs.limit || 20),
              offset: String(typedArgs.offset || 0),
            });
            const res = await fetch(`/api/entries?${params}`);
            const data = await res.json();
            output = `Found ${data.total} entries for ${typedArgs.repository}/${typedArgs.branch}:\n${JSON.stringify(data.entries, null, 2)}`;
            break;
          }

          case "journal_list_repositories": {
            const res = await fetch("/api/repositories");
            const data = await res.json();
            output = `Repositories: ${JSON.stringify(data)}`;
            break;
          }

          case "journal_list_branches": {
            const res = await fetch(`/api/repositories?repo=${typedArgs.repository}`);
            const data = await res.json();
            output = `Branches in ${typedArgs.repository}: ${JSON.stringify(data)}`;
            break;
          }

          case "journal_edit_entry": {
            const { commit_hash, ...updates } = typedArgs;
            const res = await fetch(`/api/entries/${commit_hash}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Update failed");
            output = `Updated entry ${String(commit_hash).substring(0, 7)}`;
            break;
          }

          case "journal_regenerate_entry": {
            const res = await fetch("/api/kronus/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                commit_hash: typedArgs.commit_hash,
                new_context: typedArgs.new_context,
                edit_mode: true,
              }),
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            output = `Regenerated entry ${String(typedArgs.commit_hash).substring(0, 7)}`;
            break;
          }

          case "journal_get_project_summary": {
            const res = await fetch(`/api/entries?repository=${typedArgs.repository}&summary=true`);
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_list_project_summaries": {
            const res = await fetch(`/api/repositories?summaries=true`);
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "journal_list_attachments": {
            const res = await fetch(`/api/entries/${typedArgs.commit_hash}`);
            const data = await res.json();
            output = `Attachments: ${JSON.stringify(data.attachments || [], null, 2)}`;
            break;
          }

          case "journal_backup": {
            const res = await fetch("/api/db/backup", { method: "POST" });
            const data = await res.json();
            output = data.message || "Backup completed";
            break;
          }

          // ===== Linear Tools (all execute directly now - Kronus asks permission first) =====
          case "linear_get_viewer": {
            const res = await fetch("/api/integrations/linear/viewer");
            const data = await res.json();
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "linear_list_issues": {
            const params = new URLSearchParams();
            if (typedArgs.assigneeId) params.set("assigneeId", String(typedArgs.assigneeId));
            if (typedArgs.teamId) params.set("teamId", String(typedArgs.teamId));
            if (typedArgs.projectId) params.set("projectId", String(typedArgs.projectId));
            if (typedArgs.query) params.set("query", String(typedArgs.query));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            if (typedArgs.showAll) params.set("showAll", "true");

            const res = await fetch(`/api/integrations/linear/issues?${params}`);
            const data = await res.json();
            output = `Found ${data.issues?.length || 0} issues:\n${JSON.stringify(data.issues, null, 2)}`;
            break;
          }

          case "linear_list_projects": {
            const params = typedArgs.teamId ? `?teamId=${typedArgs.teamId}` : "";
            const res = await fetch(`/api/integrations/linear/projects${params}`);
            const data = await res.json();
            output = `Found ${data.projects?.length || 0} projects:\n${JSON.stringify(data.projects, null, 2)}`;
            break;
          }

          case "linear_create_issue": {
            const res = await fetch("/api/integrations/linear/issues", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to create issue");
            output = `✅ Created issue: ${result.identifier} - ${result.title}\nURL: ${result.url}`;
            break;
          }

          case "linear_update_issue": {
            const { issueId, ...updates } = typedArgs;
            const res = await fetch(`/api/integrations/linear/issues/${issueId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update issue");
            output = `✅ Updated issue: ${result.identifier}`;
            break;
          }

          case "linear_update_project": {
            const { projectId, ...updates } = typedArgs;
            const res = await fetch(`/api/integrations/linear/projects/${projectId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const result = await res.json();
            if (!res.ok) throw new Error(result.error || "Failed to update project");
            output = `✅ Updated project: ${result.name}`;
            break;
          }

          // ===== Document Tools =====
          case "document_list": {
            const params = new URLSearchParams();
            if (typedArgs.type) params.set("type", String(typedArgs.type));
            if (typedArgs.year) params.set("year", String(typedArgs.year));
            if (typedArgs.search) params.set("search", String(typedArgs.search));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            const res = await fetch(`/api/documents?${params}`);
            const data = await res.json();
            output = `Found ${data.total} documents:\n${JSON.stringify(data.documents, null, 2)}`;
            break;
          }

          case "document_get": {
            const res = await fetch(`/api/documents/${typedArgs.slug}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Document not found");
            output = `**${data.title}** (ID: ${data.id})\nType: ${data.type}\nSlug: ${data.slug}\n\n${data.content}`;
            break;
          }

          case "document_create": {
            const res = await fetch("/api/documents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(typedArgs),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create document");
            output = `✅ Created document: ${data.title} (slug: ${data.slug})`;
            break;
          }

          case "document_update": {
            const { slug, ...updates } = typedArgs;
            const res = await fetch(`/api/documents/${slug}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update document");
            output = `✅ Updated document: ${data.title}`;
            break;
          }

          // NOTE: document_delete removed - destructive actions are UI-only

          // ===== CV Tools =====
          case "skill_list": {
            const res = await fetch("/api/cv/skills");
            const data = await res.json();
            output = `Found ${data.length} skills:\n${JSON.stringify(data, null, 2)}`;
            break;
          }

          case "skill_get": {
            const res = await fetch(`/api/cv/skills/${typedArgs.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Skill not found");
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "skill_generate": {
            const res = await fetch("/api/cv/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "skill",
                name: typedArgs.name,
                description: typedArgs.description,
                category: typedArgs.category,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate skill");
            // Save the generated skill
            const saveRes = await fetch("/api/cv/skills", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data.data),
            });
            if (!saveRes.ok) throw new Error("Failed to save generated skill");
            output = `✅ Generated and saved skill: ${data.data.name} (magnitude ${data.data.magnitude}/4)`;
            break;
          }

          case "skill_update": {
            const { id, ...updates } = typedArgs;
            const res = await fetch(`/api/cv/skills/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update skill");
            output = `✅ Updated skill: ${data.name}`;
            break;
          }

          case "experience_list": {
            const res = await fetch("/api/cv/experience");
            const data = await res.json();
            output = `Found ${data.length} work experience entries:
${JSON.stringify(data, null, 2)}`;
            break;
          }

          case "experience_get": {
            const res = await fetch(`/api/cv/experience/${typedArgs.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Experience not found");
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "experience_generate": {
            const res = await fetch("/api/cv/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "experience",
                company: typedArgs.company,
                title: typedArgs.title,
                description: typedArgs.description,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate experience");
            // Save the generated experience
            const saveRes = await fetch("/api/cv/experience", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data.data),
            });
            if (!saveRes.ok) throw new Error("Failed to save generated experience");
            output = `✅ Generated and saved work experience: ${data.data.title} at ${data.data.company}`;
            break;
          }

          case "experience_update": {
            const { id, ...updates } = typedArgs;
            const res = await fetch(`/api/cv/experience/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update experience");
            output = `✅ Updated work experience: ${data.title} at ${data.company}`;
            break;
          }

          case "education_list": {
            const res = await fetch("/api/cv/education");
            const data = await res.json();
            output = `Found ${data.length} education entries:
${JSON.stringify(data, null, 2)}`;
            break;
          }

          case "education_get": {
            const res = await fetch(`/api/cv/education/${typedArgs.id}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Education not found");
            output = JSON.stringify(data, null, 2);
            break;
          }

          case "education_generate": {
            const res = await fetch("/api/cv/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "education",
                institution: typedArgs.institution,
                degree: typedArgs.degree,
                description: typedArgs.description,
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to generate education");
            // Save the generated education
            const saveRes = await fetch("/api/cv/education", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data.data),
            });
            if (!saveRes.ok) throw new Error("Failed to save generated education");
            output = `✅ Generated and saved education: ${data.data.degree} at ${data.data.institution}`;
            break;
          }

          case "education_update": {
            const { id, ...updates } = typedArgs;
            const res = await fetch(`/api/cv/education/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updates),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update education");
            output = `✅ Updated education: ${data.degree} at ${data.institution}`;
            break;
          }

                    case "replicate_generate_image": {
            const res = await fetch("/api/replicate/generate-image", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                prompt: typedArgs.prompt,
                model: typedArgs.model || "black-forest-labs/flux-2-pro",
                width: typedArgs.width || 1024,
                height: typedArgs.height || 1024,
                num_outputs: typedArgs.num_outputs || 1,
                guidance_scale: typedArgs.guidance_scale,
                num_inference_steps: typedArgs.num_inference_steps,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) {
              const errorMsg = data.error || "Failed to generate image";
              const details = data.details ? `
Details: ${data.details}` : "";
              throw new Error(`${errorMsg}${details}`);
            }
            
            if (!data.images || data.images.length === 0) {
              throw new Error("No images were generated. Please try again with a different prompt.");
            }
            
            // Auto-save each generated image to Media Library
            const savedAssets: Array<{id: number, filename: string, url: string}> = [];
            for (let i = 0; i < data.images.length; i++) {
              const imageUrl = data.images[i];
              const timestamp = Date.now();
              const filename = `generated-${timestamp}-${i + 1}.png`;
              
              try {
                const saveRes = await fetch("/api/media", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    url: imageUrl,
                    filename,
                    description: `AI-generated image`,
                    prompt: String(typedArgs.prompt),
                    model: data.model,
                    tags: ["ai-generated"],
                  }),
                });
                
                if (saveRes.ok) {
                  const saveData = await saveRes.json();
                  savedAssets.push({ id: saveData.id, filename: saveData.filename, url: imageUrl });
                }
              } catch (saveErr) {
                console.error("Failed to auto-save image:", saveErr);
              }
            }
            
            // Store image URLs and saved IDs in tool state for display
            setToolStates((prev) => ({
              ...prev,
              [toolCallId]: {
                ...prev[toolCallId],
                images: data.images,
                model: data.model,
                prompt: data.prompt,
              },
            }));
            
            // Format output with saved asset info
            if (savedAssets.length > 0) {
              const assetList = savedAssets.map((a) => `• ID ${a.id}: ${a.filename}`).join("\n");
              output = `✅ Generated ${data.images.length} image(s) using ${data.model}\n\n📁 Saved to Media Library:\n${assetList}\n\nYou can edit metadata (description, tags, links) using the update_media tool with the asset ID.`;
            } else {
              const imageList = data.images.map((url: string, idx: number) => `${idx + 1}. ${url}`).join("\n");
              output = `✅ Generated ${data.images.length} image(s) using ${data.model}:\n${imageList}`;
            }
            break;
          }

          // ===== Media Storage Tools =====
          case "save_image": {
            const res = await fetch("/api/media", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                url: typedArgs.url,
                filename: typedArgs.filename,
                description: typedArgs.description,
                prompt: typedArgs.prompt,
                model: typedArgs.model,
                tags: typedArgs.tags || [],
                commit_hash: typedArgs.commit_hash,
                document_id: typedArgs.document_id,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to save image");
            
            let links = [];
            if (data.commit_hash) links.push(`Journal: ${data.commit_hash.substring(0, 7)}`);
            if (data.document_id) links.push(`Document: #${data.document_id}`);
            const linkInfo = links.length > 0 ? `\n• Linked to: ${links.join(", ")}` : "";
            
            output = `✅ Image saved to Media Library\n• ID: ${data.id}\n• Filename: ${data.filename}\n• Size: ${Math.round(data.file_size / 1024)} KB${linkInfo}`;
            break;
          }

          case "list_media": {
            const params = new URLSearchParams();
            if (typedArgs.commit_hash) params.set("commit_hash", String(typedArgs.commit_hash));
            if (typedArgs.document_id) params.set("document_id", String(typedArgs.document_id));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            
            const res = await fetch(`/api/media?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list media");
            
            if (data.assets.length === 0) {
              output = "No media assets found.";
            } else {
              const assetList = data.assets.map((a: any) => {
                const links = [];
                if (a.commit_hash) links.push(`J:${a.commit_hash.substring(0, 7)}`);
                if (a.document_id) links.push(`D:#${a.document_id}`);
                const linkStr = links.length > 0 ? ` [${links.join(", ")}]` : "";
                return `• [${a.id}] ${a.filename}${linkStr} - ${a.description || "No description"}`;
              }).join("\n");
              output = `Found ${data.total} media asset(s):\n${assetList}`;
            }
            break;
          }

          case "update_media": {
            const res = await fetch(`/api/media/${typedArgs.id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                filename: typedArgs.filename,
                description: typedArgs.description,
                tags: typedArgs.tags,
                commit_hash: typedArgs.commit_hash,
                document_id: typedArgs.document_id,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update media");
            
            let updates = [];
            if (typedArgs.description) updates.push("description");
            if (typedArgs.tags) updates.push("tags");
            if (typedArgs.commit_hash) updates.push("journal link");
            if (typedArgs.document_id) updates.push("document link");
            if (typedArgs.filename) updates.push("filename");
            
            output = `✅ Updated media asset #${typedArgs.id}\nModified: ${updates.join(", ") || "no changes"}`;
            break;
          }

          // ===== Repository Tools =====
          case "repository_list_documents": {
            const params = new URLSearchParams();
            if (typedArgs.type) params.set("type", String(typedArgs.type));
            if (typedArgs.limit) params.set("limit", String(typedArgs.limit));
            
            const res = await fetch(`/api/documents?${params.toString()}`);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list documents");
            
            if (!data.documents || data.documents.length === 0) {
              output = "No documents found.";
            } else {
              const docList = data.documents.map((d: any) => {
                const tags = d.metadata?.tags?.join(", ") || "";
                return `• [${d.id}] ${d.title} (${d.type})${tags ? ` [${tags}]` : ""}`;
              }).join("\n");
              output = `Found ${data.documents.length} document(s):\n${docList}`;
            }
            break;
          }

          case "repository_get_document": {
            let url = "/api/documents";
            if (typedArgs.id) url += `/${typedArgs.id}`;  // Now supports ID lookup
            else if (typedArgs.slug) url += `/${encodeURIComponent(String(typedArgs.slug))}`;
            else throw new Error("Either id or slug is required");

            const res = await fetch(url);
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Document not found");

            const doc = data.document || data;
            output = `**${doc.title}** (ID: ${doc.id})\nType: ${doc.type}\nSlug: ${doc.slug}\n\n${doc.content}`;
            break;
          }

          case "repository_create_document": {
            const slug = String(typedArgs.title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
            const metadata = {
              ...(typedArgs.metadata || {}),
              tags: typedArgs.tags || [],
            };
            
            const res = await fetch("/api/documents", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title: typedArgs.title,
                slug,
                type: typedArgs.type || "writing",
                content: typedArgs.content,
                metadata,
              }),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create document");
            
            output = `✅ Created document: "${typedArgs.title}"\nID: ${data.id}\nSlug: ${slug}`;
            break;
          }

          case "repository_update_document": {
            const updateData: any = {};
            if (typedArgs.title) updateData.title = typedArgs.title;
            if (typedArgs.content) updateData.content = typedArgs.content;
            if (typedArgs.tags || typedArgs.metadata) {
              updateData.metadata = {
                ...(typedArgs.metadata || {}),
                tags: typedArgs.tags,
              };
            }
            
            const res = await fetch(`/api/documents/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(updateData),
            });
            
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update document");
            
            output = `✅ Updated document #${typedArgs.id}`;
            break;
          }

          case "repository_list_skills": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list skills");
            
            let skills = data.skills || [];
            if (typedArgs.category) {
              skills = skills.filter((s: any) => s.category === typedArgs.category);
            }
            
            if (skills.length === 0) {
              output = "No skills found.";
            } else {
              const skillList = skills.map((s: any) => 
                `• ${s.name} [${s.category}] - ${s.magnitude}/5 - ${s.description || "No description"}`
              ).join("\n");
              output = `Found ${skills.length} skill(s):\n${skillList}`;
            }
            break;
          }

          case "repository_update_skill": {
            const res = await fetch(`/api/cv/skills/${typedArgs.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: typedArgs.name,
                category: typedArgs.category,
                magnitude: typedArgs.magnitude,
                description: typedArgs.description,
                tags: typedArgs.tags,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to update skill");

            output = `✅ Updated skill: ${typedArgs.id}`;
            break;
          }

          case "repository_create_skill": {
            const res = await fetch("/api/cv/skills", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                name: typedArgs.name,
                category: typedArgs.category,
                magnitude: typedArgs.magnitude,
                description: typedArgs.description,
                icon: typedArgs.icon,
                color: typedArgs.color,
                url: typedArgs.url,
                tags: typedArgs.tags || [],
                firstUsed: typedArgs.firstUsed,
                lastUsed: typedArgs.lastUsed,
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create skill");

            output = `✅ Created new skill: ${typedArgs.name} (${typedArgs.category}) - ${typedArgs.magnitude}/5`;
            break;
          }

          case "repository_list_experience": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list experience");

            const exp = data.experience || [];
            if (exp.length === 0) {
              output = "No work experience found.";
            } else {
              const expList = exp.map((e: any) =>
                `• ${e.title} at ${e.company} (${e.dateStart} - ${e.dateEnd || "Present"})\n  ${e.tagline || ""}`
              ).join("\n");
              output = `Found ${exp.length} experience(s):\n${expList}`;
            }
            break;
          }

          case "repository_create_experience": {
            const res = await fetch("/api/cv/experience", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                title: typedArgs.title,
                company: typedArgs.company,
                department: typedArgs.department,
                location: typedArgs.location,
                dateStart: typedArgs.dateStart,
                dateEnd: typedArgs.dateEnd,
                tagline: typedArgs.tagline,
                note: typedArgs.note,
                achievements: typedArgs.achievements || [],
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create experience");

            output = `✅ Created new work experience: ${typedArgs.title} at ${typedArgs.company}`;
            break;
          }

          case "repository_list_education": {
            const res = await fetch("/api/cv");
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to list education");

            const edu = data.education || [];
            if (edu.length === 0) {
              output = "No education found.";
            } else {
              const eduList = edu.map((e: any) =>
                `• ${e.degree} in ${e.field} - ${e.institution} (${e.dateStart} - ${e.dateEnd})`
              ).join("\n");
              output = `Found ${edu.length} education(s):\n${eduList}`;
            }
            break;
          }

          case "repository_create_education": {
            const res = await fetch("/api/cv/education", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: typedArgs.id,
                degree: typedArgs.degree,
                field: typedArgs.field,
                institution: typedArgs.institution,
                location: typedArgs.location,
                dateStart: typedArgs.dateStart,
                dateEnd: typedArgs.dateEnd,
                tagline: typedArgs.tagline,
                note: typedArgs.note,
                focusAreas: typedArgs.focusAreas || [],
                achievements: typedArgs.achievements || [],
              }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to create education");

            output = `✅ Created new education: ${typedArgs.degree} in ${typedArgs.field} at ${typedArgs.institution}`;
            break;
          }

          default:
            output = `Unknown tool: ${toolName}`;
        }

        setToolStates((prev) => ({
          ...prev,
          [toolCallId]: { isLoading: false, completed: true, output },
        }));
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        output = `Error: ${errorMessage}`;
        setToolStates((prev) => ({
          ...prev,
          [toolCallId]: { isLoading: false, error: errorMessage },
        }));
      }

      addToolResult({
        tool: toolName,
        toolCallId,
        output,
      });
    },
  });

  // Load conversation history
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations?limit=20");
      const data = await res.json();
      setSavedConversations(data.conversations || []);
      return data.conversations || [];
    } catch (error) {
      console.error("Failed to load conversations:", error);
      return [];
    }
  }, []);

  // On mount: check for prefill first, otherwise load most recent conversation
  useEffect(() => {
    const initChat = async () => {
      // Check for prefill FIRST (from "Edit with Kronus" buttons)
      const prefill = sessionStorage.getItem("kronusPrefill");
      if (prefill) {
        // Clear prefill and start FRESH NEW conversation with the context
        sessionStorage.removeItem("kronusPrefill");
        setMessages([]); // Clear all messages
        setCurrentConversationId(null); // No existing conversation
        setToolStates({}); // Clear any tool states
        setHasSentPrefill(true);

        // Load conversation list in background (for sidebar)
        loadConversations();

        // Send the prefill message after a brief delay to ensure state is cleared
        setTimeout(() => {
          sendMessage({ text: prefill });
        }, 150);
        return;
      }

      // No prefill - load conversations and auto-load most recent
      const conversations = await loadConversations();
      if (conversations.length > 0 && messages.length === 0 && !currentConversationId) {
        const mostRecent = conversations[0]; // Already sorted by updated_at desc
        handleLoadConversation(mostRecent.id);
      }
    };
    initChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run on mount

  // Debug: log status and messages changes
  useEffect(() => {
    console.log("[Chat Debug] Status:", status, "Messages:", messages.length, "Error:", error);
    if (messages.length > 0) {
      console.log("[Chat Debug] Last message:", messages[messages.length - 1]);
    }
  }, [status, messages, error]);

  // Auto-scroll to bottom - throttled with requestAnimationFrame
  const scrollTimeoutRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);

  useEffect(() => {
    if (scrollTimeoutRef.current) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      if (scrollRef.current) {
        // Find the actual viewport element inside Radix ScrollArea
        const viewport = scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
        if (viewport) {
          viewport.scrollTop = viewport.scrollHeight;
        }
      }
    });
    return () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, [messages.length, status]);

  // Helper to get the actual scrollable viewport inside ScrollArea
  const getScrollViewport = useCallback(() => {
    if (!scrollRef.current) return null;
    // Radix ScrollArea puts the scrollable content inside a viewport element
    return scrollRef.current.querySelector("[data-radix-scroll-area-viewport]") as HTMLElement | null;
  }, []);

  // Scroll to first message
  const scrollToFirst = useCallback(() => {
    const viewport = getScrollViewport();
    if (viewport) {
      viewport.scrollTop = 0;
    }
  }, [getScrollViewport]);

  // Scroll to last message
  const scrollToLast = useCallback(() => {
    const viewport = getScrollViewport();
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [getScrollViewport]);

  // Search messages
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (!query.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
      return;
    }

    const lowerQuery = query.toLowerCase();
    const results: number[] = [];

    messages.forEach((message, index) => {
      const textParts = message.parts
        ?.filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join(" ") || "";

      if (textParts.toLowerCase().includes(lowerQuery)) {
        results.push(index);
      }
    });

    setSearchResults(results);
    setCurrentSearchIndex(0);

    // Scroll to first result
    if (results.length > 0) {
      scrollToSearchResult(results[0]);
    }
  }, [messages]);

  // Scroll to a specific search result
  const scrollToSearchResult = useCallback((messageIndex: number) => {
    const message = messages[messageIndex];
    if (message) {
      const element = messageRefs.current.get(message.id);
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [messages]);

  // Navigate search results
  const nextSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex + 1) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  const prevSearchResult = useCallback(() => {
    if (searchResults.length === 0) return;
    const newIndex = (currentSearchIndex - 1 + searchResults.length) % searchResults.length;
    setCurrentSearchIndex(newIndex);
    scrollToSearchResult(searchResults[newIndex]);
  }, [searchResults, currentSearchIndex, scrollToSearchResult]);

  // Keyboard shortcut for search (Cmd/Ctrl + F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        setShowSearch(true);
      }
      if (e.key === "Escape" && showSearch) {
        setShowSearch(false);
        setSearchQuery("");
        setSearchResults([]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showSearch]);

  // Track if prefill was sent (used by init effect)
  const [hasSentPrefill, setHasSentPrefill] = useState(false);

  // Handle file selection and generate previews
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      // Generate previews for image files
      const previews: string[] = [];
      Array.from(files).forEach((file) => {
        if (file.type.startsWith("image/")) {
          const reader = new FileReader();
          reader.onload = (e) => {
            if (e.target?.result) {
              previews.push(e.target.result as string);
              setImagePreviews([...previews]);
            }
          };
          reader.readAsDataURL(file);
        }
      });
    }
  };

  // Remove a selected image
  const removeImage = (index: number) => {
    setImagePreviews((prev) => prev.filter((_, i) => i !== index));
    // Reset the file input if all images removed
    if (imagePreviews.length <= 1) {
      setSelectedFiles(undefined);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  // Clear all selected files
  const clearFiles = () => {
    setSelectedFiles(undefined);
    setImagePreviews([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFiles) || status === "submitted" || status === "streaming") return;

    // Lock the soul config on first message of a new conversation
    if (messages.length === 0 && !lockedSoulConfig) {
      setLockedSoulConfig(soulConfig);
    }

    // Send message with optional files
    sendMessage({
      text: input || "What do you see in this image?",
      files: selectedFiles,
    });

    // Clear input and files
    setInput("");
    clearFiles();
  };

  // Convert DB format messages to AI SDK format (restores tool invocations)
  const convertDBMessagesToAISDK = (dbMsgs: Array<{ id: string; role: string; content: string; parts?: any[] }>) => {
    // Filter out tool messages as UIMessage only accepts user/assistant/system
    return dbMsgs
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        id: m.id,
        role: m.role as "user" | "assistant" | "system",
        // Use saved parts if available, otherwise create text part
        parts: m.parts || [{ type: "text" as const, text: m.content }],
      }));
  };

  // Convert AI SDK messages to DB format
  const convertMessagesToDBFormat = (msgs: typeof messages): Array<{ id: string; role: string; content: string }> => {
    return msgs.map((m) => {
      // Extract text content from parts
      const textParts = m.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join("\n");
      return {
        id: m.id,
        role: m.role,
        content: textParts || "",
      };
    });
  };

  // Auto-save conversation when assistant completes response
  useEffect(() => {
    // Only auto-save if:
    // 1. We have messages
    // 2. Status is idle (conversation complete)
    // 3. Last message is from assistant
    // 4. We have at least one user message and one assistant message
    if (
      messages.length >= 2 &&
      status === "ready" &&
      messages[messages.length - 1]?.role === "assistant"
    ) {
      const autoSave = async () => {
        try {
          // Generate title from first user message (truncate to 50 chars)
          const firstUserMessage = messages.find((m) => m.role === "user");
          if (!firstUserMessage) return;

          const textParts = firstUserMessage.parts.filter((p: any) => p.type === "text").map((p: any) => p.text).join(" ");
          const title = textParts.substring(0, 50).trim() || "Untitled Conversation";

          const dbMessages = convertMessagesToDBFormat(messages);

          if (currentConversationId) {
            // Update existing conversation
            const res = await fetch(`/api/conversations/${currentConversationId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                messages: dbMessages,
              }),
            });
            if (res.ok) {
              loadConversations();
            }
          } else {
            // Create new conversation
            const res = await fetch("/api/conversations", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                title,
                messages: dbMessages,
              }),
            });
            const data = await res.json();
            if (res.ok) {
              setCurrentConversationId(data.id);
              loadConversations();
            }
          }
        } catch (error) {
          console.error("Failed to auto-save conversation:", error);
        }
      };

      // Debounce auto-save to avoid too frequent saves
      const timeoutId = setTimeout(autoSave, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [messages, status, currentConversationId, loadConversations]);

  const handleSaveConversation = async () => {
    if (!saveTitle.trim() || messages.length === 0) return;

    setSaving(true);
    try {
      const res = await fetch("/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: saveTitle,
          messages: convertMessagesToDBFormat(messages),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setCurrentConversationId(data.id);
        setShowSaveDialog(false);
        setSaveTitle("");
        loadConversations();
      }
    } catch (error) {
      console.error("Failed to save conversation:", error);
    } finally {
      setSaving(false);
    }
  };

  const handleLoadConversation = async (id: number) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (res.ok) {
        // Convert DB format to AI SDK format
        const convertedMessages = convertDBMessagesToAISDK(data.messages);
        setMessages(convertedMessages);
        setCurrentConversationId(id);
        setShowHistory(false);
        setToolStates({});
      }
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleNewConversation = () => {
    setMessages([]);
    setCurrentConversationId(null);
    setToolStates({});
    setShowHistory(false);
    setLockedSoulConfig(null); // Unlock config for new conversation
  };

  const handleDeleteConversation = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`/api/conversations/${id}`, { method: "DELETE" });
      loadConversations();
      if (currentConversationId === id) {
        handleNewConversation();
      }
    } catch (error) {
      console.error("Failed to delete conversation:", error);
    }
  };

  const toggleToolExpanded = (toolCallId: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolCallId)) {
        next.delete(toolCallId);
      } else {
        next.add(toolCallId);
      }
      return next;
    });
  };

  return (
    <div className="kronus-chamber flex h-full relative">
      {/* Conversation History Sidebar */}
      {showHistory && (
        <div className="kronus-sidebar flex w-64 flex-col z-10">
          <div className="flex items-center justify-between border-b p-3">
            <h3 className="text-sm font-semibold">Saved Chats</h3>
            <Button variant="ghost" size="sm" onClick={handleNewConversation}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="space-y-1 p-2">
              {savedConversations.length === 0 ? (
                <p className="text-[var(--kronus-ivory-muted)] p-3 text-xs text-center italic">No saved conversations yet</p>
              ) : (
                savedConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => handleLoadConversation(conv.id)}
                    className={cn(
                      "kronus-sidebar-item group flex cursor-pointer items-center justify-between p-2",
                      currentConversationId === conv.id && "active"
                    )}
                  >
                    <div className="min-w-0 flex-1 overflow-wrap-anywhere break-words">
                      <p className="truncate text-sm font-medium">{conv.title}</p>
                      <p className="text-muted-foreground text-xs">
                        {new Date(conv.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100"
                      onClick={(e) => handleDeleteConversation(conv.id, e)}
                    >
                      <Trash2 className="text-destructive h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col">
        {/* Toolbar */}
        <div className="kronus-toolbar flex items-center gap-2 px-4 py-2 z-10">
          <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
            <History className="mr-1 h-4 w-4" />
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={handleNewConversation}>
            <Plus className="mr-1 h-4 w-4" />
            New
          </Button>
          {/* Soul Config - always editable, affects next new chat */}
          <SoulConfig
            config={soulConfig}
            onChange={setSoulConfig}
          />
          <div className="flex-1" />
          {messages.length > 0 && (
            <>
              {/* Search toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSearch(!showSearch)}
                className={showSearch ? "bg-[var(--kronus-surface)]" : ""}
              >
                <Search className="mr-1 h-4 w-4" />
                Search
              </Button>
              {/* Jump to first */}
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToFirst}
                title="Jump to first message"
              >
                <ChevronUp className="h-4 w-4" />
              </Button>
              {/* Jump to last */}
              <Button
                variant="ghost"
                size="sm"
                onClick={scrollToLast}
                title="Jump to last message"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const firstTextPart = messages[0]?.parts?.find(
                    (p): p is { type: "text"; text: string } => p.type === "text"
                  );
                  setSaveTitle(firstTextPart?.text?.substring(0, 50) || "Untitled");
                  setShowSaveDialog(true);
                }}
              >
                <Save className="mr-1 h-4 w-4" />
                Save Chat
              </Button>
            </>
          )}
        </div>

        {/* Search Bar */}
        {showSearch && (
          <div className="flex items-center gap-2 px-4 py-2 bg-[var(--kronus-surface)] border-b border-[var(--kronus-border)]">
            <Search className="h-4 w-4 text-[var(--kronus-ivory-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search messages... (Esc to close)"
              className="flex-1 h-8 bg-[var(--kronus-void)] border-[var(--kronus-border)] text-sm"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (e.shiftKey) {
                    prevSearchResult();
                  } else {
                    nextSearchResult();
                  }
                }
              }}
            />
            {searchResults.length > 0 && (
              <span className="text-xs text-[var(--kronus-ivory-muted)] whitespace-nowrap">
                {currentSearchIndex + 1} of {searchResults.length}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={prevSearchResult} disabled={searchResults.length === 0}>
              <ArrowUp className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="sm" onClick={nextSearchResult} disabled={searchResults.length === 0}>
              <ArrowDown className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowSearch(false);
                setSearchQuery("");
                setSearchResults([]);
              }}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        {/* Messages Area */}
        <ScrollArea className="flex-1 z-10" ref={scrollRef}>
          <div className="mx-auto max-w-3xl space-y-4 p-4">
            {messages.length === 0 && (
              <div className="kronus-message p-6">
                <div className="flex items-start gap-4">
                  <div className="kronus-avatar flex h-12 w-12 shrink-0 items-center justify-center rounded-full overflow-hidden p-0">
                    <img src="/chronus-logo.png" alt="Kronus" className="h-full w-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-xl text-gradient-teal-gold">
                      Kronus — Oracle of Tartarus
                    </h3>
                    <p className="text-[var(--kronus-ivory-dim)] mt-3 leading-relaxed">
                      Greetings, seeker. I am <span className="text-[var(--kronus-teal)] font-medium">Kronus</span>, keeper of the Developer Journal and guardian of your coding journey.
                    </p>
                    <p className="text-[var(--kronus-ivory-muted)] mt-2 leading-relaxed text-sm">
                      I can help you create and modify journal entries, explore your development history,
                      access your repository of writings and skills, generate images, and manage Linear issues.
                      What wisdom do you seek today?
                    </p>
                    <div className="mt-4 space-y-2 text-xs">
                      <p className="text-[var(--kronus-ivory-muted)]">
                        📜 <strong className="text-[var(--kronus-ivory)]">Journal:</strong> I'll manage entries automatically
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        🔗 <strong className="text-[var(--kronus-ivory)]">Linear:</strong> I'll show you a draft first and await your approval
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        📚 <strong className="text-[var(--kronus-ivory)]">Repository:</strong> Access your writings, prompts, skills, and experience
                      </p>
                      <p className="text-[var(--kronus-ivory-muted)]">
                        🎨 <strong className="text-[var(--kronus-ivory)]">Illustrations:</strong> Create images with FLUX.2 Pro
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {messages.map((message, messageIndex) => {
              const isSearchMatch = searchResults.includes(messageIndex);
              const isCurrentSearchResult = searchResults[currentSearchIndex] === messageIndex;

              return (
              <div
                key={message.id}
                className="space-y-2"
                ref={(el) => {
                  if (el) messageRefs.current.set(message.id, el);
                }}
              >
                <div
                  className={cn(
                    "p-3 overflow-visible rounded-xl transition-all",
                    message.role === "user" ? "user-message ml-12" : "kronus-message",
                    isSearchMatch && "ring-2 ring-[var(--kronus-teal)]/50",
                    isCurrentSearchResult && "ring-2 ring-[var(--kronus-gold)] bg-[var(--kronus-gold)]/5"
                  )}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden",
                        message.role === "user" ? "user-avatar" : "kronus-avatar p-0"
                      )}
                    >
                      {message.role === "user" ? (
                        <User className="h-5 w-5 text-white" />
                      ) : (
                        <img src="/chronus-logo.png" alt="Kronus" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1 overflow-wrap-anywhere break-words">
                      <p className={cn(
                        "mb-1 text-sm font-semibold",
                        message.role === "user" ? "text-[var(--kronus-gold)]" : "text-[var(--kronus-teal)]"
                      )}>
                        {message.role === "user" ? "You" : "Kronus"}
                      </p>
                      <div className="prose prose-sm dark:prose-invert max-w-none text-sm break-words overflow-wrap-anywhere">
                        {message.parts?.map((part, i) => {
                          // Render image/file parts
                          if (part.type === "file" && (part as any).mediaType?.startsWith("image/")) {
                            return (
                              <div key={i} className="mb-3">
                                <img
                                  src={(part as any).url}
                                  alt={(part as any).filename || "Attached image"}
                                  className="max-w-full max-h-96 rounded-lg border border-[var(--kronus-border)] object-contain"
                                />
                              </div>
                            );
                          }
                          if (part.type === "text") {
                            // Check if this is the last message and still streaming
                            const isLastMessage = message.id === messages[messages.length - 1]?.id;
                            const isStreaming = status === "streaming" && message.role === "assistant" && isLastMessage;

                            // Use simple text during streaming, full markdown when complete
                            if (isStreaming) {
                              return <StreamingText key={i} text={part.text} />;
                            }
                            return <MemoizedMarkdown key={i} text={part.text} />;
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                {message.parts
                  ?.filter((part) => part.type.startsWith("tool-"))
                  .map((part: any) => {
                    const toolName = part.type.replace("tool-", "");
                    const toolCallId = part.toolCallId;
                    const state = toolStates[toolCallId];
                    const isExpanded = expandedTools.has(toolCallId);

                    return (
                      <div
                        key={toolCallId}
                        className={cn(
                          "tool-invocation ml-12 p-3 mt-2",
                          state?.completed && "success"
                        )}
                      >
                        <button
                          onClick={() => toggleToolExpanded(toolCallId)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          {state?.isLoading ? (
                            <Loader2 className="text-primary h-4 w-4 animate-spin" />
                          ) : state?.error ? (
                            <AlertCircle className="text-destructive h-4 w-4" />
                          ) : state?.completed ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <Wrench className="text-muted-foreground h-4 w-4" />
                          )}
                          <span className="flex-1 font-mono text-sm">{toolName}</span>
                          <Badge variant="outline" className="text-xs bg-[var(--kronus-surface)] border-[var(--kronus-border)] text-[var(--kronus-ivory-muted)]">
                            {state?.isLoading
                              ? "Running..."
                              : state?.error
                                ? "Error"
                                : state?.completed
                                  ? "Done"
                                  : "Pending"}
                          </Badge>
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </button>

                        {isExpanded && (
                          <div className="mt-3 space-y-2">
                            <div>
                              <p className="text-muted-foreground mb-1 text-xs">Input:</p>
                              <pre className="bg-background max-h-32 overflow-auto rounded p-2 text-xs">
                                {JSON.stringify(part.input, null, 2)}
                              </pre>
                            </div>
                            {/* Display images if available */}
                            {state?.images && state.images.length > 0 && (
                              <div>
                                <p className="text-muted-foreground mb-2 text-xs">Generated Images:</p>
                                <div className="grid grid-cols-1 gap-2">
                                  {state.images.map((imageUrl: string, idx: number) => (
                                    <div key={idx} className="relative rounded-lg border overflow-hidden group">
                                      <img
                                        src={imageUrl}
                                        alt={`Generated image ${idx + 1}`}
                                        className="w-full h-auto max-h-96 object-contain"
                                        onError={(e) => {
                                          (e.target as HTMLImageElement).style.display = "none";
                                        }}
                                      />
                                      <div className="absolute top-2 right-2 flex gap-1">
                                        <a
                                          href={imageUrl}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="bg-black/50 hover:bg-black/70 text-white text-xs px-2 py-1 rounded"
                                        >
                                          Open
                                        </a>
                                        <button
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            const filename = `generated-${Date.now()}-${idx + 1}.png`;
                                            try {
                                              const res = await fetch("/api/media", {
                                                method: "POST",
                                                headers: { "Content-Type": "application/json" },
                                                body: JSON.stringify({
                                                  url: imageUrl,
                                                  filename,
                                                  description: state.prompt ? `Generated: ${state.prompt}` : "AI Generated Image",
                                                  prompt: state.prompt,
                                                  model: state.model,
                                                  destination: "media",
                                                }),
                                              });
                                              const data = await res.json();
                                              if (res.ok) {
                                                alert(`✅ Saved to media library (ID: ${data.id})`);
                                              } else {
                                                alert(`❌ Failed: ${data.error}`);
                                              }
                                            } catch (err: any) {
                                              alert(`❌ Error: ${err.message}`);
                                            }
                                          }}
                                          className="bg-green-600/80 hover:bg-green-600 text-white text-xs px-2 py-1 rounded"
                                        >
                                          💾 Save
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                {state.prompt && (
                                  <p className="text-muted-foreground mt-2 text-xs italic">
                                    Prompt: "{state.prompt}"
                                  </p>
                                )}
                                {state.model && (
                                  <p className="text-muted-foreground text-xs">
                                    Model: {state.model}
                                  </p>
                                )}
                              </div>
                            )}
                            {(part.output || state?.result || state?.error) && (
                              <div>
                                <p className="text-muted-foreground mb-1 text-xs">
                                  {state?.error ? "Error:" : "Result:"}
                                </p>
                                <pre
                                  className={cn(
                                    "max-h-48 overflow-auto rounded p-2 text-xs border",
                                    state?.error
                                      ? "bg-red-900/20 border-red-900/50 text-red-300"
                                      : "bg-[var(--kronus-void)] border-[var(--kronus-border)] text-[var(--kronus-ivory-dim)]"
                                  )}
                                >
                                  {state?.error || part.output || state?.result}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            );
            })}

            {(status === "submitted" || status === "streaming") && (
              <div className="kronus-message p-4">
                <div className="flex items-start gap-3">
                  <div className="kronus-avatar flex h-10 w-10 shrink-0 items-center justify-center rounded-full overflow-hidden p-0">
                    <img src="/chronus-logo.png" alt="Kronus" className="h-full w-full object-cover" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="kronus-thinking">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                    <span className="text-[var(--kronus-ivory-muted)] text-sm">
                      {status === "submitted" ? "Consulting the oracle..." : "Kronus is weaving wisdom..."}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input Area */}
        <div className="kronus-input-area p-4 z-10">
          <form onSubmit={handleSubmit} className="mx-auto max-w-3xl">
            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                {imagePreviews.map((preview, index) => (
                  <div key={index} className="relative group">
                    <img
                      src={preview}
                      alt={`Preview ${index + 1}`}
                      className="h-20 w-20 object-cover rounded-lg border-2 border-[var(--kronus-border)]"
                    />
                    <button
                      type="button"
                      onClick={() => removeImage(index)}
                      className="absolute -top-2 -right-2 h-5 w-5 rounded-full bg-red-500 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3 items-end">
              {/* Hidden file input */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileSelect}
                accept="image/*"
                multiple
                className="hidden"
              />

              {/* Image upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="kronus-image-btn flex h-[60px] w-12 items-center justify-center rounded-lg border border-[var(--kronus-border)] bg-[var(--kronus-void)] text-[var(--kronus-ivory-muted)] hover:text-[var(--kronus-teal)] hover:border-[var(--kronus-teal)] transition-colors"
                disabled={status === "submitted" || status === "streaming"}
                title="Attach images"
              >
                <ImagePlus className="h-5 w-5" />
              </button>

              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={imagePreviews.length > 0 ? "Ask about the image(s)..." : "Speak your query to the oracle..."}
                className="kronus-input max-h-[200px] min-h-[60px] resize-none px-4 py-3"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                disabled={status === "submitted" || status === "streaming"}
              />
              <button
                type="submit"
                className="kronus-send-btn"
                disabled={(!input.trim() && !selectedFiles) || status === "submitted" || status === "streaming"}
              >
                {(status === "submitted" || status === "streaming") ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Send className="h-5 w-5" />
                )}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Save Dialog */}
      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save Conversation</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={saveTitle}
              onChange={(e) => setSaveTitle(e.target.value)}
              placeholder="Enter a title for this conversation"
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveConversation} disabled={saving || !saveTitle.trim()}>
              {saving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
