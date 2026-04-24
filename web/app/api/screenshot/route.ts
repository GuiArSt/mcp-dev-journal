import { NextRequest, NextResponse } from "next/server";
import { getDatabase } from "@/lib/db";
import { withErrorHandler } from "@/lib/api-handler";
import { requireBody } from "@/lib/validations";
import { ValidationError } from "@/lib/errors";
import { generateToken } from "@/lib/auth";
import { z } from "zod";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const screenshotSchema = z.object({
  url: z.string().url(),
  commit_hash: z.string().optional(),
  label: z.string().optional(),
  waitForSelector: z.string().optional(),
});

/**
 * POST /api/screenshot
 *
 * Capture a screenshot of a localhost URL and store it as a media asset.
 * Only accepts localhost/127.0.0.1 URLs for security.
 *
 * Body: { url, commit_hash?, label?, waitForSelector? }
 * Returns: { mediaId, uuid, rawUrl }
 */
export const POST = withErrorHandler(async (request: NextRequest) => {
  const body = await requireBody(screenshotSchema, request);

  const parsed = new URL(body.url);
  if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new ValidationError("Only localhost URLs are allowed for screenshots");
  }

  const { chromium } = await import("playwright");

  // Generate a short-lived auth token so Playwright can access protected routes
  const authToken = generateToken({ id: "screenshot-agent", email: "screenshot@journal.local" });

  const browser = await chromium.launch({ headless: true });
  let base64: string;
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await context.addCookies([{
      name: "auth-token",
      value: authToken,
      url: `http://${parsed.hostname}:${parsed.port || 80}`,
      httpOnly: true,
      sameSite: "Lax",
    }]);
    const page = await context.newPage();
    await page.goto(body.url, { waitUntil: "networkidle", timeout: 30000 });

    if (body.waitForSelector) {
      await page.waitForSelector(body.waitForSelector, { timeout: 10000 });
    }

    const buffer = await page.screenshot({ type: "png", fullPage: false });
    base64 = buffer.toString("base64");
  } finally {
    await browser.close();
  }

  const fileSize = Math.ceil(base64.length * 0.75);
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const routeSlug = parsed.pathname.replace(/\//g, "_").replace(/^_/, "") || "root";
  const filename = `screenshot_${routeSlug}_${timestamp}.png`;
  const label = body.label || `Screenshot of ${body.url}`;

  const db = getDatabase();
  const result = db
    .prepare(
      `INSERT INTO media_assets (filename, mime_type, data, file_size, description, tags, destination, commit_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      filename,
      "image/png",
      base64,
      fileSize,
      label,
      JSON.stringify(["screenshot", "journal-visual"]),
      body.commit_hash ? "journal" : "media",
      body.commit_hash ?? null,
    );

  const mediaId = result.lastInsertRowid as number;

  let uuid: string | null = null;
  try {
    const { registerObject } = await import("@/lib/object-registry");
    uuid = registerObject({
      type: "media_asset",
      sourceTable: "media_assets",
      sourceId: String(mediaId),
      title: filename,
      summary: label,
      tags: ["screenshot", "journal-visual"],
    });
  } catch { /* registry is non-critical */ }

  return NextResponse.json({
    mediaId,
    uuid,
    rawUrl: `/api/media/${mediaId}/raw`,
    filename,
    label,
    commit_hash: body.commit_hash ?? null,
  });
});
