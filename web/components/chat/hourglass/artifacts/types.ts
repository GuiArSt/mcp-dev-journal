/**
 * Artifact types for the Hourglass shelf.
 *
 * Two layers:
 *
 * 1. ArtifactRef — what's stored in chat_conversations.artifact_refs.
 *    Compact: uuid + denormalized snapshot fields. Cheap to load.
 *    Shown in lists, history drawer, and Kronus context (as ref lines).
 *
 * 2. Artifact — the fully-hydrated thing with payload/content for rendering.
 *    Fetched lazily when viewingIdx points at it.
 */

export type ArtifactKind =
  | "muse-image"       // media_asset — muse painted mood/infographic
  | "muse-poem"        // document type=note, tags=[muse, poem]
  | "document"         // any documents row (writing/prompt/note)
  | "journal-entry"    // journal_entries row
  | "media"            // any media_assets row (generic image/file)
  | "project-summary"  // repository_overviews row (Entry 0)
  | "user-note"        // document type=note, tags=[user-note]
  | "mermaid";         // entry_attachments with .mmd/.mermaid filename

export type ArtifactSource = "muse-auto" | "muse-forced" | "muse-edited" | "kronus-tool" | "user-add";

/**
 * Compact reference stored in the conversation's shelf. Everything needed
 * to render a thumbnail + list row without a fetch.
 */
export interface ArtifactRef {
  uuid: string;              // points to tartarus_objects.uuid
  kind: ArtifactKind;
  addedAt: number;           // unix ms
  turnIndex?: number;
  source: ArtifactSource;
  title: string;
  summary?: string;
  thumbUrl?: string;         // for images; otherwise undefined
  /**
   * Source-table primary-key pointer. Redundant with tartarus_objects but
   * kept on the ref so we don't need an extra lookup to fetch the full row.
   */
  sourceTable: string;       // "media_assets" | "documents" | "journal_entries" | ...
  sourceId: string;
  /**
   * For muse-image refs: which render mode the muse picked. Surfaced on
   * the ref so the shelf tab filter (mood vs infographic) doesn't need to
   * hydrate every artifact.
   */
  renderMode?: "mood" | "infographic";
  /**
   * Free-form style label woven into the prompt ("comic strip",
   * "scientific still", "Klimt mood"). Surfaced on the ref so the card
   * can show a small style chip without hydrating.
   */
  styleHint?: string;
  /**
   * What this artifact is attached to (if anything). Filled at persist
   * time when the caller passed commit_hash / document_id /
   * portfolio_project_id; null when the artifact is orphan.
   */
  linked?: {
    kind: "journal" | "document" | "portfolio";
    sourceTable: "journal_entries" | "documents" | "portfolio_projects";
    sourceId: string;
    title?: string;
  };
}

// -------------------------- Hydrated artifact bodies --------------------

export interface ArtifactBodyMuseImage {
  kind: "muse-image";
  imageUrl: string;          // /api/media/<id>/raw or data url
  prompt?: string;
  renderMode?: "mood" | "infographic";
  reason?: string;
  model?: string;
  size?: string;
  /** Companion poem — rendered below the image when present (mood only). */
  companionPoem?: { title: string; lines: string[] };
}

export interface ArtifactBodyPoem {
  kind: "muse-poem";
  title: string;
  lines: string[];           // 3-5 short lines
  reason?: string;
}

export interface ArtifactBodyDocument {
  kind: "document";
  documentType: "writing" | "prompt" | "note";
  title: string;
  content: string;           // markdown
  summary?: string;
  tags?: string[];
  slug: string;
}

export interface ArtifactBodyEntry {
  kind: "journal-entry";
  commitHash: string;
  repository: string;
  branch: string;
  date: string;
  why: string;
  whatChanged: string;
  decisions: string;
  technologies: string;
  kronusWisdom?: string;
  summary?: string;
}

export interface ArtifactBodyMedia {
  kind: "media";
  mediaId: number;
  imageUrl: string;          // /api/media/<id>/raw
  filename: string;
  alt?: string;
  description?: string;
  prompt?: string;
  model?: string;
  tags?: string[];
}

export interface ArtifactBodyProjectSummary {
  kind: "project-summary";
  repository: string;
  summary?: string;
  purpose?: string;
  architecture?: string;
  techStack?: string;
  status?: string;
  // The full record — rendered by the existing ProjectSummaryCard
  raw: Record<string, unknown>;
}

export interface ArtifactBodyUserNote {
  kind: "user-note";
  title: string;
  text: string;
  createdAt: number;
}

export interface ArtifactBodyMermaid {
  kind: "mermaid";
  attachmentId: number;
  filename: string;
  code: string;              // the mermaid source
}

export type ArtifactBody =
  | ArtifactBodyMuseImage
  | ArtifactBodyPoem
  | ArtifactBodyDocument
  | ArtifactBodyEntry
  | ArtifactBodyMedia
  | ArtifactBodyProjectSummary
  | ArtifactBodyUserNote
  | ArtifactBodyMermaid;

/**
 * Fully hydrated artifact — ref + body. What renderers receive.
 */
export type Artifact = ArtifactRef & { body: ArtifactBody };
