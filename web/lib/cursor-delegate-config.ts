import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export type CursorDelegateProject = {
  id: string;
  /** Absolute resolved directory root */
  root: string;
};

function expandHome(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

function tryRealpathDir(dir: string): string | null {
  try {
    const st = fs.statSync(dir);
    if (!st.isDirectory()) return null;
    return fs.realpathSync(dir);
  } catch {
    return null;
  }
}

function slugId(raw: string): string {
  const s = raw
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "repo";
}

type RawRepoEntry = string | { id?: string; path: string };

function dedupeCollidingIds(projects: CursorDelegateProject[]): CursorDelegateProject[] {
  const seen = new Map<string, number>();
  return projects.map((p) => {
    const n = (seen.get(p.id) ?? 0) + 1;
    seen.set(p.id, n);
    const id = n === 1 ? p.id : `${p.id}-${n}`;
    return { ...p, id };
  });
}

/**
 * Load registered git working trees for Cursor delegation.
 *
 * 1. `CURSOR_DELEGATE_REPOS_FILE` — JSON file `{ "repos": [ { "id"?, "path" } | "/path" ] }` (evaluated first)
 * 2. `CURSOR_DELEGATE_CWD_ALLOWLIST` — comma-separated paths; `id` defaults to directory basename
 */
export function loadCursorDelegateProjects(): CursorDelegateProject[] {
  const raw: RawRepoEntry[] = [];

  const filePath = process.env.CURSOR_DELEGATE_REPOS_FILE?.trim();
  if (filePath) {
    const expandedFile = expandHome(filePath);
    try {
      if (fs.existsSync(expandedFile)) {
        const parsed = JSON.parse(fs.readFileSync(expandedFile, "utf8")) as { repos?: unknown };
        const repos = parsed.repos;
        if (Array.isArray(repos)) {
          for (const entry of repos) {
            if (typeof entry === "string") raw.push(entry);
            else if (entry && typeof entry === "object" && "path" in entry) {
              raw.push({
                id: typeof (entry as { id?: unknown }).id === "string" ? (entry as { id: string }).id : undefined,
                path: String((entry as { path: unknown }).path),
              });
            }
          }
        }
      }
    } catch (e) {
      console.error("[cursor-delegate] Failed to read CURSOR_DELEGATE_REPOS_FILE:", e);
    }
  }

  const allow = process.env.CURSOR_DELEGATE_CWD_ALLOWLIST?.trim();
  if (allow) {
    for (const part of allow.split(",")) {
      const t = part.trim();
      if (t) raw.push(t);
    }
  }

  const projects: CursorDelegateProject[] = [];
  for (const entry of raw) {
    const pathStr = typeof entry === "string" ? entry : entry.path;
    const expandedPath = expandHome(pathStr.trim());
    const root = tryRealpathDir(expandedPath);
    if (!root) continue;
    const id =
      typeof entry === "object" && entry.id ? slugId(entry.id) : slugId(path.basename(root));
    projects.push({ id, root });
  }

  const byRoot = new Map<string, CursorDelegateProject>();
  for (const p of projects) {
    if (!byRoot.has(p.root)) byRoot.set(p.root, p);
  }

  return dedupeCollidingIds([...byRoot.values()]);
}

export function findCursorDelegateProject(
  projects: CursorDelegateProject[],
  projectId: string
): CursorDelegateProject | undefined {
  const want = projectId.toLowerCase().trim();
  return projects.find((p) => p.id === want);
}

/**
 * Map Tartarus journal `repository` string to a Cursor delegate project (Reader Analyze, chat tools).
 * Order: exact `project_id`, slug of repository name, directory basename slug on each registered root.
 */
export function resolveCursorProjectForRepository(
  projects: CursorDelegateProject[],
  repository: string,
): CursorDelegateProject | undefined {
  const norm = repository.toLowerCase().trim();
  if (!norm) return undefined;

  let hit = findCursorDelegateProject(projects, norm);
  if (hit) return hit;

  const repoSlug = slugId(norm);
  hit = findCursorDelegateProject(projects, repoSlug);
  if (hit) return hit;

  for (const p of projects) {
    const baseSlug = slugId(path.basename(p.root));
    if (baseSlug === repoSlug) return p;
  }
  return undefined;
}

export function formatProjectListHint(projects: CursorDelegateProject[]): string {
  if (projects.length === 0) {
    return (
      "No delegate roots configured. Clone repos with git, then either: " +
      "(1) set CURSOR_DELEGATE_REPOS_FILE to a JSON file `{ \"repos\": [{ \"id\": \"my-app\", \"path\": \"/abs/path/clone\" }] }`, " +
      "and/or (2) set CURSOR_DELEGATE_CWD_ALLOWLIST to comma-separated absolute paths. Restart the dev server after changes."
    );
  }
  return `Configured project_id values: ${projects.map((p) => p.id).join(", ")}`;
}
