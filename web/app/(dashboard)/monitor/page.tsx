"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  CheckCircle,
  Activity,
  FileText,
  Sparkles,
  Brain,
  Languages,
  ScrollText,
  Settings as SettingsIcon,
  Database,
  Wrench,
  Layers,
  GitBranch,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ActiveRequest {
  id: string;
  endpoint: string;
  mode?: string;
  model?: string;
  startedAt: string;
  elapsedMs: number;
  metadata: Record<string, unknown>;
}

interface PromptDefaultMeta {
  slug: string;
  name: string;
  category: string;
  description: string;
}

interface PromptSlugInfo {
  slug: string;
  activeVersion: number;
  label: string;
  updatedAt: string;
}

interface PromptVersion {
  id: number;
  promptSlug: string;
  version: number;
  content: string;
  config: Record<string, unknown>;
  label: string;
  createdAt: string;
  createdBy: string;
}

interface MuseConfig {
  provider: string;
  driverModel: string;
  painterModel: string;
  observeModel: string;
  tickEvery: number;
  moodSize: string;
  infographicSize: string;
  moodQuality: string;
  infographicQuality: string;
  updatedAt: string;
}

interface KronusStats {
  writings: number;
  writingsTokens: number;
  portfolioProjects: number;
  portfolioProjectsTokens: number;
  skills: number;
  skillsTokens: number;
  workExperience: number;
  workExperienceTokens: number;
  education: number;
  educationTokens: number;
  journalEntries: number;
  journalEntriesTokens: number;
  chatIndex: number;
  chatIndexTokens: number;
  chatIndexIncluded: number;
  chatIndexMissingSummaries: number;
  linear?: {
    projects: { total: number; active: number; completed: number; tokensActive: number; tokensAll: number };
    issues: { total: number; active: number; completed: number; tokensActive: number; tokensAll: number };
  };
  linearProjects: number;
  linearProjectsTokens: number;
  linearIssues: number;
  linearIssuesTokens: number;
  baseTokens: number;
  totalTokens: number;
  totalTokensWithCompleted: number;
}

interface SkillConfigMap {
  soul?: Record<string, boolean>;
  tools?: Record<string, boolean>;
  icon?: string;
  color?: string;
  priority?: number;
}

interface KronusSkillInfo {
  id: number;
  slug: string;
  title: string;
  description: string;
  icon: string;
  color: string;
  priority: number;
  config: SkillConfigMap;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatElapsed(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function formatInt(n: number | null | undefined) {
  return Math.round(n ?? 0).toLocaleString();
}

function tokenLabel(n: number | null | undefined) {
  const value = n ?? 0;
  if (value >= 1000) return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}k`;
  return String(Math.round(value));
}

const CATEGORY_META: Record<string, { label: string; icon: React.ComponentType<{ size?: number }>; tone: string }> = {
  kronus:    { label: "Kronus",    icon: Brain,        tone: "#c4a36b" },
  muse:      { label: "Muse",      icon: Sparkles,     tone: "#d4af9e" },
  summarize: { label: "Summarize", icon: ScrollText,   tone: "#9bb59f" },
  atropos:   { label: "Atropos",   icon: FileText,     tone: "#a89bb5" },
  hermes:    { label: "Hermes",    icon: Languages,    tone: "#9bb5b3" },
  daimon:    { label: "Daimon",    icon: SettingsIcon, tone: "#b59b9b" },
  cv:        { label: "CV",        icon: FileText,     tone: "#bba79b" },
  athena:    { label: "Athena",    icon: Brain,        tone: "#9ba6b5" },
  other:     { label: "Other",     icon: SettingsIcon, tone: "#888" },
};

const ENDPOINT_LABELS: Record<string, string> = {
  muse: "Muse (image)",
  summarize: "Summarize",
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = "prompts" | "muse" | "context" | "live";

export default function ControlPanelPage() {
  const [tab, setTab] = useState<Tab>("prompts");

  return (
    <div className="cp-root">
      <div className="cp-header">
        <div className="cp-header-text">
          <h1 className="cp-title">AI Control Panel</h1>
          <p className="cp-subtitle">Edit prompts and tune the agents — no redeploys.</p>
        </div>
        <nav className="cp-header-tabs">
          {(["prompts", "muse", "context", "live"] as Tab[]).map((t) => (
            <button
              key={t}
              className={`cp-tab${tab === t ? " cp-tab-active" : ""}`}
              onClick={() => setTab(t)}
              type="button"
            >
              {t === "live" ? "Live" : t === "prompts" ? "Prompts" : t === "context" ? "Context" : "Muse"}
            </button>
          ))}
        </nav>
      </div>

      <div className="cp-body">
        {tab === "prompts" && <PromptsTab />}
        {tab === "muse" && <MuseTab />}
        {tab === "context" && <ContextTab />}
        {tab === "live" && <LiveTab />}
      </div>
    </div>
  );
}

// ─── Prompts Tab ─────────────────────────────────────────────────────────────

interface DbRow {
  id: number;
  slug: string;
  version: number;
  label: string;
  createdAt: string;
  createdBy: string;
  contentPreview: string;
  contentLength: number;
  isActive: boolean;
}

function PromptsTab() {
  const [defaults, setDefaults] = useState<PromptDefaultMeta[]>([]);
  const [seeded, setSeeded] = useState<PromptSlugInfo[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [activeVersion, setActiveVersion] = useState<PromptVersion | null>(null);
  const [history, setHistory] = useState<PromptVersion[]>([]);
  const [editContent, setEditContent] = useState("");
  const [saveLabel, setSaveLabel] = useState("draft");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingSlug, setLoadingSlug] = useState(false);
  const [bootstrapped, setBootstrapped] = useState(false);

  // DB browser state
  const [dbOpen, setDbOpen] = useState(false);
  const [dbRows, setDbRows] = useState<DbRow[]>([]);
  const [dbTotal, setDbTotal] = useState(0);
  const [dbSlugFilter, setDbSlugFilter] = useState("");
  const [dbLabelFilter, setDbLabelFilter] = useState("");
  const [dbLoading, setDbLoading] = useState(false);

  const fetchDb = useCallback(async () => {
    setDbLoading(true);
    try {
      const params = new URLSearchParams();
      if (dbSlugFilter) params.set("slug", dbSlugFilter);
      if (dbLabelFilter) params.set("label", dbLabelFilter);
      params.set("limit", "100");
      const res = await fetch(`/api/control-panel/db?${params.toString()}`);
      if (res.ok) {
        const j = await res.json();
        setDbRows(j.rows ?? []);
        setDbTotal(j.total ?? 0);
      }
    } finally {
      setDbLoading(false);
    }
  }, [dbSlugFilter, dbLabelFilter]);

  // Refetch when filters change OR drawer opens
  useEffect(() => {
    if (dbOpen) fetchDb();
  }, [dbOpen, fetchDb]);

  const refreshSidebar = useCallback(async () => {
    const slugRes = await fetch("/api/control-panel/prompts");
    if (slugRes.ok) setSeeded((await slugRes.json()).prompts ?? []);
  }, []);

  const selectSlug = useCallback(async (slug: string) => {
    setActiveSlug(slug);
    setLoadingSlug(true);
    setError(null);
    setSavedMsg(null);
    setDirty(false);
    try {
      const [activeRes, historyRes] = await Promise.all([
        fetch(`/api/control-panel/prompts/${slug}`),
        fetch(`/api/control-panel/prompts/${slug}/history`),
      ]);
      if (!activeRes.ok) throw new Error(`load ${activeRes.status}`);
      const active: PromptVersion = await activeRes.json();
      const histData = historyRes.ok ? await historyRes.json() : { history: [] };
      setActiveVersion(active);
      setHistory(histData.history ?? []);
      setEditContent(active.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "failed");
    } finally {
      setLoadingSlug(false);
    }
  }, []);

  // Bootstrap + load slug list on mount
  useEffect(() => {
    (async () => {
      try {
        await fetch("/api/control-panel/bootstrap", { method: "POST" });
        const [defRes, slugRes] = await Promise.all([
          fetch("/api/control-panel/bootstrap"),
          fetch("/api/control-panel/prompts"),
        ]);
        const defJson = defRes.ok ? await defRes.json() : { defaults: [] };
        const slugJson = slugRes.ok ? await slugRes.json() : { prompts: [] };
        const defs: PromptDefaultMeta[] = defJson.defaults ?? [];
        const slugs: PromptSlugInfo[] = slugJson.prompts ?? [];
        setDefaults(defs);
        setSeeded(slugs);
        setBootstrapped(true);
        if (defs.length > 0) selectSlug(defs[0].slug);
      } catch {
        setError("Failed to load prompts");
        setBootstrapped(true);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(async () => {
    if (!activeSlug || !editContent.trim()) return;
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/control-panel/prompts/${activeSlug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editContent, label: saveLabel }),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      const { version } = await res.json();
      setSavedMsg(`Saved as v${version} (${saveLabel}) — now active`);
      setDirty(false);
      const [histRes, activeRes] = await Promise.all([
        fetch(`/api/control-panel/prompts/${activeSlug}/history`),
        fetch(`/api/control-panel/prompts/${activeSlug}`),
      ]);
      if (histRes.ok) setHistory((await histRes.json()).history ?? []);
      if (activeRes.ok) setActiveVersion(await activeRes.json());
      await refreshSidebar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }, [activeSlug, editContent, saveLabel, refreshSidebar]);

  const activate = useCallback(async (version: number) => {
    if (!activeSlug) return;
    setActivating(version);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch(`/api/control-panel/prompts/${activeSlug}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version }),
      });
      if (!res.ok) throw new Error(`activate ${res.status}`);
      setSavedMsg(`v${version} is now active`);
      const activeRes = await fetch(`/api/control-panel/prompts/${activeSlug}`);
      if (activeRes.ok) {
        const av: PromptVersion = await activeRes.json();
        setActiveVersion(av);
        setEditContent(av.content);
        setDirty(false);
      }
      await refreshSidebar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "activate failed");
    } finally {
      setActivating(null);
    }
  }, [activeSlug, refreshSidebar]);

  // Group defaults by category
  const grouped = useMemo(() => {
    const m: Record<string, PromptDefaultMeta[]> = {};
    for (const d of defaults) {
      (m[d.category] ?? (m[d.category] = [])).push(d);
    }
    return m;
  }, [defaults]);

  const seededMap = useMemo(() => {
    const m = new Map<string, PromptSlugInfo>();
    for (const s of seeded) m.set(s.slug, s);
    return m;
  }, [seeded]);

  if (!bootstrapped) {
    return <div className="cp-spinner-center"><Loader2 className="animate-spin" size={20} /></div>;
  }

  const activeDef = defaults.find((d) => d.slug === activeSlug);

  return (
    <div className="cp-prompts">
      {/* ─── Sidebar: prompts grouped by category ─── */}
      <aside className="cp-prompts-rail">
        {Object.keys(grouped).map((cat) => {
          const meta = CATEGORY_META[cat] ?? CATEGORY_META.other;
          const Icon = meta.icon;
          return (
            <div key={cat} className="cp-cat-group">
              <div className="cp-cat-header">
                <Icon size={11} />
                <span style={{ color: meta.tone }}>{meta.label}</span>
              </div>
              {grouped[cat].map((d) => {
                const info = seededMap.get(d.slug);
                const isActive = activeSlug === d.slug;
                return (
                  <button
                    key={d.slug}
                    className={`cp-prompt-item${isActive ? " cp-prompt-item-active" : ""}`}
                    onClick={() => selectSlug(d.slug)}
                    type="button"
                    title={d.description}
                  >
                    <span className="cp-prompt-item-name">{d.name.replace(/^[^·]+ ·\s*/, "")}</span>
                    {info && (
                      <span className={`cp-prompt-item-meta cp-label-${info.label}`}>
                        v{info.activeVersion}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </aside>

      {/* ─── Main: editor ─── */}
      <section className="cp-editor">
        {!activeSlug ? (
          <div className="cp-empty">Select a prompt on the left to edit.</div>
        ) : (
          <>
            <div className="cp-editor-header">
              <div className="cp-editor-titlebox">
                <h2 className="cp-editor-title">{activeDef?.name ?? activeSlug}</h2>
                <p className="cp-editor-desc">{activeDef?.description}</p>
              </div>
              {activeVersion && (
                <div className="cp-editor-active">
                  <span className="cp-editor-version">v{activeVersion.version}</span>
                  <span className={`cp-editor-label cp-label-${activeVersion.label}`}>
                    {activeVersion.label}
                  </span>
                  {dirty && <span className="cp-editor-dirty">● unsaved</span>}
                </div>
              )}
            </div>

            {loadingSlug ? (
              <div className="cp-spinner-center"><Loader2 className="animate-spin" size={18} /></div>
            ) : (
              <textarea
                className="cp-textarea"
                value={editContent}
                onChange={(e) => { setEditContent(e.target.value); setDirty(true); setSavedMsg(null); }}
                spellCheck={false}
                placeholder="(empty — first call from a route will seed)"
              />
            )}

            <div className="cp-editor-actions">
              <select className="cp-select" value={saveLabel} onChange={(e) => setSaveLabel(e.target.value)}>
                <option value="draft">draft</option>
                <option value="staging">staging</option>
                <option value="production">production</option>
              </select>
              <Button size="sm" onClick={save} disabled={saving || loadingSlug || !dirty}>
                {saving && <Loader2 className="animate-spin mr-1" size={13} />}
                Save new version
              </Button>
              {savedMsg && (
                <span className="cp-saved-msg">
                  <CheckCircle size={13} />
                  {savedMsg}
                </span>
              )}
              {error && <span className="cp-error-msg">{error}</span>}
            </div>

            {/* Version history strip */}
            {history.length > 1 && (
              <div className="cp-history-strip">
                <span className="cp-history-strip-label">history</span>
                {history.map((v) => {
                  const isCurrent = activeVersion?.version === v.version;
                  return (
                    <button
                      key={v.id}
                      className={`cp-history-chip${isCurrent ? " cp-history-chip-current" : ""}`}
                      onClick={() => !isCurrent && activate(v.version)}
                      disabled={isCurrent || activating !== null}
                      type="button"
                      title={`v${v.version} · ${v.label} · ${formatDate(v.createdAt)}`}
                    >
                      <span className="cp-history-chip-v">v{v.version}</span>
                      <span className={`cp-history-chip-label cp-label-${v.label}`}>{v.label}</span>
                      {activating === v.version && <Loader2 size={10} className="animate-spin" />}
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── DB browser drawer ── */}
        <div className={`cp-db-drawer${dbOpen ? " cp-db-drawer-open" : ""}`}>
          <button
            className="cp-db-handle"
            onClick={() => setDbOpen((o) => !o)}
            type="button"
          >
            <span>{dbOpen ? "▾" : "▸"} DB · ai_prompt_versions</span>
            <span className="cp-db-handle-meta">
              {dbOpen ? `${dbRows.length} of ${dbTotal} rows` : "browse all rows"}
            </span>
          </button>

          {dbOpen && (
            <div className="cp-db-panel">
              <div className="cp-db-filters">
                <input
                  className="cp-input cp-input-sm"
                  placeholder="filter by slug…"
                  value={dbSlugFilter}
                  onChange={(e) => setDbSlugFilter(e.target.value)}
                  style={{ width: 160 }}
                />
                <select
                  className="cp-select"
                  value={dbLabelFilter}
                  onChange={(e) => setDbLabelFilter(e.target.value)}
                >
                  <option value="">all labels</option>
                  <option value="production">production</option>
                  <option value="staging">staging</option>
                  <option value="draft">draft</option>
                </select>
                <button className="cp-db-refresh" onClick={fetchDb} type="button" disabled={dbLoading}>
                  {dbLoading ? <Loader2 size={12} className="animate-spin" /> : "refresh"}
                </button>
                <span className="cp-footnote" style={{ marginLeft: "auto" }}>
                  {dbTotal} total
                </span>
              </div>
              <div className="cp-db-table">
                <div className="cp-db-row cp-db-row-head">
                  <span style={{ flex: "0 0 26px" }}></span>
                  <span style={{ flex: 2 }}>slug</span>
                  <span style={{ flex: "0 0 50px" }}>v</span>
                  <span style={{ flex: "0 0 90px" }}>label</span>
                  <span style={{ flex: "0 0 130px" }}>created</span>
                  <span style={{ flex: 3 }}>preview</span>
                  <span style={{ flex: "0 0 60px", textAlign: "right" }}>chars</span>
                </div>
                {dbRows.length === 0 && !dbLoading && (
                  <div className="cp-empty" style={{ padding: "20px" }}>No rows.</div>
                )}
                {dbRows.map((r) => (
                  <button
                    key={r.id}
                    className="cp-db-row cp-db-row-clickable"
                    onClick={() => { setDbOpen(false); selectSlug(r.slug); }}
                    type="button"
                    title={`Open '${r.slug}' in editor`}
                  >
                    <span style={{ flex: "0 0 26px" }} className="cp-db-active-dot">
                      {r.isActive && <span className="cp-db-active-mark" title="active version" />}
                    </span>
                    <span style={{ flex: 2 }} className="cp-db-slug">{r.slug}</span>
                    <span style={{ flex: "0 0 50px" }} className="cp-db-mono">v{r.version}</span>
                    <span style={{ flex: "0 0 90px" }}>
                      <span className={`cp-db-label cp-label-${r.label}`}>{r.label}</span>
                    </span>
                    <span style={{ flex: "0 0 130px" }} className="cp-db-mono cp-db-faint">{formatDate(r.createdAt)}</span>
                    <span style={{ flex: 3 }} className="cp-db-preview">{r.contentPreview}</span>
                    <span style={{ flex: "0 0 60px", textAlign: "right" }} className="cp-db-mono cp-db-faint">{r.contentLength}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

// ─── Muse Tab ─────────────────────────────────────────────────────────────────

const SIZE_OPTIONS = ["512", "1K", "2K", "4K"];
const QUALITY_OPTIONS = ["low", "medium", "high"];
const PROVIDER_OPTIONS = ["openai", "google"];

function MuseTab() {
  const [cfg, setCfg] = useState<MuseConfig | null>(null);
  const [draft, setDraft] = useState<Partial<MuseConfig>>({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/control-panel/muse-config")
      .then((r) => r.json())
      .then((d: MuseConfig) => { setCfg(d); setDraft(d); })
      .catch(() => setError("Failed to load Muse config"));
  }, []);

  const set = (key: keyof MuseConfig, value: unknown) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const dirty = useMemo(() => {
    if (!cfg) return false;
    return (Object.keys(draft) as (keyof MuseConfig)[]).some((k) => draft[k] !== cfg[k]);
  }, [cfg, draft]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSavedMsg(null);
    try {
      const res = await fetch("/api/control-panel/muse-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(`save ${res.status}`);
      const updated: MuseConfig = await res.json();
      setCfg(updated);
      setDraft(updated);
      setSavedMsg("Saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "save failed");
    } finally {
      setSaving(false);
    }
  }, [draft]);

  if (!cfg) {
    return (
      <div className="cp-spinner-center">
        {error ? <span className="cp-error-msg">{error}</span> : <Loader2 className="animate-spin" size={18} />}
      </div>
    );
  }

  const d = draft as MuseConfig;

  return (
    <div className="cp-muse">
      <div className="cp-muse-grid">
        <div className="cp-muse-card">
          <div className="cp-muse-card-title">Provider &amp; Models</div>
          <Field label="Provider">
            <select className="cp-select" value={d.provider} onChange={(e) => set("provider", e.target.value)}>
              {PROVIDER_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Driver model" hint="Decides if/what to paint from recent turns">
            <input className="cp-input" value={d.driverModel} onChange={(e) => set("driverModel", e.target.value)} />
          </Field>
          <Field label="Painter model" hint="Image generator">
            <input className="cp-input" value={d.painterModel} onChange={(e) => set("painterModel", e.target.value)} />
          </Field>
          <Field label="Observe model" hint="Per-turn literary thought stream (cheap)">
            <input className="cp-input" value={d.observeModel} onChange={(e) => set("observeModel", e.target.value)} />
          </Field>
        </div>

        <div className="cp-muse-card">
          <div className="cp-muse-card-title">Cadence</div>
          <Field label="Auto-tick every" hint="How often the muse reconsiders painting">
            <div className="cp-field-row">
              <input
                className="cp-input cp-input-sm"
                type="number"
                min={1}
                max={20}
                value={d.tickEvery}
                onChange={(e) => set("tickEvery", parseInt(e.target.value, 10) || 1)}
              />
              <span className="cp-field-unit">turns</span>
            </div>
          </Field>
        </div>

        <div className="cp-muse-card">
          <div className="cp-muse-card-title">Mood Images</div>
          <Field label="Quality">
            <select className="cp-select" value={d.moodQuality} onChange={(e) => set("moodQuality", e.target.value)}>
              {QUALITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Size">
            <select className="cp-select" value={d.moodSize} onChange={(e) => set("moodSize", e.target.value)}>
              {SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <div className="cp-muse-card">
          <div className="cp-muse-card-title">Infographics</div>
          <Field label="Quality">
            <select className="cp-select" value={d.infographicQuality} onChange={(e) => set("infographicQuality", e.target.value)}>
              {QUALITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
          <Field label="Size">
            <select className="cp-select" value={d.infographicSize} onChange={(e) => set("infographicSize", e.target.value)}>
              {SIZE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div className="cp-muse-footer">
        <span className="cp-footnote">Last saved: {formatDate(cfg.updatedAt)}</span>
        <Button size="sm" onClick={save} disabled={saving || !dirty}>
          {saving && <Loader2 className="animate-spin mr-1" size={13} />}
          Save config
        </Button>
        {savedMsg && <span className="cp-saved-msg"><CheckCircle size={13} />{savedMsg}</span>}
        {error && <span className="cp-error-msg">{error}</span>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="cp-field">
      <span className="cp-field-label">{label}</span>
      {children}
      {hint && <span className="cp-field-hint">{hint}</span>}
    </label>
  );
}

// ─── Context Tab ─────────────────────────────────────────────────────────────

const CONTEXT_SECTIONS: Array<{
  key: keyof KronusStats;
  tokenKey: keyof KronusStats;
  label: string;
  source: string;
  note: string;
}> = [
  { key: "writings", tokenKey: "writingsTokens", label: "Writings", source: "documents:type=writing", note: "Essays, poems, long-form repository documents." },
  { key: "portfolioProjects", tokenKey: "portfolioProjectsTokens", label: "Portfolio", source: "portfolio_projects", note: "Case studies and shipped work." },
  { key: "skills", tokenKey: "skillsTokens", label: "CV Skills", source: "skills", note: "Structured capability index, separate from Kronus prompt-skills." },
  { key: "workExperience", tokenKey: "workExperienceTokens", label: "Experience", source: "work_experience", note: "Employment history and achievements." },
  { key: "education", tokenKey: "educationTokens", label: "Education", source: "education", note: "Academic background and focus areas." },
  { key: "journalEntries", tokenKey: "journalEntriesTokens", label: "Journal", source: "journal_entries", note: "Commit-scoped project memory." },
  { key: "chatIndex", tokenKey: "chatIndexTokens", label: "Chat Index", source: "chat_conversations summaries", note: "Summarized prior conversations; also enables memory tools." },
  { key: "linearProjects", tokenKey: "linearProjectsTokens", label: "Linear Projects", source: "linear_projects cache", note: "Active project records by default." },
  { key: "linearIssues", tokenKey: "linearIssuesTokens", label: "Linear Issues", source: "linear_issues cache", note: "Active issue records by default." },
];

const PIPELINE = [
  {
    title: "Base",
    icon: Brain,
    body: "Kronus always starts with Soul.xml, current date, behavior rules, available skills, and the active chat transcript.",
  },
  {
    title: "Manual Context",
    icon: Database,
    body: "The Context popover toggles soul sections. Enabled sections are loaded into the system prompt by loadRepositoryForSoul().",
  },
  {
    title: "Skills",
    icon: Sparkles,
    body: "Prompt documents tagged metadata.type=kronus-skill inject their instruction text and OR-merge declared soul/tools.",
  },
  {
    title: "Tools",
    icon: Wrench,
    body: "Manual tool toggles plus skill-declared tools decide what callable functions are exposed to the model.",
  },
  {
    title: "Session State",
    icon: Layers,
    body: "Hourglass sends shelf refs, displayed artifact uuid, chat_log, conversation id, active skills, model, and config each turn.",
  },
  {
    title: "Observability",
    icon: Activity,
    body: "withTrace()/traceAI() writes ai_traces; Live shows calls, tokens, cost, latency, inputs, outputs, and active cancellations.",
  },
];

function ContextTab() {
  const [stats, setStats] = useState<KronusStats | null>(null);
  const [skills, setSkills] = useState<KronusSkillInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [statsRes, skillsRes] = await Promise.all([
          fetch("/api/kronus/stats"),
          fetch("/api/kronus/skills"),
        ]);
        if (!statsRes.ok) throw new Error(`stats ${statsRes.status}`);
        if (!skillsRes.ok) throw new Error(`skills ${skillsRes.status}`);
        setStats(await statsRes.json());
        const skillsJson = await skillsRes.json();
        setSkills(skillsJson.skills ?? []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "failed to load context dashboard");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const skillTotals = useMemo(() => {
    const soul = new Set<string>();
    const tools = new Set<string>();
    for (const skill of skills) {
      for (const [key, value] of Object.entries(skill.config?.soul ?? {})) {
        if (value) soul.add(key);
      }
      for (const [key, value] of Object.entries(skill.config?.tools ?? {})) {
        if (value) tools.add(key);
      }
    }
    return { soul: Array.from(soul).sort(), tools: Array.from(tools).sort() };
  }, [skills]);

  if (loading) {
    return <div className="cp-spinner-center"><Loader2 className="animate-spin" size={18} /></div>;
  }

  if (error || !stats) {
    return <div className="cp-context"><span className="cp-error-msg">{error ?? "No stats available"}</span></div>;
  }

  const sectionTokenTotal = CONTEXT_SECTIONS.reduce((sum, item) => sum + Number(stats[item.tokenKey] ?? 0), 0);

  return (
    <div className="cp-context">
      <section className="cp-context-hero">
        <div>
          <h2>Context Management</h2>
          <p>
            Kronus runs lean by default. Manual context toggles and active skills add repository memory,
            while tool toggles decide what actions are exposed. Live traces track what actually ran.
          </p>
        </div>
        <div className="cp-context-kpis">
          <Kpi label="base prompt" value={tokenLabel(stats.baseTokens)} sub="tokens" />
          <Kpi label="all active context" value={tokenLabel(stats.totalTokens)} sub="estimated tokens" />
          <Kpi label="skill prompts" value={formatInt(skills.length)} sub="available" />
          <Kpi label="skill adds" value={`${skillTotals.soul.length}/${skillTotals.tools.length}`} sub="context/tools" />
        </div>
      </section>

      <section className="cp-context-section">
        <div className="cp-section-header">
          <h3 className="cp-section-title">Pipeline</h3>
          <span className="cp-footnote">What enters Kronus on each Hourglass turn</span>
        </div>
        <div className="cp-context-pipeline">
          {PIPELINE.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="cp-context-pipe-card">
                <div className="cp-context-pipe-head"><Icon size={14} /><span>{p.title}</span></div>
                <p>{p.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cp-context-section">
        <div className="cp-section-header">
          <h3 className="cp-section-title">Soul Sections</h3>
          <span className="cp-footnote">{tokenLabel(sectionTokenTotal)} estimated section tokens, before model/tool overhead</span>
        </div>
        <div className="cp-context-grid">
          {CONTEXT_SECTIONS.map((item) => (
            <div key={item.label} className="cp-context-source-card">
              <div className="cp-context-source-top">
                <strong>{item.label}</strong>
                <span>{formatInt(Number(stats[item.key] ?? 0))}</span>
              </div>
              <div className="cp-context-source-tokens">{tokenLabel(Number(stats[item.tokenKey] ?? 0))} tokens</div>
              <code>{item.source}</code>
              <p>{item.note}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="cp-context-section">
        <div className="cp-section-header">
          <h3 className="cp-section-title">Skill Activation Map</h3>
          <span className="cp-footnote">Skills are additive: they never turn context or tools off.</span>
        </div>
        <div className="cp-context-skill-list">
          {skills.length === 0 && <div className="cp-empty">No Kronus skills found.</div>}
          {skills.map((skill) => {
            const soul = activeKeys(skill.config?.soul);
            const tools = activeKeys(skill.config?.tools);
            return (
              <div key={skill.slug} className="cp-context-skill-row">
                <div className="cp-context-skill-title">
                  <GitBranch size={13} />
                  <span>{skill.title}</span>
                  <code>{skill.slug}</code>
                </div>
                <p>{skill.description}</p>
                <div className="cp-context-pill-row">
                  <ContextPills label="ctx" items={soul} empty="prompt only" />
                  <ContextPills label="tools" items={tools} empty="no extra tools" />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="cp-context-section">
        <div className="cp-section-header">
          <h3 className="cp-section-title">Call Tracking</h3>
        </div>
        <div className="cp-context-callout">
          <Activity size={15} />
          <p>
            AI calls are tracked in <code>ai_traces</code> through <code>withTrace</code> and <code>traceAI</code>.
            The Live tab reads <code>/api/monitor</code> for active requests and <code>/api/observability?bundle=true</code>
            for recent traces, child spans, token counts, costs, latency, inputs, and outputs.
          </p>
        </div>
      </section>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="cp-context-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      <em>{sub}</em>
    </div>
  );
}

function activeKeys(record?: Record<string, boolean>): string[] {
  return Object.entries(record ?? {})
    .filter(([, value]) => value === true)
    .map(([key]) => key)
    .sort();
}

function ContextPills({ label, items, empty }: { label: string; items: string[]; empty: string }) {
  return (
    <div className="cp-context-pills">
      <span className="cp-context-pills-label">{label}</span>
      {items.length === 0 ? (
        <em>{empty}</em>
      ) : (
        items.map((item) => <span key={item}>{item}</span>)
      )}
    </div>
  );
}

// ─── Live Tab ─────────────────────────────────────────────────────────────────

interface TraceSpan {
  id: string;
  trace_id: string;
  parent_span_id?: string | null;
  name: string;
  type: string;
  model?: string;
  endpoint?: string | null;
  status: string;
  latency_ms?: number;
  cost_usd?: number;
  input_tokens?: number;
  output_tokens?: number;
  error_message?: string;
  metadata?: Record<string, unknown> | string;
  input?: string | null;
  output?: string | null;
  started_at: string;
  ended_at?: string;
}

interface BundledTrace extends TraceSpan {
  children: TraceSpan[];
  rollup: {
    models: string[];
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    step_count: number;
  };
}

// Friendly fallback label per trace name (used when endpoint isn't recorded)
const TRACE_NAME_FALLBACK: Record<string, string> = {
  "muse:auto":           "Hourglass · Muse (auto)",
  "muse:force":          "Hourglass · Muse (forced)",
  "muse-auto":           "Hourglass · Muse (auto)",
  "muse-force":          "Hourglass · Muse (forced)",
  "muse-propose":        "Muse · propose",
  "muse-generate-prompt": "Muse · generate prompt",
  "muse-decision":       "Muse · decision",
  "muse-paint":          "Muse · paint",
  "muse-observe":        "Muse · observe",
  "chat":                "Chat",
  "kronus_ask":          "Kronus · ask",
  "kronus-generate":     "Kronus · journal entry",
  "kronus-chat-summary": "Kronus · chat summary",
  "kronus_generation":   "Kronus · generation",
  "conversation-summary": "Conversation · summary",
  "summarize":           "Summarize",
  "build_summaries_index": "Build summaries index",
  "entry0-analyze":      "Entry 0 · analyze",
  "entry0-analyze-generate": "Entry 0 · analyze (generate)",
};

/** Prefer the explicit endpoint column; otherwise fall back to the friendly name map. */
function traceLabel(t: { name: string; endpoint?: string | null }): { primary: string; secondary: string | null } {
  if (t.endpoint) {
    return { primary: t.endpoint, secondary: TRACE_NAME_FALLBACK[t.name] ?? t.name };
  }
  return { primary: TRACE_NAME_FALLBACK[t.name] ?? t.name, secondary: null };
}

// Pluck the most useful 1-3 metadata fields and render as readable pills.
function metaPills(metaRaw: TraceSpan["metadata"]): Array<{ key: string; value: string }> {
  if (!metaRaw) return [];
  let meta: Record<string, unknown>;
  try {
    meta = typeof metaRaw === "string" ? JSON.parse(metaRaw) : metaRaw;
  } catch {
    return [];
  }
  const PRIORITY = ["repository", "provider", "mode", "renderMode", "depth", "edit_mode", "size", "question"];
  const pills: Array<{ key: string; value: string }> = [];
  for (const k of PRIORITY) {
    if (k in meta && meta[k] != null && meta[k] !== false) {
      let v = String(meta[k]);
      if (k === "question") v = v.length > 80 ? v.slice(0, 80) + "…" : v;
      pills.push({ key: k, value: v });
    }
  }
  return pills.slice(0, 4);
}

function LiveTab() {
  const [data, setData] = useState<{ active: ActiveRequest[]; count: number }>({ active: [], count: 0 });
  const [traces, setTraces] = useState<BundledTrace[]>([]);
  const [traceFilter, setTraceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "error" | "running">("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<Set<string>>(new Set());
  const [cancellingAll, setCancellingAll] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [reqRes, traceRes] = await Promise.all([
        fetch("/api/monitor"),
        fetch("/api/observability?limit=50&bundle=true"),
      ]);
      if (reqRes.ok) setData(await reqRes.json());
      if (traceRes.ok) {
        const j = await traceRes.json();
        setTraces(j.traces ?? []);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 3000);
    return () => clearInterval(id);
  }, [fetchData]);

  const now = Date.now();
  const active = data.active.map((r) => ({
    ...r,
    elapsedMs: now - new Date(r.startedAt).getTime(),
  }));

  async function cancel(id: string) {
    setCancelling((s) => new Set(s).add(id));
    try {
      await fetch(`/api/monitor?id=${id}`, { method: "DELETE" });
      await fetchData();
    } finally {
      setCancelling((s) => { const next = new Set(s); next.delete(id); return next; });
    }
  }

  async function cancelAll() {
    setCancellingAll(true);
    try {
      await fetch("/api/monitor?all=true", { method: "DELETE" });
      await fetchData();
    } finally {
      setCancellingAll(false);
    }
  }

  return (
    <div className="cp-live">
      <div className="cp-live-header">
        <span className="cp-live-count"><Activity size={14} /> {active.length} active</span>
        {active.length > 0 && (
          <Button variant="destructive" size="sm" onClick={cancelAll} disabled={cancellingAll}>
            {cancellingAll ? "Cancelling…" : `Cancel all (${active.length})`}
          </Button>
        )}
      </div>

      {active.length === 0 ? (
        <div className="cp-empty">No requests in flight. Polls every 2s.</div>
      ) : (
        <div className="cp-request-list">
          {active.map((r) => (
            <div key={r.id} className="cp-request-row">
              <div className="cp-request-left">
                <div className="cp-request-name">
                  <span>{ENDPOINT_LABELS[r.endpoint] ?? r.endpoint}</span>
                  {r.mode && <Badge variant="secondary" className="text-xs font-mono">{r.mode}</Badge>}
                  {r.model && <Badge variant="outline" className="text-xs font-mono">{r.model}</Badge>}
                  <span className="cp-request-elapsed">{formatElapsed(r.elapsedMs)}</span>
                </div>
                <div className="cp-request-meta">
                  Started {formatTime(r.startedAt)}
                  {!!r.metadata.prompt && (
                    <span className="cp-request-prompt italic">
                      {" "}{(r.metadata.prompt as string).slice(0, 80)}…
                    </span>
                  )}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => cancel(r.id)}
                disabled={cancelling.has(r.id)}
              >
                {cancelling.has(r.id) ? "…" : "Cancel"}
              </Button>
            </div>
          ))}
        </div>
      )}

      <p className="cp-footnote">Request IDs are in-process only — cancellation works for the current server instance.</p>

      {/* ── Recent traces ── */}
      <div className="cp-traces-section">
        <div className="cp-section-header">
          <h3 className="cp-section-title">Recent traces</h3>
          <div className="cp-trace-filters">
            <input
              className="cp-input cp-input-sm"
              placeholder="filter by name…"
              value={traceFilter}
              onChange={(e) => setTraceFilter(e.target.value)}
              style={{ width: 160 }}
            />
            <select
              className="cp-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
            >
              <option value="all">all</option>
              <option value="success">success</option>
              <option value="error">error</option>
              <option value="running">running</option>
            </select>
            <span className="cp-footnote" style={{ marginLeft: "auto" }}>
              {traces.length} loaded · polls every 3s
            </span>
          </div>
        </div>

        <div className="cp-trace-list">
          {traces
            .filter((t) => {
              if (statusFilter !== "all" && t.status !== statusFilter) return false;
              if (!traceFilter) return true;
              const q = traceFilter.toLowerCase();
              return (
                (t.endpoint ?? "").toLowerCase().includes(q) ||
                t.name.toLowerCase().includes(q)
              );
            })
            .slice(0, 30)
            .map((t) => {
              const isExp = expanded === t.id;
              const pills = metaPills(t.metadata);
              const totalLatency = t.latency_ms ?? 0;
              const totalIn = t.rollup.input_tokens || t.input_tokens || 0;
              const totalOut = t.rollup.output_tokens || t.output_tokens || 0;
              const totalCost = t.rollup.cost_usd || t.cost_usd || 0;
              const models = t.rollup.models.length ? t.rollup.models : (t.model ? [t.model] : []);
              const label = traceLabel(t);
              return (
                <div key={t.id} className={`cp-trace-row${isExp ? " cp-trace-row-exp" : ""}`}>
                  <button
                    className="cp-trace-summary"
                    onClick={() => setExpanded(isExp ? null : t.id)}
                    type="button"
                  >
                    <span className={`cp-trace-status cp-trace-status-${t.status}`} />
                    <span className="cp-trace-endpoint">{label.primary}</span>
                    {label.secondary && (
                      <span className="cp-trace-op" title={`operation: ${t.name}`}>{label.secondary}</span>
                    )}
                    {t.rollup.step_count > 0 && (
                      <span className="cp-trace-steps" title={`${t.rollup.step_count} child spans`}>
                        +{t.rollup.step_count}
                      </span>
                    )}
                    <span className="cp-trace-time">{formatTime(t.started_at)}</span>
                    <span className="cp-trace-latency">
                      {totalLatency ? `${totalLatency}ms` : "—"}
                    </span>
                    {totalIn > 0 && (
                      <span className="cp-trace-tokens" title="input → output tokens">
                        {totalIn}→{totalOut}
                      </span>
                    )}
                    {totalCost > 0 && (
                      <span className="cp-trace-cost">${totalCost.toFixed(4)}</span>
                    )}
                  </button>

                  {/* Inline metadata pills */}
                  {(pills.length > 0 || models.length > 0) && (
                    <div className="cp-trace-pills">
                      {models.map((m) => (
                        <span key={m} className="cp-trace-model">{m}</span>
                      ))}
                      {pills.map((p) => (
                        <span key={p.key} className="cp-trace-pill" title={p.key}>
                          <span className="cp-trace-pill-key">{p.key}</span>
                          <span className="cp-trace-pill-val">{p.value}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  {isExp && (
                    <div className="cp-trace-detail">
                      {/* Logic: input → output for the parent (or first child if parent is a wrapper span) */}
                      {(() => {
                        const sourceSpan: TraceSpan = (t.input || t.output)
                          ? t
                          : t.children.find((c) => c.input || c.output) ?? t;
                        const inText = typeof sourceSpan.input === "string" ? sourceSpan.input : null;
                        const outText = typeof sourceSpan.output === "string" ? sourceSpan.output : null;
                        if (!inText && !outText) return null;
                        return (
                          <div className="cp-trace-io">
                            {inText && (
                              <div className="cp-io-block">
                                <div className="cp-io-label">→ input</div>
                                <pre className="cp-io-body">{inText}</pre>
                              </div>
                            )}
                            {outText && (
                              <div className="cp-io-block">
                                <div className="cp-io-label">← output</div>
                                <pre className="cp-io-body">{outText}</pre>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Children spans */}
                      {t.children.length > 0 && (
                        <div className="cp-trace-children">
                          <div className="cp-trace-children-title">steps</div>
                          {t.children.map((c) => (
                            <div key={c.id} className="cp-trace-child">
                              <span className={`cp-trace-status cp-trace-status-${c.status}`} />
                              <span className="cp-trace-child-name">{c.name}</span>
                              {c.model && <span className="cp-trace-model">{c.model}</span>}
                              <span className="cp-trace-latency">{c.latency_ms ?? 0}ms</span>
                              {c.input_tokens != null && (
                                <span className="cp-trace-tokens">{c.input_tokens}→{c.output_tokens ?? "?"}</span>
                              )}
                              {c.cost_usd != null && c.cost_usd > 0 && (
                                <span className="cp-trace-cost">${c.cost_usd.toFixed(4)}</span>
                              )}
                              {c.error_message && (
                                <span className="cp-trace-child-err" title={c.error_message}>
                                  err: {c.error_message.slice(0, 60)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="cp-trace-ids">
                        <span><span className="cp-kv-key">trace</span> <span className="cp-kv-val">{t.trace_id.slice(0, 12)}…</span></span>
                        <span><span className="cp-kv-key">type</span> <span className="cp-kv-val">{t.type}</span></span>
                        {t.error_message && (
                          <span className="cp-trace-error"><span className="cp-kv-key">error</span> {t.error_message}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          {traces.length === 0 && (
            <div className="cp-empty" style={{ padding: "20px" }}>No traces yet — fire an AI request and they show up here.</div>
          )}
        </div>
      </div>
    </div>
  );
}
