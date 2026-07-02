#!/usr/bin/env node
/** Split fortress schema tables SQL into apply batches (stdout JSON array). */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const file = path.join(root, "docs", "supabase-migrations", "fortress_001_schema.sql");
let sql = fs.readFileSync(file, "utf8");
const idxMarker = sql.indexOf("\n-- Indexes");
if (idxMarker >= 0) sql = sql.slice(0, idxMarker);

const headerEnd = sql.indexOf("-- ai_artifacts");
const header = sql.slice(0, headerEnd);
const rest = sql.slice(headerEnd);

const chunks = rest.split(/\n(?=-- [a-z_])/);
const batches = [];
let current = header;

for (const chunk of chunks) {
  if (!chunk.trim()) continue;
  if ((current + chunk).length > 12000 && current !== header) {
    batches.push(current.trim());
    current = chunk;
  } else {
    current += chunk;
  }
}
if (current.trim()) batches.push(current.trim());

const outDir = path.join(root, "docs", "supabase-migrations", "fortress_batches");
fs.mkdirSync(outDir, { recursive: true });
batches.forEach((b, i) => {
  const name = `batch_${String(i + 1).padStart(2, "0")}.sql`;
  fs.writeFileSync(path.join(outDir, name), b);
});
console.log(`Wrote ${batches.length} batches to ${outDir}`);
