#!/usr/bin/env node
/**
 * Apply fortress schema batches via Supabase Management API.
 * Reads SUPABASE_ACCESS_TOKEN from ~/.cursor/mcp.json (supabase server).
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..", "..");
const projectRef = "xztuhcvdwhueavigemsa";
const batchDir = path.join(root, "docs", "supabase-migrations", "fortress_batches");

function loadAccessToken() {
  const mcpPath = path.join(os.homedir(), ".cursor/mcp.json");
  const mcp = JSON.parse(fs.readFileSync(mcpPath, "utf8"));
  const token = mcp?.mcpServers?.supabase?.env?.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error("SUPABASE_ACCESS_TOKEN missing in ~/.cursor/mcp.json");
  return token;
}

async function runSql(token, sql, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${body}`);
  }
  console.log(`${label}: ok`);
  return body;
}

async function main() {
  const token = loadAccessToken();
  const onlyIndexes = process.argv.includes("--indexes");

  if (onlyIndexes) {
    const schema = fs.readFileSync(
      path.join(root, "docs", "supabase-migrations", "fortress_001_schema.sql"),
      "utf8",
    );
    const idx = schema.indexOf("-- Indexes");
    if (idx < 0) throw new Error("No indexes section in schema");
    await runSql(token, schema.slice(idx), "indexes");
    return;
  }

  for (const name of ["batch_01.sql", "batch_02.sql", "batch_03.sql"]) {
    const sql = fs.readFileSync(path.join(batchDir, name), "utf8");
    await runSql(token, sql, name);
  }

  await mainIndexes(token);
}

async function mainIndexes(token) {
  const schema = fs.readFileSync(
    path.join(root, "docs", "supabase-migrations", "fortress_001_schema.sql"),
    "utf8",
  );
  const idx = schema.indexOf("-- Indexes");
  if (idx < 0) return;
  await runSql(token, schema.slice(idx), "indexes");
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
