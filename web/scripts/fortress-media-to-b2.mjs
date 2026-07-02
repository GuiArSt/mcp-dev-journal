#!/usr/bin/env node
/**
 * Upload inline media bytes from SQLite to Backblaze B2 (S3 API).
 * Sets object_key locally + updates Supabase mirror metadata (no data column).
 *
 * Usage:
 *   node scripts/fortress-media-to-b2.mjs [--dry-run] [--clear-local]
 *
 * Required .env (repo root):
 *   B2_APPLICATION_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_MEDIA, B2_ENDPOINT
 *   JOURNAL_DB_PATH, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY
 */

import dotenv from "dotenv";
import Database from "better-sqlite3";
import { createClient } from "@supabase/supabase-js";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env") });

const dbPath = process.env.JOURNAL_DB_PATH || path.join(root, "data", "journal.db");
const dryRun = process.argv.includes("--dry-run");
const clearLocal = process.argv.includes("--clear-local") || !dryRun;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing ${name} in .env`);
  return v;
}

function b2Client() {
  return new S3Client({
    region: process.env.B2_REGION || "auto",
    endpoint: requireEnv("B2_ENDPOINT"),
    credentials: {
      accessKeyId: requireEnv("B2_APPLICATION_KEY_ID"),
      secretAccessKey: requireEnv("B2_APPLICATION_KEY"),
    },
    forcePathStyle: true,
  });
}

function objectKeyForMedia(id, filename) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `media/${id}/${safe}`;
}

function objectKeyForAttachment(id, filename) {
  const safe = filename.replace(/[^a-zA-Z0-9._-]+/g, "_");
  return `attachments/${id}/${safe}`;
}

function decodeMediaData(data) {
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  const s = String(data);
  if (s.startsWith("data:")) {
    const b64 = s.split(",")[1];
    return b64 ? Buffer.from(b64, "base64") : null;
  }
  return Buffer.from(s, "base64");
}

async function upload(client, bucket, key, body, mimeType) {
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: mimeType,
    }),
  );
}

async function main() {
  if (!fs.existsSync(dbPath)) {
    console.error(`SQLite not found: ${dbPath}`);
    process.exit(1);
  }

  const bucket = dryRun ? process.env.B2_BUCKET_MEDIA || "tartarus-media" : requireEnv("B2_BUCKET_MEDIA");
  const client = dryRun ? null : b2Client();
  const sqlite = new Database(dbPath);
  const sb =
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY
      ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
          auth: { autoRefreshToken: false, persistSession: false },
        })
      : null;

  const mediaRows = sqlite
    .prepare(
      `SELECT id, filename, mime_type, file_size, data
       FROM media_assets
       WHERE data IS NOT NULL AND length(data) > 100`,
    )
    .all();

  const attachRows = sqlite
    .prepare(
      `SELECT id, filename, mime_type, file_size, data
       FROM entry_attachments
       WHERE data IS NOT NULL AND length(data) > 0`,
    )
    .all();

  console.log(
    `fortress:media — ${mediaRows.length} media_assets, ${attachRows.length} entry_attachments${dryRun ? " (dry-run)" : ""}`,
  );

  let uploaded = 0;
  let bytes = 0;

  for (const row of mediaRows) {
    const body = decodeMediaData(row.data);
    if (!body?.length) {
      console.log(`  skip media ${row.id} (empty decode)`);
      continue;
    }
    const key = objectKeyForMedia(row.id, row.filename);
    if (dryRun) {
      console.log(`  would upload media ${row.id} → ${key} (${body.length} bytes)`);
      continue;
    }
    await upload(client, bucket, key, body, row.mime_type);
    sqlite
      .prepare(`UPDATE media_assets SET object_key = ?, data = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(key, row.id);
    if (sb) {
      await sb.from("media_assets").update({ object_key: key, data: null }).eq("id", row.id);
    }
    uploaded++;
    bytes += body.length;
    console.log(`  media ${row.id} → ${key}`);
  }

  for (const row of attachRows) {
    const body = decodeMediaData(row.data);
    if (!body?.length) continue;
    const key = objectKeyForAttachment(row.id, row.filename);
    if (dryRun) {
      console.log(`  would upload attachment ${row.id} → ${key} (${body.length} bytes)`);
      continue;
    }
    await upload(client, bucket, key, body, row.mime_type);
    if (clearLocal) {
      sqlite
        .prepare(
          `UPDATE entry_attachments SET object_key = ?, data = NULL WHERE id = ?`,
        )
        .run(key, row.id);
      if (sb) {
        await sb.from("entry_attachments").update({ object_key: key, data: null }).eq("id", row.id);
      }
    }
    uploaded++;
    bytes += body.length;
    console.log(`  attachment ${row.id} → ${key}`);
  }

  sqlite.close();
  console.log(`\nDone — ${uploaded} objects, ${(bytes / 1024 / 1024).toFixed(1)} MB uploaded.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
