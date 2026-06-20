/**
 * Resolve stored image paths for Tartarus media and portfolio display.
 * Muse painters may return https URLs; portfolio rows sometimes store bare filenames.
 */

import type Database from "better-sqlite3";

const MUSE_FILENAME_RE = /^\/?(muse(?:-edit)?-(?:mood|infographic)-\d+\.png)$/i;

export function museFilenameFromPath(path: string): string | null {
  const m = path.match(MUSE_FILENAME_RE);
  return m ? m[1] : null;
}

export function lookupMediaIdByFilename(db: Database.Database, filename: string): number | null {
  const row = db.prepare(`SELECT id FROM media_assets WHERE filename = ?`).get(filename) as
    | { id: number }
    | undefined;
  return row?.id ?? null;
}

/** Map portfolio / stored image fields to a browser-loadable URL. */
export function resolveStoredImageUrl(
  image: string | null | undefined,
  lookupByFilename: (filename: string) => number | null,
): string | null {
  if (!image) return null;
  if (
    image.startsWith("/api/media/") ||
    image.startsWith("http://") ||
    image.startsWith("https://") ||
    image.startsWith("data:")
  ) {
    return image;
  }
  const filename = museFilenameFromPath(image);
  if (filename) {
    const id = lookupByFilename(filename);
    return id != null ? `/api/media/${id}/raw` : null;
  }
  // Seed data paths for the public website — not served by Tartarus web.
  if (image.startsWith("/images/")) return null;
  return image;
}

export function resolveStoredImageUrlWithDb(
  image: string | null | undefined,
  db: Database.Database,
): string | null {
  return resolveStoredImageUrl(image, (fn) => lookupMediaIdByFilename(db, fn));
}

/** API read path — resolve muse filenames; hide website-only seed paths. */
export function portfolioProjectImageForClient(
  image: string | null | undefined,
  db: Database.Database,
): string | null {
  const resolved = resolveStoredImageUrlWithDb(image, db);
  if (resolved) return resolved;
  if (image?.startsWith("/images/")) return null;
  return image ?? null;
}

/** API write path — store /api/media/... when Kronus passes a bare muse filename. */
export function normalizePortfolioImageInput(
  image: string,
  db: Database.Database,
): string {
  const filename = museFilenameFromPath(image);
  if (!filename) return image;
  const id = lookupMediaIdByFilename(db, filename);
  return id != null ? `/api/media/${id}/raw` : image;
}

/** Normalize muse painter output to a data: URL for SQLite persistence. */
export async function normalizePaintOutputToDataUrl(
  urlOrData: string,
  signal?: AbortSignal,
): Promise<string> {
  if (urlOrData.startsWith("data:")) return urlOrData;
  if (!/^https?:\/\//i.test(urlOrData)) {
    throw new Error(`paint output must be data: or http(s) URL, got: ${urlOrData.slice(0, 80)}`);
  }
  const res = await fetch(urlOrData, { signal });
  if (!res.ok) throw new Error(`failed to fetch paint output (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type")?.split(";")[0]?.trim() || "image/png";
  return `data:${mime};base64,${buf.toString("base64")}`;
}
