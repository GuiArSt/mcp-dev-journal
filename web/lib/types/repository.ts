// Shared types for the Repository dashboard

export interface Document {
  id: number;
  slug: string;
  type: "writing" | "prompt" | "note";
  title: string;
  content: string;
  language: string;
  metadata: any;
  created_at: string;
  updated_at: string;
  summary?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
  magnitude: number;
  description: string;
  tags: string[];
}

export interface Achievement {
  category?: string;
  description: string;
  metrics?: string;
  tags?: string[];
}

export interface WorkExperience {
  id: string;
  title: string;
  company: string;
  department?: string;
  location: string;
  dateStart: string;
  dateEnd: string | null;
  tagline: string;
  note?: string;
  achievements: Achievement[];
}

export interface Education {
  id: string;
  degree: string;
  field: string;
  institution: string;
  location: string;
  dateStart: string;
  dateEnd: string;
  tagline: string;
  note?: string;
  focusAreas: string[];
  achievements: string[];
}

export interface PortfolioProject {
  id: string;
  title: string;
  category: string;
  company?: string | null;
  dateCompleted?: string | null;
  status: "shipped" | "wip" | "archived";
  featured: boolean;
  image?: string | null;
  excerpt?: string | null;
  description?: string | null;
  role?: string | null;
  technologies: string[];
  metrics: Record<string, string>;
  links: Record<string, string>;
  tags: string[];
  sortOrder?: number;
}

export interface LinearCachedProject {
  id: string;
  name: string;
  description: string | null;
  state: string | null;
  progress: number | null;
  targetDate: string | null;
  url: string | null;
  lead: { id: string; name: string | null } | null;
  summary: string | null;
  syncedAt: string | null;
  isDeleted: boolean;
}

export interface LinearCachedIssue {
  id: string;
  identifier: string;
  title: string;
  description: string | null;
  priority: number | null;
  url: string | null;
  state: { id: string; name: string | null } | null;
  assignee: { id: string; name: string | null } | null;
  team: { id: string; name: string | null; key: string | null } | null;
  project: { id: string; name: string | null } | null;
  summary: string | null;
  syncedAt: string | null;
  isDeleted: boolean;
}

export interface SliteCachedNote {
  id: string;
  title: string;
  content: string | null;
  parentNoteId: string | null;
  url: string | null;
  ownerId: string | null;
  ownerName: string | null;
  reviewState: string | null;
  noteType: string | null;
  summary: string | null;
  syncedAt: string | null;
  updatedAt: string | null;
  lastEditedAt: string | null;
  isDeleted: boolean;
}

export interface NotionCachedPage {
  id: string;
  title: string;
  content: string | null;
  parentId: string | null;
  parentType: string | null;
  url: string | null;
  createdBy: string | null;
  createdByName: string | null;
  lastEditedBy: string | null;
  lastEditedByName: string | null;
  icon: string | null;
  archived: boolean;
  summary: string | null;
  syncedAt: string | null;
  updatedAt: string | null;
  lastEditedAt: string | null;
  isDeleted: boolean;
}

export interface KronusChat {
  id: number;
  trace_id: string;
  question: string;
  answer: string;
  question_preview: string;
  answer_preview: string;
  repository: string | null;
  depth: string;
  status: string;
  has_summary: boolean;
  summary: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  created_at: string;
}

export interface ChatConversation {
  id: number;
  title: string;
  summary: string | null;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface MediaAsset {
  id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  description: string | null;
  alt: string | null;
  destination: string;
  created_at: string;
  drive_url: string | null;
  supabase_url: string | null;
}

export interface SkillCategory {
  id: string;
  name: string;
  color: string;
  icon: string;
  sortOrder: number;
}

export interface AiIntegration {
  key: string;
  displayName: string;
  status: "available" | "missing" | "needs_auth" | "error";
  version: string | null;
  authStatus: string | null;
  sourcePaths: string[];
  configSummary: string | null;
  metadata: Record<string, unknown>;
  lastScannedAt: string | null;
  uuid: string | null;
}

export interface AiArtifact {
  id: number;
  uuid: string | null;
  integrationKey: string;
  kind: string;
  sourcePath: string;
  title: string;
  summary: string | null;
  content?: string | null;
  metadata: Record<string, unknown>;
  contentHash: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiLogSession {
  id: number;
  uuid: string | null;
  integrationKey: string;
  stableId: string;
  sourcePath: string;
  title: string;
  summary: string | null;
  startedAt: string | null;
  updatedAt: string | null;
  messageCount: number;
  metadata: Record<string, unknown>;
}

export interface AiProposal {
  id: number;
  uuid: string | null;
  integrationKey: string;
  targetKind: string;
  targetPath: string;
  title: string;
  content?: string;
  summary: string | null;
  status: "draft" | "accepted" | "superseded";
  sourceArtifactId: number | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
