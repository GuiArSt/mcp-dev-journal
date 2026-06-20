"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Briefcase,
  Calendar,
  Check,
  Clock,
  FileText,
  Link as LinkIcon,
  LayoutGrid,
  Loader2,
  Mail,
  MessageSquareText,
  Plus,
  Search,
  Send,
  Table2,
  Target,
  Upload,
  Wand2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const STATUSES = [
  "saved",
  "drafting",
  "applied",
  "screening",
  "interviewing",
  "take_home",
  "offer",
  "rejected",
  "withdrawn",
  "archived",
] as const;

const STATUS_LABELS: Record<string, string> = {
  saved: "Saved",
  drafting: "Drafting",
  applied: "Applied",
  screening: "Screening",
  interviewing: "Interviewing",
  take_home: "Take-home",
  offer: "Offer",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
  archived: "Archived",
};

const ARTIFACT_TYPES = ["cv", "cover_letter", "portfolio", "case_study", "certificate", "other"] as const;
const CHANNELS = ["email", "linkedin", "phone", "sms", "video_call", "in_person", "note", "other"] as const;
const DIRECTIONS = ["inbound", "outbound", "internal_note"] as const;

type Status = (typeof STATUSES)[number];
type ApplicationView = "board" | "table";

type ApplicationListItem = {
  id: number;
  status: Status;
  priority: "low" | "medium" | "high";
  fit_score: number | null;
  applied_at: string | null;
  follow_up_at: string | null;
  notes: string | null;
  position: {
    id: number;
    title: string;
    location: string | null;
    work_mode: string | null;
    source_url: string | null;
  };
  company: {
    id: number;
    name: string;
    industry: string | null;
    location: string | null;
  };
  communication_count: number;
  artifact_count: number;
  open_task_count: number;
};

type ArtemisDetail = {
  application: {
    id: number;
    position_id: number;
    status: Status;
    priority: "low" | "medium" | "high";
    fit_score: number | null;
    applied_at: string | null;
    deadline_at: string | null;
    follow_up_at: string | null;
    last_activity_at: string | null;
    source: string | null;
    contact_name: string | null;
    contact_email: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
  };
  company: {
    id: number;
    name: string;
    website: string | null;
    industry: string | null;
    size: string | null;
    headquarters: string | null;
    location: string | null;
    linkedin_url: string | null;
    description: string | null;
    notes: string | null;
    tags: string[];
  };
  position: {
    id: number;
    company_id: number;
    title: string;
    department: string | null;
    employment_type: string | null;
    seniority: string | null;
    location: string | null;
    work_mode: string;
    source_url: string | null;
    source_platform: string | null;
    salary_min: number | null;
    salary_max: number | null;
    salary_currency: string | null;
    benefits: string[];
    responsibilities: string[];
    requirements: string[];
    nice_to_have: string[];
    raw_posting_text: string | null;
  };
  artifacts: Array<{
    id: number;
    artifact_type: string;
    document_id: number | null;
    media_asset_id: number | null;
    label: string | null;
    sent_at: string | null;
    notes: string | null;
    document_title?: string | null;
    document_slug?: string | null;
    media_filename?: string | null;
  }>;
  communications: Array<{
    id: number;
    channel: string;
    direction: string;
    contact_name: string | null;
    contact_email: string | null;
    subject: string | null;
    raw_text: string | null;
    summary: string | null;
    occurred_at: string;
    next_action: string | null;
    next_action_due_at: string | null;
  }>;
  tasks: Array<{
    id: number;
    title: string;
    description: string | null;
    due_at: string | null;
    status: string;
  }>;
};

type ArtemisDraft = {
  company: {
    name: string;
    website?: string | null;
    industry?: string | null;
    size?: string | null;
    headquarters?: string | null;
    location?: string | null;
    linkedin_url?: string | null;
    description?: string | null;
    notes?: string | null;
    tags: string[];
  };
  position: {
    title: string;
    department?: string | null;
    employment_type?: string | null;
    seniority?: string | null;
    location?: string | null;
    work_mode: "remote" | "hybrid" | "onsite" | "unknown";
    source_url?: string | null;
    source_platform?: string | null;
    salary_min?: number | null;
    salary_max?: number | null;
    salary_currency?: string | null;
    benefits: string[];
    responsibilities: string[];
    requirements: string[];
    nice_to_have: string[];
    raw_posting_text?: string | null;
    extracted_data: Record<string, unknown>;
  };
  application: {
    status: Status;
    priority: "low" | "medium" | "high";
    fit_score?: number | null;
    deadline_at?: string | null;
    follow_up_at?: string | null;
    source?: string | null;
    contact_name?: string | null;
    contact_email?: string | null;
    notes?: string | null;
  };
};

type CommunicationDraft = {
  channel: (typeof CHANNELS)[number];
  direction: (typeof DIRECTIONS)[number];
  contact_name?: string | null;
  contact_email?: string | null;
  subject?: string | null;
  raw_text?: string | null;
  summary?: string | null;
  occurred_at?: string | null;
  next_action?: string | null;
  next_action_due_at?: string | null;
};

type DocumentOption = {
  id: number;
  title: string;
  slug: string;
  type: string;
};

type MediaOption = {
  id: number;
  filename: string;
  mime_type: string;
  description: string | null;
};

type ArtemisChatProposal = {
  summary?: string | null;
  application_patch?: Record<string, unknown> | null;
  company_patch?: Record<string, unknown> | null;
  position_patch?: Record<string, unknown> | null;
  communication?: CommunicationDraft | null;
  task?: {
    title: string;
    description?: string | null;
    due_at?: string | null;
  } | null;
  new_application?: (Partial<ArtemisDraft> & {
    company_id?: number;
    position_id?: number;
  }) | null;
  artifact_searches?: Array<{
    artifact_type: string;
    query: string;
    reason?: string | null;
  }>;
  questions?: string[];
};

type ArtemisChatResponse = {
  reply: string;
  confidence: "low" | "medium" | "high";
  proposal: ArtemisChatProposal;
};

function emptyDraft(): ArtemisDraft {
  return {
    company: { name: "", tags: [] },
    position: {
      title: "",
      work_mode: "unknown",
      benefits: [],
      responsibilities: [],
      requirements: [],
      nice_to_have: [],
      extracted_data: {},
    },
    application: {
      status: "saved",
      priority: "medium",
    },
  };
}

function compactDate(value?: string | null) {
  if (!value) return "Not set";
  return value.slice(0, 10);
}

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function joinLines(value?: string[] | null) {
  return (value ?? []).join("\n");
}

function statusTone(status: string) {
  if (["offer", "interviewing", "screening"].includes(status)) return "border-[var(--tartarus-teal)] text-[var(--tartarus-teal)]";
  if (["rejected", "withdrawn"].includes(status)) return "border-red-500/40 text-red-300";
  if (status === "archived") return "border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]";
  return "border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]";
}

function hasPatch(value?: Record<string, unknown> | null) {
  return !!value && Object.keys(value).length > 0;
}

function hasProposalMutation(proposal?: ArtemisChatProposal | null) {
  if (!proposal) return false;
  return Boolean(
    hasPatch(proposal.application_patch) ||
      hasPatch(proposal.company_patch) ||
      hasPatch(proposal.position_patch) ||
      proposal.communication ||
      proposal.task ||
      proposal.new_application
  );
}

export default function ArtemisPage() {
  const [applications, setApplications] = useState<ApplicationListItem[]>([]);
  const [detail, setDetail] = useState<ArtemisDetail | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loadingList, setLoadingList] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applicationView, setApplicationView] = useState<ApplicationView>("board");

  const [jobDialogOpen, setJobDialogOpen] = useState(false);
  const [jobText, setJobText] = useState("");
  const [draft, setDraft] = useState<ArtemisDraft>(emptyDraft());
  const [extractingJob, setExtractingJob] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);

  const [communicationDialogOpen, setCommunicationDialogOpen] = useState(false);
  const [communicationText, setCommunicationText] = useState("");
  const [communicationDraft, setCommunicationDraft] = useState<CommunicationDraft>({
    channel: "note",
    direction: "internal_note",
  });
  const [extractingCommunication, setExtractingCommunication] = useState(false);
  const [savingCommunication, setSavingCommunication] = useState(false);

  const [artifactDialogOpen, setArtifactDialogOpen] = useState(false);
  const [artifactType, setArtifactType] = useState<(typeof ARTIFACT_TYPES)[number]>("cv");
  const [artifactNotes, setArtifactNotes] = useState("");
  const [documents, setDocuments] = useState<DocumentOption[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaOption[]>([]);
  const [documentSearch, setDocumentSearch] = useState("");
  const [savingArtifact, setSavingArtifact] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatResponse, setChatResponse] = useState<ArtemisChatResponse | null>(null);
  const [chatLoading, setChatLoading] = useState(false);
  const [applyingProposal, setApplyingProposal] = useState(false);

  const groupedApplications = useMemo(() => {
    const groups = new Map<string, ApplicationListItem[]>();
    for (const status of STATUSES) groups.set(status, []);
    for (const application of applications) {
      groups.get(application.status)?.push(application);
    }
    return groups;
  }, [applications]);

  const fetchApplications = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "100", offset: "0" });
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/artemis/applications?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load Artemis applications");
      setApplications(data.applications || []);
      if (!selectedId && data.applications?.[0]) {
        setSelectedId(data.applications[0].id);
      }
      if (selectedId && !data.applications?.some((item: ApplicationListItem) => item.id === selectedId)) {
        setSelectedId(data.applications?.[0]?.id ?? null);
      }
    } catch (err: any) {
      setError(err.message || "Failed to load Artemis");
    } finally {
      setLoadingList(false);
    }
  }, [search, selectedId, statusFilter]);

  const fetchDetail = useCallback(async (id: number) => {
    setLoadingDetail(true);
    setError(null);
    try {
      const response = await fetch(`/api/artemis/applications/${id}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to load application");
      setDetail(data);
    } catch (err: any) {
      setError(err.message || "Failed to load application");
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  useEffect(() => {
    if (selectedId) {
      fetchDetail(selectedId);
    } else {
      setDetail(null);
    }
  }, [fetchDetail, selectedId]);

  useEffect(() => {
    if (!artifactDialogOpen) return;
    const load = async () => {
      const params = new URLSearchParams({ limit: "20", offset: "0" });
      if (documentSearch.trim()) params.set("search", documentSearch.trim());
      const [docsResponse, mediaResponse] = await Promise.all([
        fetch(`/api/documents?${params.toString()}`),
        fetch("/api/media?limit=20&offset=0"),
      ]);
      const docsData = await docsResponse.json();
      const mediaData = await mediaResponse.json();
      setDocuments(docsData.documents || []);
      setMediaAssets(mediaData.assets || []);
    };
    load().catch((err) => setError(err.message || "Failed to load artifacts"));
  }, [artifactDialogOpen, documentSearch]);

  const updateApplicationStatus = async (status: Status) => {
    if (!detail) return;
    const response = await fetch(`/api/artemis/applications/${detail.application.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error || "Failed to update status");
      return;
    }
    setDetail(data);
    fetchApplications();
  };

  const extractJobPosting = async () => {
    if (!jobText.trim()) return;
    setExtractingJob(true);
    setError(null);
    try {
      const response = await fetch("/api/artemis/extract/job-posting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: jobText }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to extract job post");
      setDraft(data.draft);
    } catch (err: any) {
      setError(err.message || "Failed to extract job post");
    } finally {
      setExtractingJob(false);
    }
  };

  const saveDraft = async () => {
    setSavingDraft(true);
    setError(null);
    try {
      const response = await fetch("/api/artemis/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create application");
      setJobDialogOpen(false);
      setJobText("");
      setDraft(emptyDraft());
      setSelectedId(data.application.id);
      await fetchApplications();
      setDetail(data);
    } catch (err: any) {
      setError(err.message || "Failed to create application");
    } finally {
      setSavingDraft(false);
    }
  };

  const openBlankDraft = () => {
    setDraft(emptyDraft());
    setJobText("");
    setJobDialogOpen(true);
  };

  const extractCommunication = async () => {
    if (!communicationText.trim()) return;
    setExtractingCommunication(true);
    setError(null);
    try {
      const response = await fetch("/api/artemis/extract/communication", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: communicationText, channel: communicationDraft.channel }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to extract communication");
      setCommunicationDraft(data.draft);
    } catch (err: any) {
      setError(err.message || "Failed to extract communication");
    } finally {
      setExtractingCommunication(false);
    }
  };

  const saveCommunication = async () => {
    if (!detail) return;
    setSavingCommunication(true);
    setError(null);
    try {
      const payload = {
        ...communicationDraft,
        raw_text: communicationDraft.raw_text || communicationText,
        summary: communicationDraft.summary || communicationText.slice(0, 220),
      };
      const response = await fetch(`/api/artemis/applications/${detail.application.id}/communications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save communication");
      setDetail(data);
      setCommunicationDialogOpen(false);
      setCommunicationText("");
      setCommunicationDraft({ channel: "note", direction: "internal_note" });
      fetchApplications();
    } catch (err: any) {
      setError(err.message || "Failed to save communication");
    } finally {
      setSavingCommunication(false);
    }
  };

  const attachArtifact = async (kind: "document" | "media", id: number, label: string) => {
    if (!detail) return;
    setSavingArtifact(true);
    setError(null);
    try {
      const response = await fetch(`/api/artemis/applications/${detail.application.id}/artifacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          artifact_type: artifactType,
          document_id: kind === "document" ? id : null,
          media_asset_id: kind === "media" ? id : null,
          label,
          notes: artifactNotes,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to attach artifact");
      setDetail(data);
      setArtifactDialogOpen(false);
      setArtifactNotes("");
      fetchApplications();
    } catch (err: any) {
      setError(err.message || "Failed to attach artifact");
    } finally {
      setSavingArtifact(false);
    }
  };

  const sendArtemisChat = async () => {
    if (!chatInput.trim()) return;
    setChatLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/artemis/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: chatInput,
          application_id: detail?.application.id ?? selectedId ?? null,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Artemis could not process that update");
      setChatResponse(data);
    } catch (err: any) {
      setError(err.message || "Artemis could not process that update");
    } finally {
      setChatLoading(false);
    }
  };

  const applyChatProposal = async () => {
    const proposal = chatResponse?.proposal;
    if (!proposal || !hasProposalMutation(proposal)) return;
    setApplyingProposal(true);
    setError(null);
    try {
      if (proposal.new_application && !detail) {
        const response = await fetch("/api/artemis/applications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposal.new_application),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to create proposed application");
        setSelectedId(data.application.id);
        setDetail(data);
        await fetchApplications();
      } else if (detail) {
        const response = await fetch(`/api/artemis/applications/${detail.application.id}/apply-proposal`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(proposal),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to apply proposal");
        setDetail(data);
        await fetchApplications();
      } else {
        throw new Error("Select an application or ask Artemis to draft a new one from a job post.");
      }
      setChatInput("");
      setChatResponse(null);
    } catch (err: any) {
      setError(err.message || "Failed to apply proposal");
    } finally {
      setApplyingProposal(false);
    }
  };

  return (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col bg-[var(--tartarus-void)] text-[var(--tartarus-ivory)]">
      <header className="flex flex-col gap-3 border-b border-[var(--tartarus-border)] px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm text-[var(--tartarus-gold)]">
            <Target className="h-4 w-4" />
            Artemis
          </div>
          <h1 className="text-2xl font-semibold tracking-normal text-[var(--tartarus-ivory)]">
            Job Hunter
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search roles or companies"
              className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] pl-8 text-[var(--tartarus-ivory)]"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </header>

      {error && (
        <div className="border-b border-red-500/30 bg-red-950/30 px-5 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <section className="border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]/70 p-5">
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.8fr)]">
          <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-[var(--tartarus-gold)]">
                  <Bot className="h-4 w-4" />
                  Artemis Intake
                </div>
                <p className="mt-1 text-sm text-[var(--tartarus-ivory-muted)]">
                  {detail ? `${detail.position.title} at ${detail.company.name}` : "No application selected"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
                  onClick={openBlankDraft}
                >
                  <Plus className="h-4 w-4" />
                  New
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
                  onClick={() => {
                    setDraft(emptyDraft());
                    setJobDialogOpen(true);
                  }}
                >
                  <Upload className="h-4 w-4" />
                  Job Post
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
                  disabled={!detail}
                  onClick={() => setCommunicationDialogOpen(true)}
                >
                  <MessageSquareText className="h-4 w-4" />
                  Manual Note
                </Button>
              </div>
            </div>
            <Textarea
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              placeholder="Puke the latest here: recruiter email, status change, interview notes, follow-up, job post..."
              className="mt-4 min-h-[170px] resize-none border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] text-sm"
            />
            <div className="mt-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="text-xs text-[var(--tartarus-ivory-muted)]">
                Artemis reads the selected application and compact CV context, then proposes reviewable changes.
              </div>
              <Button
                className="gap-2 bg-[var(--tartarus-teal)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-teal)]/90"
                disabled={!chatInput.trim() || chatLoading}
                onClick={sendArtemisChat}
              >
                {chatLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                Chug
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[var(--tartarus-ivory)]">Review Queue</p>
                <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">
                  Nothing writes until the proposal is applied.
                </p>
              </div>
              {chatResponse && (
                <Badge variant="outline" className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]">
                  {chatResponse.confidence}
                </Badge>
              )}
            </div>
            {chatResponse ? (
              <div className="mt-3 space-y-3">
                <p className="text-sm leading-6 text-[var(--tartarus-ivory-dim)]">{chatResponse.reply}</p>
                <div className="max-h-[230px] overflow-y-auto pr-1">
                  <ProposalPreview proposal={chatResponse.proposal} />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[var(--tartarus-border)]"
                    onClick={() => setChatResponse(null)}
                  >
                    Discard
                  </Button>
                  <Button
                    size="sm"
                    className="gap-2 bg-[var(--tartarus-gold)] text-[var(--tartarus-void)] hover:bg-[var(--tartarus-gold)]/90"
                    disabled={!hasProposalMutation(chatResponse.proposal) || applyingProposal}
                    onClick={applyChatProposal}
                  >
                    {applyingProposal ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    Apply
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mt-4 flex min-h-[220px] items-center justify-center rounded-md border border-dashed border-[var(--tartarus-border)] p-4 text-center text-sm text-[var(--tartarus-ivory-muted)]">
                Paste an update and Artemis will turn it into application edits, timeline notes, tasks, or a new application draft.
              </div>
            )}
          </div>
        </div>
      </section>

      <main className="grid min-h-[720px] flex-1 grid-cols-1 lg:grid-cols-[420px_minmax(0,1fr)_360px]">
        <aside className="min-h-0 border-b border-[var(--tartarus-border)] lg:border-b-0 lg:border-r">
          <ScrollArea className="h-full">
            <div className="space-y-4 p-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--tartarus-ivory)]">Applications</p>
                  <p className="text-xs text-[var(--tartarus-ivory-muted)]">{applications.length} tracked</p>
                </div>
                <div className="flex rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-8 px-2",
                      applicationView === "board" && "bg-[var(--tartarus-surface)] text-[var(--tartarus-gold)]"
                    )}
                    onClick={() => setApplicationView("board")}
                    aria-label="Board view"
                  >
                    <LayoutGrid className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className={cn(
                      "h-8 px-2",
                      applicationView === "table" && "bg-[var(--tartarus-surface)] text-[var(--tartarus-gold)]"
                    )}
                    onClick={() => setApplicationView("table")}
                    aria-label="Table view"
                  >
                    <Table2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              {loadingList ? (
                <div className="flex items-center gap-2 text-sm text-[var(--tartarus-ivory-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading applications
                </div>
              ) : applications.length === 0 ? (
                <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
                  <p className="text-sm font-medium text-[var(--tartarus-ivory)]">No applications yet</p>
                  <p className="mt-1 text-sm text-[var(--tartarus-ivory-muted)]">
                    Paste a job post to create the first tracked application.
                  </p>
                  <Button
                    className="mt-4 w-full gap-2 bg-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
                    onClick={() => setJobDialogOpen(true)}
                  >
                    <Upload className="h-4 w-4" />
                    Paste Job Post
                  </Button>
                </div>
              ) : applicationView === "table" ? (
                <ApplicationTable
                  applications={applications}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                />
              ) : (
                STATUSES.map((status) => {
                  const items = groupedApplications.get(status) ?? [];
                  if (items.length === 0 && statusFilter !== "all") return null;
                  return (
                    <section key={status} className="space-y-2">
                      <div className="flex items-center justify-between text-xs uppercase text-[var(--tartarus-ivory-muted)]">
                        <span>{STATUS_LABELS[status]}</span>
                        <span>{items.length}</span>
                      </div>
                      {items.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setSelectedId(item.id)}
                          className={cn(
                            "w-full rounded-md border p-3 text-left transition-colors",
                            selectedId === item.id
                              ? "border-[var(--tartarus-teal)] bg-[var(--tartarus-teal)]/10"
                              : "border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] hover:border-[var(--tartarus-gold-dim)]"
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-[var(--tartarus-ivory)]">
                                {item.position.title}
                              </p>
                              <p className="truncate text-xs text-[var(--tartarus-ivory-muted)]">
                                {item.company.name}
                              </p>
                            </div>
                            <Badge variant="outline" className={cn("shrink-0", statusTone(item.status))}>
                              {STATUS_LABELS[item.status]}
                            </Badge>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2 text-xs text-[var(--tartarus-ivory-muted)]">
                            <span>{item.position.location || item.company.location || "Location unknown"}</span>
                            <span>{item.artifact_count} files</span>
                            <span>{item.communication_count} notes</span>
                          </div>
                        </button>
                      ))}
                    </section>
                  );
                })
              )}
            </div>
          </ScrollArea>
        </aside>

        <section className="min-h-0 border-b border-[var(--tartarus-border)] lg:border-b-0 lg:border-r">
          <ScrollArea className="h-full">
            <div className="p-5">
              {loadingDetail ? (
                <div className="flex items-center gap-2 text-sm text-[var(--tartarus-ivory-muted)]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading detail
                </div>
              ) : !detail ? (
                <div className="flex min-h-[420px] items-center justify-center rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
                  <div className="max-w-sm text-center">
                    <Briefcase className="mx-auto h-8 w-8 text-[var(--tartarus-gold)]" />
                    <p className="mt-3 text-sm text-[var(--tartarus-ivory-muted)]">
                      Select an application or create one from a job post.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-col gap-3 rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4 md:flex-row md:items-start md:justify-between">
                    <div className="min-w-0">
                      <h2 className="text-xl font-semibold tracking-normal">{detail.position.title}</h2>
                      <p className="mt-1 text-sm text-[var(--tartarus-ivory-muted)]">
                        {detail.company.name}
                        {detail.position.location ? ` · ${detail.position.location}` : ""}
                        {detail.position.work_mode ? ` · ${detail.position.work_mode}` : ""}
                      </p>
                      {detail.position.source_url && (
                        <a
                          href={detail.position.source_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--tartarus-teal)]"
                        >
                          <LinkIcon className="h-3.5 w-3.5" />
                          Source
                        </a>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Select
                        value={detail.application.status}
                        onValueChange={(value) => updateApplicationStatus(value as Status)}
                      >
                        <SelectTrigger className="w-[160px] border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((status) => (
                            <SelectItem key={status} value={status}>
                              {STATUS_LABELS[status]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        variant="outline"
                        className="gap-2 border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
                        onClick={() => setCommunicationDialogOpen(true)}
                      >
                        <MessageSquareText className="h-4 w-4" />
                        Paste Communication
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2 border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
                        onClick={() => setArtifactDialogOpen(true)}
                      >
                        <FileText className="h-4 w-4" />
                        Attach Document
                      </Button>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <Metric icon={Calendar} label="Applied" value={compactDate(detail.application.applied_at)} />
                    <Metric icon={Clock} label="Follow-up" value={compactDate(detail.application.follow_up_at)} />
                    <Metric icon={Target} label="Fit score" value={detail.application.fit_score == null ? "Not scored" : `${detail.application.fit_score}/100`} />
                  </div>

                  <InfoBlock title="Company">
                    <div className="grid gap-3 text-sm md:grid-cols-2">
                      <Field label="Industry" value={detail.company.industry} />
                      <Field label="Location" value={detail.company.location || detail.company.headquarters} />
                      <Field label="Size" value={detail.company.size} />
                      <Field label="Website" value={detail.company.website} />
                    </div>
                    {detail.company.description && (
                      <p className="mt-3 text-sm leading-6 text-[var(--tartarus-ivory-dim)]">
                        {detail.company.description}
                      </p>
                    )}
                  </InfoBlock>

                  <InfoBlock title="Position Details">
                    <div className="grid gap-3 text-sm md:grid-cols-3">
                      <Field label="Department" value={detail.position.department} />
                      <Field label="Employment" value={detail.position.employment_type} />
                      <Field label="Seniority" value={detail.position.seniority} />
                    </div>
                    {(detail.position.salary_min || detail.position.salary_max) && (
                      <p className="mt-3 text-sm text-[var(--tartarus-ivory-dim)]">
                        Salary: {detail.position.salary_min ?? "?"}-{detail.position.salary_max ?? "?"}{" "}
                        {detail.position.salary_currency ?? ""}
                      </p>
                    )}
                  </InfoBlock>

                  <div className="grid gap-4 xl:grid-cols-2">
                    <ListBlock title="Responsibilities" items={detail.position.responsibilities} />
                    <ListBlock title="Requirements" items={detail.position.requirements} />
                    <ListBlock title="Benefits" items={detail.position.benefits} />
                    <ListBlock title="Nice to have" items={detail.position.nice_to_have} />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </section>

        <aside className="min-h-0">
          <ScrollArea className="h-full">
            <div className="space-y-5 p-5">
              <PanelTitle icon={FileText} title="Sent Artifacts" count={detail?.artifacts.length ?? 0} />
              {detail?.artifacts.length ? (
                <div className="space-y-2">
                  {detail.artifacts.map((artifact) => (
                    <div key={artifact.id} className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                          {artifact.artifact_type.replace("_", " ")}
                        </Badge>
                        <span className="text-xs text-[var(--tartarus-ivory-muted)]">
                          {compactDate(artifact.sent_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm text-[var(--tartarus-ivory)]">
                        {artifact.label || artifact.document_title || artifact.media_filename || "Artifact"}
                      </p>
                      {artifact.notes && <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">{artifact.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine text="No CV, letter, portfolio, or media artifacts attached yet." />
              )}

              <PanelTitle icon={MessageSquareText} title="Timeline" count={detail?.communications.length ?? 0} />
              {detail?.communications.length ? (
                <div className="space-y-2">
                  {detail.communications.map((communication) => (
                    <div key={communication.id} className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm text-[var(--tartarus-ivory)]">
                          <Mail className="h-4 w-4 text-[var(--tartarus-teal)]" />
                          {communication.subject || communication.channel}
                        </div>
                        <span className="text-xs text-[var(--tartarus-ivory-muted)]">
                          {compactDate(communication.occurred_at)}
                        </span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-[var(--tartarus-ivory-dim)]">
                        {communication.summary || communication.raw_text || "No summary"}
                      </p>
                      {communication.next_action && (
                        <div className="mt-2 rounded border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] px-2 py-1 text-xs text-[var(--tartarus-gold)]">
                          Next: {communication.next_action}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine text="No recruiter messages or notes logged yet." />
              )}

              <PanelTitle icon={Check} title="Open Tasks" count={detail?.tasks.filter((task) => task.status === "open").length ?? 0} />
              {detail?.tasks.length ? (
                <div className="space-y-2">
                  {detail.tasks.map((task) => (
                    <div key={task.id} className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-[var(--tartarus-ivory)]">{task.title}</p>
                        <Badge variant="outline" className="border-[var(--tartarus-border)] text-[var(--tartarus-ivory-muted)]">
                          {task.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">Due {compactDate(task.due_at)}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyLine text="No follow-ups created." />
              )}
            </div>
          </ScrollArea>
        </aside>
      </main>

      <Dialog open={jobDialogOpen} onOpenChange={setJobDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory)]">
          <DialogHeader>
            <DialogTitle>Application Draft</DialogTitle>
            <DialogDescription>Paste a job post for extraction or fill the draft manually.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
            <div className="space-y-3">
              <Label>Job post text</Label>
              <Textarea
                value={jobText}
                onChange={(event) => setJobText(event.target.value)}
                placeholder="Paste the job description here"
                className="min-h-[360px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              />
              <Button
                variant="outline"
                className="w-full gap-2 border-[var(--tartarus-border)]"
                disabled={!jobText.trim() || extractingJob}
                onClick={extractJobPosting}
              >
                {extractingJob ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
                Extract Draft
              </Button>
            </div>
            <div className="space-y-4">
              <DraftEditor draft={draft} onChange={setDraft} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setJobDialogOpen(false)}>
              Discard
            </Button>
            <Button
              className="gap-2 bg-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
              disabled={!draft.company.name.trim() || !draft.position.title.trim() || savingDraft}
              onClick={saveDraft}
            >
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Save Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={communicationDialogOpen} onOpenChange={setCommunicationDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory)]">
          <DialogHeader>
            <DialogTitle>Communication</DialogTitle>
            <DialogDescription>Paste email, LinkedIn, SMS, call notes, or your own note.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={communicationText}
              onChange={(event) => setCommunicationText(event.target.value)}
              placeholder="Paste communication text"
              className="min-h-[180px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
            />
            <div className="grid gap-3 md:grid-cols-3">
              <Select
                value={communicationDraft.channel}
                onValueChange={(value) => setCommunicationDraft((prev) => ({ ...prev, channel: value as CommunicationDraft["channel"] }))}
              >
                <SelectTrigger className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CHANNELS.map((channel) => (
                    <SelectItem key={channel} value={channel}>
                      {channel.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select
                value={communicationDraft.direction}
                onValueChange={(value) => setCommunicationDraft((prev) => ({ ...prev, direction: value as CommunicationDraft["direction"] }))}
              >
                <SelectTrigger className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIRECTIONS.map((direction) => (
                    <SelectItem key={direction} value={direction}>
                      {direction.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={communicationDraft.occurred_at ?? ""}
                onChange={(event) => setCommunicationDraft((prev) => ({ ...prev, occurred_at: event.target.value }))}
                placeholder="Occurred at"
                className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              />
            </div>
            <Input
              value={communicationDraft.subject ?? ""}
              onChange={(event) => setCommunicationDraft((prev) => ({ ...prev, subject: event.target.value }))}
              placeholder="Subject"
              className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
            />
            <Textarea
              value={communicationDraft.summary ?? ""}
              onChange={(event) => setCommunicationDraft((prev) => ({ ...prev, summary: event.target.value }))}
              placeholder="Summary"
              className="min-h-[90px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <Input
                value={communicationDraft.next_action ?? ""}
                onChange={(event) => setCommunicationDraft((prev) => ({ ...prev, next_action: event.target.value }))}
                placeholder="Next action"
                className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              />
              <Input
                value={communicationDraft.next_action_due_at ?? ""}
                onChange={(event) => setCommunicationDraft((prev) => ({ ...prev, next_action_due_at: event.target.value }))}
                placeholder="Next action due"
                className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" disabled={!communicationText.trim() || extractingCommunication} onClick={extractCommunication}>
              {extractingCommunication ? <Loader2 className="h-4 w-4 animate-spin" /> : <Target className="h-4 w-4" />}
              Extract
            </Button>
            <Button
              className="gap-2 bg-[var(--tartarus-teal)] text-[var(--tartarus-void)]"
              disabled={savingCommunication || (!communicationText.trim() && !communicationDraft.summary?.trim())}
              onClick={saveCommunication}
            >
              {savingCommunication ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={artifactDialogOpen} onOpenChange={setArtifactDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory)]">
          <DialogHeader>
            <DialogTitle>Attach Artifact</DialogTitle>
            <DialogDescription>CVs and letters should be Library documents. Use media for binary assets.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <Select value={artifactType} onValueChange={(value) => setArtifactType(value as typeof artifactType)}>
                <SelectTrigger className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ARTIFACT_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {type.replace("_", " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                value={artifactNotes}
                onChange={(event) => setArtifactNotes(event.target.value)}
                placeholder="Notes"
                className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
              />
            </div>
            <Input
              value={documentSearch}
              onChange={(event) => setDocumentSearch(event.target.value)}
              placeholder="Search Library documents"
              className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
            />
            <div className="grid gap-4 md:grid-cols-2">
              <ArtifactColumn title="Documents">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    disabled={savingArtifact}
                    className="w-full rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 text-left hover:border-[var(--tartarus-teal)]"
                    onClick={() => attachArtifact("document", doc.id, doc.title)}
                  >
                    <p className="text-sm text-[var(--tartarus-ivory)]">{doc.title}</p>
                    <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">{doc.type} · {doc.slug}</p>
                  </button>
                ))}
              </ArtifactColumn>
              <ArtifactColumn title="Media">
                {mediaAssets.map((asset) => (
                  <button
                    key={asset.id}
                    disabled={savingArtifact}
                    className="w-full rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 text-left hover:border-[var(--tartarus-teal)]"
                    onClick={() => attachArtifact("media", asset.id, asset.filename)}
                  >
                    <p className="text-sm text-[var(--tartarus-ivory)]">{asset.filename}</p>
                    <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">{asset.mime_type}</p>
                  </button>
                ))}
              </ArtifactColumn>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatProposalValue(value: unknown): string {
  if (value == null) return "clear";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "empty";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function PatchPreview({ title, patch }: { title: string; patch?: Record<string, unknown> | null }) {
  if (!hasPatch(patch)) return null;
  const entries = Object.entries(patch ?? {});
  return (
    <div className="space-y-1 rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2">
      <p className="text-xs font-medium uppercase text-[var(--tartarus-ivory-muted)]">{title}</p>
      {entries.map(([key, value]) => (
        <div key={key} className="grid grid-cols-[96px_minmax(0,1fr)] gap-2 text-xs">
          <span className="truncate text-[var(--tartarus-ivory-muted)]">{key}</span>
          <span className="min-w-0 break-words text-[var(--tartarus-ivory-dim)]">
            {formatProposalValue(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function ProposalPreview({ proposal }: { proposal: ArtemisChatProposal }) {
  return (
    <div className="space-y-2">
      {proposal.summary && (
        <p className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2 text-xs leading-5 text-[var(--tartarus-ivory-dim)]">
          {proposal.summary}
        </p>
      )}
      <PatchPreview title="Application" patch={proposal.application_patch} />
      <PatchPreview title="Company" patch={proposal.company_patch} />
      <PatchPreview title="Position" patch={proposal.position_patch} />
      {proposal.communication && (
        <div className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2">
          <p className="text-xs font-medium uppercase text-[var(--tartarus-ivory-muted)]">Communication</p>
          <p className="mt-1 text-xs text-[var(--tartarus-ivory-dim)]">
            {proposal.communication.subject || proposal.communication.channel} · {proposal.communication.direction}
          </p>
          {(proposal.communication.summary || proposal.communication.raw_text) && (
            <p className="mt-1 line-clamp-4 text-xs leading-5 text-[var(--tartarus-ivory-muted)]">
              {proposal.communication.summary || proposal.communication.raw_text}
            </p>
          )}
        </div>
      )}
      {proposal.task && (
        <div className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2">
          <p className="text-xs font-medium uppercase text-[var(--tartarus-ivory-muted)]">Task</p>
          <p className="mt-1 text-xs text-[var(--tartarus-ivory-dim)]">
            {proposal.task.title}
            {proposal.task.due_at ? ` · ${proposal.task.due_at}` : ""}
          </p>
        </div>
      )}
      {proposal.new_application && (
        <div className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2">
          <p className="text-xs font-medium uppercase text-[var(--tartarus-ivory-muted)]">New Application</p>
          <p className="mt-1 text-xs text-[var(--tartarus-ivory-dim)]">
            {proposal.new_application.position?.title || "Untitled role"} ·{" "}
            {proposal.new_application.company?.name || "Unknown company"}
          </p>
        </div>
      )}
      {proposal.artifact_searches?.length ? (
        <div className="rounded border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-2">
          <p className="text-xs font-medium uppercase text-[var(--tartarus-ivory-muted)]">Artifact Hints</p>
          {proposal.artifact_searches.map((search, index) => (
            <p key={`${search.artifact_type}-${index}`} className="mt-1 text-xs text-[var(--tartarus-ivory-dim)]">
              {search.artifact_type}: {search.query}
            </p>
          ))}
        </div>
      ) : null}
      {proposal.questions?.length ? (
        <div className="rounded border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-gold-soft)] p-2">
          <p className="text-xs font-medium uppercase text-[var(--tartarus-gold)]">Questions</p>
          {proposal.questions.map((question, index) => (
            <p key={index} className="mt-1 text-xs leading-5 text-[var(--tartarus-gold)]">
              {question}
            </p>
          ))}
        </div>
      ) : null}
      {!hasProposalMutation(proposal) && !proposal.questions?.length && (
        <EmptyLine text="No writeable changes proposed." />
      )}
    </div>
  );
}

function DraftEditor({ draft, onChange }: { draft: ArtemisDraft; onChange: (draft: ArtemisDraft) => void }) {
  const setCompany = (patch: Partial<ArtemisDraft["company"]>) =>
    onChange({ ...draft, company: { ...draft.company, ...patch } });
  const setPosition = (patch: Partial<ArtemisDraft["position"]>) =>
    onChange({ ...draft, position: { ...draft.position, ...patch } });
  const setApplication = (patch: Partial<ArtemisDraft["application"]>) =>
    onChange({ ...draft, application: { ...draft.application, ...patch } });

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <LabeledInput label="Company" value={draft.company.name} onChange={(value) => setCompany({ name: value })} />
        <LabeledInput label="Website" value={draft.company.website ?? ""} onChange={(value) => setCompany({ website: value })} />
        <LabeledInput label="Industry" value={draft.company.industry ?? ""} onChange={(value) => setCompany({ industry: value })} />
        <LabeledInput label="Company location" value={draft.company.location ?? ""} onChange={(value) => setCompany({ location: value })} />
      </div>
      <LabeledTextarea label="Company description" value={draft.company.description ?? ""} onChange={(value) => setCompany({ description: value })} />

      <div className="grid gap-3 md:grid-cols-2">
        <LabeledInput label="Position" value={draft.position.title} onChange={(value) => setPosition({ title: value })} />
        <LabeledInput label="Role location" value={draft.position.location ?? ""} onChange={(value) => setPosition({ location: value })} />
        <LabeledInput label="Source URL" value={draft.position.source_url ?? ""} onChange={(value) => setPosition({ source_url: value })} />
        <div className="space-y-1.5">
          <Label>Work mode</Label>
          <Select
            value={draft.position.work_mode}
            onValueChange={(value) => setPosition({ work_mode: value as ArtemisDraft["position"]["work_mode"] })}
          >
            <SelectTrigger className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unknown">unknown</SelectItem>
              <SelectItem value="remote">remote</SelectItem>
              <SelectItem value="hybrid">hybrid</SelectItem>
              <SelectItem value="onsite">onsite</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <LabeledTextarea
          label="Responsibilities"
          value={joinLines(draft.position.responsibilities)}
          onChange={(value) => setPosition({ responsibilities: splitLines(value) })}
        />
        <LabeledTextarea
          label="Requirements"
          value={joinLines(draft.position.requirements)}
          onChange={(value) => setPosition({ requirements: splitLines(value) })}
        />
        <LabeledTextarea
          label="Benefits"
          value={joinLines(draft.position.benefits)}
          onChange={(value) => setPosition({ benefits: splitLines(value) })}
        />
        <LabeledTextarea
          label="Nice to have"
          value={joinLines(draft.position.nice_to_have)}
          onChange={(value) => setPosition({ nice_to_have: splitLines(value) })}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select
            value={draft.application.status}
            onValueChange={(value) => setApplication({ status: value as Status })}
          >
            <SelectTrigger className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <LabeledInput label="Deadline" value={draft.application.deadline_at ?? ""} onChange={(value) => setApplication({ deadline_at: value })} />
        <LabeledInput label="Follow-up" value={draft.application.follow_up_at ?? ""} onChange={(value) => setApplication({ follow_up_at: value })} />
      </div>
      <LabeledTextarea label="Application notes" value={draft.application.notes ?? ""} onChange={(value) => setApplication({ notes: value })} />
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
      />
    </div>
  );
}

function LabeledTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-[90px] border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]"
      />
    </div>
  );
}

function Metric({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3">
      <div className="flex items-center gap-2 text-xs uppercase text-[var(--tartarus-ivory-muted)]">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-2 text-sm font-medium text-[var(--tartarus-ivory)]">{value}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs uppercase text-[var(--tartarus-ivory-muted)]">{label}</p>
      <p className="mt-1 text-[var(--tartarus-ivory-dim)]">{value || "Not set"}</p>
    </div>
  );
}

function InfoBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--tartarus-ivory)]">{title}</h3>
      {children}
    </section>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
      <h3 className="mb-3 text-sm font-semibold text-[var(--tartarus-ivory)]">{title}</h3>
      {items.length ? (
        <ul className="space-y-2 text-sm leading-6 text-[var(--tartarus-ivory-dim)]">
          {items.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-[var(--tartarus-ivory-muted)]">Not stated</p>
      )}
    </section>
  );
}

function ApplicationTable({
  applications,
  selectedId,
  onSelect,
}: {
  applications: ApplicationListItem[];
  selectedId: number | null;
  onSelect: (id: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
      <div className="min-w-[620px]">
        <div className="grid grid-cols-[1.2fr_1fr_110px_90px_92px] gap-2 border-b border-[var(--tartarus-border)] px-3 py-2 text-xs uppercase text-[var(--tartarus-ivory-muted)]">
          <span>Role</span>
          <span>Company</span>
          <span>Status</span>
          <span>Follow-up</span>
          <span>Signals</span>
        </div>
        {applications.map((application) => (
          <button
            key={application.id}
            onClick={() => onSelect(application.id)}
            className={cn(
              "grid w-full grid-cols-[1.2fr_1fr_110px_90px_92px] gap-2 border-b border-[var(--tartarus-border)] px-3 py-2 text-left text-sm last:border-b-0 hover:bg-[var(--tartarus-surface)]",
              selectedId === application.id && "bg-[var(--tartarus-teal)]/10"
            )}
          >
            <span className="min-w-0">
              <span className="block truncate text-[var(--tartarus-ivory)]">{application.position.title}</span>
              <span className="block truncate text-xs text-[var(--tartarus-ivory-muted)]">
                {application.position.location || application.company.location || "Location unknown"}
              </span>
            </span>
            <span className="min-w-0 truncate text-[var(--tartarus-ivory-dim)]">{application.company.name}</span>
            <span>
              <Badge variant="outline" className={cn("max-w-full", statusTone(application.status))}>
                {STATUS_LABELS[application.status]}
              </Badge>
            </span>
            <span className="text-xs text-[var(--tartarus-ivory-muted)]">
              {compactDate(application.follow_up_at)}
            </span>
            <span className="text-xs text-[var(--tartarus-ivory-muted)]">
              {application.artifact_count}F · {application.communication_count}C · {application.open_task_count}T
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function PanelTitle({ icon: Icon, title, count }: { icon: any; title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--tartarus-ivory)]">
        <Icon className="h-4 w-4 text-[var(--tartarus-gold)]" />
        {title}
      </div>
      <span className="text-xs text-[var(--tartarus-ivory-muted)]">{count}</span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-[var(--tartarus-border)] p-3 text-sm text-[var(--tartarus-ivory-muted)]">
      {text}
    </div>
  );
}

function ArtifactColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-[var(--tartarus-ivory)]">{title}</p>
      <div className="max-h-[280px] space-y-2 overflow-y-auto pr-1">{children}</div>
    </div>
  );
}
