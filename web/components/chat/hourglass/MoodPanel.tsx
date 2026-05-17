"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, RefreshCw, Download, ArrowUpRight, Clock, Plus, Loader2 } from "lucide-react";
import { ArtifactView } from "./artifacts/ArtifactView";
import { ApprovalCard, type PendingApproval } from "./ApprovalCard";
import type { Artifact, ArtifactRef } from "./artifacts/types";
import type { MoodTab } from "./types";
import { beatTurnTooltip, formatBeatPadded, formatShelfSlot, moodTabForRef } from "./hourglass-ui";

/** Bucket each shelf entry into the active tab's filter. */
function filterShelfByTab(shelf: ArtifactRef[], tab: MoodTab): ArtifactRef[] {
  if (tab === "mood") {
    return shelf.filter((r) => r.kind === "muse-image" && r.renderMode !== "infographic");
  }
  if (tab === "infographic") {
    return shelf.filter((r) => r.kind === "muse-image" && r.renderMode === "infographic");
  }
  // "repo": everything that isn't a muse painting
  return shelf.filter((r) => r.kind !== "muse-image");
}

export interface MuseThought {
  id: string;
  text: string;
  turnIndex: number;
  at: number;
  kind?: "poem" | "thought" | "quip";
  poemTitle?: string;
  poemLines?: string[];
}

interface MoodPanelProps {
  shelf: ArtifactRef[];
  viewingUuid: string | null;
  onViewingUuidChange: (uuid: string | null) => void;
  hydratedArtifact: Artifact | null;
  hydrating: boolean;
  museSilenceReason: string | null;
  museThoughts: MuseThought[];
  musePainting?: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  tab: MoodTab;
  onTabChange: (t: MoodTab) => void;
  onRegen?: () => void;
  onAdd?: () => void;
  // Pending image approval — unified single/alternatives/direct shape.
  pendingApproval?: PendingApproval | null;
  onAcceptApproval?: () => void;
  onPickAlternative?: (index: number) => void;
  onSkipApproval?: () => void;
}

export function MoodPanel({
  shelf,
  viewingUuid,
  onViewingUuidChange,
  hydratedArtifact,
  hydrating,
  museSilenceReason,
  museThoughts,
  musePainting,
  collapsed,
  onToggleCollapse,
  tab,
  onTabChange,
  onRegen,
  onAdd,
  pendingApproval,
  onAcceptApproval,
  onPickAlternative,
  onSkipApproval,
}: MoodPanelProps) {
  const [historyOpen, setHistoryOpen] = useState(false);

  // Per-tab shelf — the navigation, dots, and viewing index all derive
  // from this filtered list, not the full shelf.
  const tabShelf = useMemo(() => filterShelfByTab(shelf, tab), [shelf, tab]);

  // Counts for the tab labels — computed once per shelf change.
  const counts = useMemo(() => ({
    mood: filterShelfByTab(shelf, "mood").length,
    infographic: filterShelfByTab(shelf, "infographic").length,
    repo: filterShelfByTab(shelf, "repo").length,
  }), [shelf]);

  // If the currently-viewed item isn't in the active tab, fall back to
  // the newest item in the tab so the panel always shows the right kind.
  useEffect(() => {
    if (tabShelf.length === 0) return;
    const stillViewable = viewingUuid && tabShelf.some((r) => r.uuid === viewingUuid);
    if (!stillViewable) {
      onViewingUuidChange(tabShelf[tabShelf.length - 1].uuid);
    }
  }, [tab, tabShelf, viewingUuid, onViewingUuidChange]);

  const viewingIdx = viewingUuid ? tabShelf.findIndex((r) => r.uuid === viewingUuid) : -1;
  const viewing = viewingIdx >= 0 ? tabShelf[viewingIdx] : null;

  const viewingIsTextShelf = Boolean(
    viewing && viewing.kind !== "muse-image" && viewing.kind !== "media",
  );

  const thoughtAtBeat = useMemo(() => {
    const ti = viewing?.turnIndex;
    if (ti == null) return [];
    return museThoughts.filter((t) => t.turnIndex === ti);
  }, [viewing?.turnIndex, museThoughts]);

  const shelfIndexForViewing =
    viewing && shelf.length > 0 ? shelf.findIndex((r) => r.uuid === viewing.uuid) : -1;

  const cycle = (delta: number) => {
    if (tabShelf.length === 0) return;
    const cur = viewingIdx >= 0 ? viewingIdx : tabShelf.length - 1;
    const next = (cur + delta + tabShelf.length) % tabShelf.length;
    onViewingUuidChange(tabShelf[next].uuid);
  };

  const isEmpty = tabShelf.length === 0;
  const showDownload = hydratedArtifact?.body.kind === "muse-image" || hydratedArtifact?.body.kind === "media";
  const downloadUrl =
    hydratedArtifact?.body.kind === "muse-image" || hydratedArtifact?.body.kind === "media"
      ? hydratedArtifact.body.imageUrl
      : null;

  return (
    <aside className={`hg-mood${collapsed ? " hg-collapsed" : ""}${historyOpen ? " hg-history-open" : ""}`}>
      <button className="hg-mood-collapse-btn" onClick={onToggleCollapse} title={collapsed ? "Expand" : "Collapse"}>
        {collapsed ? <ChevronLeft /> : <ChevronRight />}
      </button>

      {/* Collapsed strip — visible only when collapsed */}
      <div className="hg-mood-collapsed-strip">
        <div className="hg-strip-icon">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/muse.png" alt="" />
        </div>
        {museThoughts.length > 0 && (
          <span className="hg-strip-thought">{museThoughts[museThoughts.length - 1].text}</span>
        )}
      </div>

      <div className="hg-mood-inner">
        {/* Tabs moved to the Topbar (Batch 1). Only the add-artifact `+`
            stays here, surfacing top-right above the artifact area. */}
        {onAdd && (
          <div className="hg-mood-actions">
            <button className="hg-mood-add-btn" onClick={onAdd} title="add artifact" aria-label="Add artifact">
              <Plus />
            </button>
          </div>
        )}

        <div className="hg-mood-content">
              <div className="hg-artifact-wrapper">
              {/* Pending image approval — single / alternatives / direct, all
                  rendered through the unified ApprovalCard. No render runs
                  until the user explicitly accepts. */}
              {pendingApproval && onSkipApproval && (
                <ApprovalCard
                  approval={pendingApproval}
                  busy={!!musePainting}
                  onAccept={onAcceptApproval}
                  onPick={onPickAlternative}
                  onSkip={onSkipApproval}
                />
              )}

              {/* Navigation: only show when there are 2+ artifacts in this tab */}
              {tabShelf.length > 1 && (
                <div className="hg-shelf-nav">
                  <button className="hg-shelf-nav-btn" onClick={() => cycle(-1)} title="previous artifact">
                    <ChevronLeft />
                  </button>
                  <div className="hg-shelf-dots">
                    {tabShelf.map((r) => (
                      <span
                        key={r.uuid}
                        className={`hg-cdot${r.uuid === viewingUuid ? " active" : ""}`}
                      />
                    ))}
                  </div>
                  <button className="hg-shelf-nav-btn" onClick={() => cycle(1)} title="next artifact">
                    <ChevronRight />
                  </button>
                </div>
              )}

              {isEmpty && tab === "mood" && (
                <div className="hg-muse-standby">
                  {/* Portrait fills the top of the empty state. Uses the
                      muse asset (not Kronus) since this is her surface. */}
                  <div className="hg-muse-oracle">
                    <div className={`hg-muse-portrait${musePainting ? " hg-muse-portrait-painting" : ""}`}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src="/muse.png"
                        alt="The Muse"
                        className="hg-muse-portrait-img"
                      />
                      <div className="hg-muse-portrait-halo" aria-hidden />
                      {musePainting && (
                        <div className="hg-muse-portrait-badge">
                          <Loader2 className="animate-spin" size={12} /> rendering
                        </div>
                      )}
                    </div>
                    <div className="hg-muse-standby-title">
                      {musePainting ? "she is rendering..." : "the muse watches"}
                    </div>
                  </div>
                  {/* Lower section — thoughts + hint */}
                  <div className="hg-muse-lower">
                    {museThoughts.length === 0 && !musePainting && (
                      <div className="hg-muse-standby-hint">
                        every few turns she&apos;ll offer a poem, a thought, or - when the moment earns it - visual art for you to confirm.
                      </div>
                    )}
                    {museThoughts.length > 0 && (
                      <ul className="hg-muse-thoughts">
                        {museThoughts.slice().reverse().map((t, i) => (
                          <li
                            key={t.id}
                            className={`hg-muse-thought${i === 0 ? " hg-muse-thought-latest" : ""}`}
                          >
                            <span className="hg-muse-thought-turn" aria-label={beatTurnTooltip(t.turnIndex)}>
                              beat {formatBeatPadded(t.turnIndex)}
                            </span>
                            <span className="hg-muse-thought-text">{t.text}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}

              {isEmpty && tab === "infographic" && (
                <div className="hg-artifact-empty">
                  <div className="hg-artifact-empty-glyph">▤</div>
                  <div className="hg-artifact-empty-text">no infographics yet — the muse will produce one when a diagram is earned</div>
                </div>
              )}

              {isEmpty && tab === "repo" && (
                <div className="hg-artifact-empty">
                  <div className="hg-artifact-empty-glyph">¶</div>
                  <div className="hg-artifact-empty-text">nothing from the repo on the shelf — use + to add a document, entry, or media</div>
                </div>
              )}

              {!isEmpty && hydrating && !hydratedArtifact && (
                <div className="hg-artifact-empty">
                  <div className="hg-artifact-empty-glyph">…</div>
                  <div className="hg-artifact-empty-text">hydrating artifact</div>
                </div>
              )}

              {hydratedArtifact && <ArtifactView artifact={hydratedArtifact} rendering={!!musePainting} />}

              {musePainting && !hydratedArtifact && !isEmpty && (
                <div className="hg-muse-rendering" role="status" aria-live="polite">
                  <div className="hg-muse-rendering-frame">
                    <div className="hg-muse-rendering-orb" />
                    <div className="hg-muse-rendering-scan" />
                  </div>
                  <div className="hg-muse-rendering-copy">
                    <span>the muse is preparing the visual</span>
                    <em>{pendingApproval ? "rendering the selected prompt" : "composing options for the shelf"}</em>
                  </div>
                </div>
              )}

              {viewing && viewingIsTextShelf && (
                <div className="hg-muse-beat-thoughts">
                  <div className="hg-muse-thoughts-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/muse.png" alt="" className="hg-muse-thoughts-glyph" />
                    <span>muse on this beat</span>
                  </div>
                  {thoughtAtBeat.length === 0 ? (
                    <p className="hg-muse-beat-empty">
                      No muse lines logged for beat{" "}
                      {viewing.turnIndex != null ? formatBeatPadded(viewing.turnIndex) : "—"}.
                    </p>
                  ) : (
                    <ul className="hg-muse-thoughts">
                      {thoughtAtBeat.slice().reverse().map((t) => (
                        <li key={t.id} className="hg-muse-thought hg-muse-thought-latest">
                          <span className="hg-muse-thought-turn" aria-label={beatTurnTooltip(t.turnIndex)}>
                            beat {formatBeatPadded(t.turnIndex)}
                          </span>
                          <span className="hg-muse-thought-text">{t.text}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Action bar for the current artifact */}
              {viewing && (
                <div className="hg-artifact-actions">
                  {onRegen && (
                    <button
                      className="hg-tbtn"
                      onClick={onRegen}
                      disabled={musePainting}
                      title={musePainting ? "rendering in progress..." : "ask the muse again"}
                    >
                      {musePainting ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw />}
                      <span>{musePainting ? "rendering..." : "regen"}</span>
                    </button>
                  )}
                  {showDownload && downloadUrl && (
                    <a
                      className="hg-tbtn"
                      href={downloadUrl}
                      download={`artifact-${viewing.uuid.slice(0, 8)}.png`}
                      title="download"
                    >
                      <Download />
                      <span>download</span>
                    </a>
                  )}
                  {downloadUrl && (
                    <a
                      className="hg-tbtn"
                      href={downloadUrl}
                      target="_blank"
                      rel="noreferrer"
                      title="open in new tab"
                    >
                      <ArrowUpRight />
                      <span>open</span>
                    </a>
                  )}
                  <div className="hg-artifact-actions-spacer" />
                  {viewing.styleHint && (
                    <span className="hg-artifact-chip hg-artifact-chip-style" title={`style: ${viewing.styleHint}`}>
                      {viewing.styleHint}
                    </span>
                  )}
                  {viewing.linked && (
                    <span
                      className={`hg-artifact-chip hg-artifact-chip-link hg-artifact-chip-${viewing.linked.kind}`}
                      title={`${viewing.linked.kind}: ${viewing.linked.title ?? viewing.linked.sourceId}`}
                    >
                      {viewing.linked.kind === "journal" ? "📜"
                        : viewing.linked.kind === "document" ? "📄"
                        : "🎨"}
                      <span className="hg-artifact-chip-label">
                        {viewing.linked.title?.slice(0, 32) ?? viewing.linked.sourceId.slice(0, 12)}
                      </span>
                    </span>
                  )}
                  <span className="hg-artifact-meta" aria-label={beatTurnTooltip(viewing.turnIndex)}>
                    {viewing.kind}
                    {viewing.turnIndex != null ? ` · beat ${formatBeatPadded(viewing.turnIndex)}` : ""}
                    {shelfIndexForViewing >= 0
                      ? ` · shelf ${formatShelfSlot(shelfIndexForViewing + 1, shelf.length)}`
                      : ""}
                  </span>
                </div>
              )}

              {/* Thought stream below the image — visible whenever the muse has spoken */}
              {viewing && museThoughts.length > 0 && !viewingIsTextShelf && (
                <div className="hg-muse-thoughts-below">
                  <div className="hg-muse-thoughts-head">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/muse.png" alt="" className="hg-muse-thoughts-glyph" />
                    <span>the muse&apos;s thoughts</span>
                  </div>
                  <ul className="hg-muse-thoughts">
                    {museThoughts.slice(-3).reverse().map((t, i) => (
                      <li
                        key={t.id}
                        className={`hg-muse-thought${i === 0 ? " hg-muse-thought-latest" : ""}`}
                      >
                        <span className="hg-muse-thought-turn" aria-label={beatTurnTooltip(t.turnIndex)}>
                          beat {formatBeatPadded(t.turnIndex)}
                        </span>
                        <span className="hg-muse-thought-text">{t.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Muse silence note — shown when she just ticked and chose not to propose an image */}
              {museSilenceReason && !viewing && (
                <div className="hg-muse-note">
                  <div className="hg-muse-note-lbl">✦ the muse was silent</div>
                  <div className="hg-muse-note-body">{museSilenceReason}</div>
                </div>
              )}
            </div>
        </div>

        {shelf.length > 0 && (
          <>
            <div className="hg-history-wrap">
              <button
                className={`hg-history-toggle${historyOpen ? " hg-on" : ""}`}
                onClick={() => setHistoryOpen((o) => !o)}
              >
                <Clock style={{ width: 13, height: 13 }} />
                <span>shelf history</span>
                <span className="hg-count">{shelf.length}</span>
              </button>
            </div>
            <div className={`hg-history-drawer${historyOpen ? " hg-open" : ""}`}>
              <div className="hg-history-inner">
                {shelf.map((r, shelfIdx) => (
                  <button
                    key={r.uuid}
                    className={`hg-thumb${r.uuid === viewingUuid ? " hg-now" : ""}`}
                    onClick={() => {
                      onTabChange(moodTabForRef(r));
                      onViewingUuidChange(r.uuid);
                    }}
                    aria-label={`${r.kind}: ${r.title}. ${beatTurnTooltip(r.turnIndex)}`}
                  >
                    {r.thumbUrl ? (
                      <div
                        className="hg-img"
                        style={{ backgroundImage: `url(${r.thumbUrl})` }}
                      />
                    ) : (
                      <div className="hg-img hg-img-text-kind">
                        {r.kind === "muse-poem" ? "✦" :
                          r.kind === "user-note" ? "✎" :
                            r.kind === "journal-entry" ? "◷" :
                              r.kind === "document" ? "¶" :
                                r.kind === "mermaid" ? "▤" :
                                  r.kind === "project-summary" ? "◆" : "◇"}
                      </div>
                    )}
                    <div className="hg-turn-lbl">
                      <span className="hg-turn-lbl-beat" aria-label={beatTurnTooltip(r.turnIndex)}>
                        {r.turnIndex != null ? `beat ${formatBeatPadded(r.turnIndex)}` : r.kind.slice(0, 6)}
                      </span>
                      <span className="hg-shelf-slot">{formatShelfSlot(shelfIdx + 1, shelf.length)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
