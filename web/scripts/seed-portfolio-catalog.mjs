#!/usr/bin/env node
/**
 * Idempotent seed for portfolio_products + project catalog overlays.
 * Writes directly to journal.db (same data MCP/Kronus tools would create via API).
 *
 * Usage (from repo root, Node 22):
 *   node web/scripts/seed-portfolio-catalog.mjs
 *   node web/scripts/seed-portfolio-catalog.mjs --via-api   # requires web on :3005 + MCP_API_KEY
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../..");
const requireFromRoot = createRequire(pathToFileURL(path.join(repoRoot, "package.json")));
const Database = requireFromRoot("better-sqlite3");
const seed = JSON.parse(
  fs.readFileSync(path.join(__dirname, "portfolio-catalog-seed.json"), "utf8")
);

function findDbPath() {
  let dir = path.resolve(__dirname, "../..");
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, "data", "journal.db");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error("journal.db not found");
}

function migrateCatalog(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS portfolio_products (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      tagline TEXT NOT NULL,
      humane_description TEXT NOT NULL,
      buyer_pain TEXT NOT NULL,
      promise TEXT NOT NULL,
      deliverables TEXT DEFAULT '[]',
      starting_price TEXT NOT NULL,
      timeline TEXT NOT NULL,
      cta_label TEXT NOT NULL,
      accent TEXT NOT NULL DEFAULT 'gold',
      wildcard INTEGER DEFAULT 0,
      display_order INTEGER DEFAULT 0,
      summary TEXT,
      summary_updated_at TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const cols = [
    ["product_ids", "TEXT DEFAULT '[]'"],
    ["visible", "INTEGER DEFAULT 1"],
    ["diagram_image", "TEXT"],
    ["image_fallback", "TEXT"],
    ["case_study_level", "TEXT"],
    ["humane_problem", "TEXT"],
    ["humane_solution", "TEXT"],
    ["technical_problem", "TEXT"],
    ["technical_solution", "TEXT"],
    ["technical_specs", "TEXT"],
  ];
  for (const [name, def] of cols) {
    try {
      db.exec(`ALTER TABLE portfolio_projects ADD COLUMN ${name} ${def}`);
    } catch (e) {
      if (!String(e.message).includes("duplicate column")) throw e;
    }
  }

  const productCols = [
    ["blueprint_title", "TEXT"],
    ["service_tiers", "TEXT DEFAULT '[]'"],
    ["case_study_cta_label", "TEXT"],
  ];
  for (const [name, def] of productCols) {
    try {
      db.exec(`ALTER TABLE portfolio_products ADD COLUMN ${name} ${def}`);
    } catch (e) {
      if (!String(e.message).includes("duplicate column")) throw e;
    }
  }
}

function seedDirect() {
  const dbPath = process.env.JOURNAL_DB_PATH || findDbPath();
  console.log(`Seeding portfolio catalog → ${dbPath}`);
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  migrateCatalog(db);

  const upsertProduct = db.prepare(`
    INSERT INTO portfolio_products (
      id, title, tagline, humane_description, buyer_pain, promise,
      deliverables, starting_price, timeline, cta_label, accent, wildcard, display_order,
      blueprint_title, service_tiers, case_study_cta_label, updated_at
    ) VALUES (
      @id, @title, @tagline, @humaneDescription, @buyerPain, @promise,
      @deliverables, @startingPrice, @timeline, @ctaLabel, @accent, @wildcard, @displayOrder,
      @blueprintTitle, @serviceTiers, @caseStudyCtaLabel, @updatedAt
    )
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title,
      tagline = excluded.tagline,
      humane_description = excluded.humane_description,
      buyer_pain = excluded.buyer_pain,
      promise = excluded.promise,
      deliverables = excluded.deliverables,
      starting_price = excluded.starting_price,
      timeline = excluded.timeline,
      cta_label = excluded.cta_label,
      accent = excluded.accent,
      wildcard = excluded.wildcard,
      display_order = excluded.display_order,
      blueprint_title = excluded.blueprint_title,
      service_tiers = excluded.service_tiers,
      case_study_cta_label = excluded.case_study_cta_label,
      updated_at = excluded.updated_at
  `);

  const now = new Date().toISOString();
  for (const p of seed.products) {
    upsertProduct.run({
      id: p.id,
      title: p.title,
      tagline: p.tagline,
      humaneDescription: p.humaneDescription,
      buyerPain: p.buyerPain,
      promise: p.promise,
      deliverables: JSON.stringify(p.deliverables || []),
      startingPrice: p.startingPrice,
      timeline: p.timeline,
      ctaLabel: p.ctaLabel,
      accent: p.accent,
      wildcard: p.wildcard ? 1 : 0,
      displayOrder: p.displayOrder ?? 0,
      blueprintTitle: p.blueprintTitle ?? null,
      serviceTiers: JSON.stringify(p.serviceTiers || []),
      caseStudyCtaLabel: p.caseStudyCtaLabel ?? null,
      updatedAt: now,
    });
  }

  const updateProject = db.prepare(`
    UPDATE portfolio_projects SET
      product_ids = @productIds,
      visible = @visible,
      image_fallback = COALESCE(@imageFallback, image_fallback),
      case_study_level = COALESCE(@caseStudyLevel, case_study_level),
      excerpt = COALESCE(excerpt, @excerptFallback),
      humane_problem = COALESCE(@humaneProblem, humane_problem),
      humane_solution = COALESCE(@humaneSolution, humane_solution),
      technical_problem = COALESCE(@technicalProblem, technical_problem),
      technical_solution = COALESCE(@technicalSolution, technical_solution),
      technical_specs = COALESCE(@technicalSpecs, technical_specs),
      updated_at = @updatedAt
    WHERE id = @id
  `);

  let updated = 0;
  let missing = 0;
  for (const [id, overlay] of Object.entries(seed.projectOverlays)) {
    const exists = db.prepare(`SELECT id FROM portfolio_projects WHERE id = ?`).get(id);
    if (!exists) {
      missing++;
      console.warn(`  skip project overlay (not in DB): ${id}`);
      continue;
    }
    updateProject.run({
      id,
      productIds: JSON.stringify(overlay.productIds || []),
      visible: overlay.visible === false ? 0 : 1,
      imageFallback: overlay.imageFallback ?? null,
      caseStudyLevel: overlay.caseStudyLevel ?? null,
      excerptFallback: overlay.excerptFallback ?? null,
      humaneProblem: overlay.humaneProblem ?? null,
      humaneSolution: overlay.humaneSolution ?? null,
      technicalProblem: overlay.technicalProblem ?? null,
      technicalSolution: overlay.technicalSolution ?? null,
      technicalSpecs: overlay.technicalSpecs ?? null,
      updatedAt: now,
    });
    updated++;
  }

  // Hide projects without explicit overlay (placeholders/WIP)
  const hidden = db
    .prepare(
      `UPDATE portfolio_projects SET visible = 0, updated_at = ?
       WHERE id NOT IN (${Object.keys(seed.projectOverlays).map(() => "?").join(",")})`
    )
    .run(now, ...Object.keys(seed.projectOverlays)).changes;

  console.log(`✅ ${seed.products.length} products upserted`);
  console.log(`✅ ${updated} project overlays applied (${missing} missing rows)`);
  console.log(`✅ ${hidden} projects marked hidden (no overlay)`);
  db.close();
}

async function seedViaApi() {
  const base = process.env.TARTARUS_URL || "http://localhost:3005";
  const key = process.env.MCP_API_KEY;
  if (!key) throw new Error("MCP_API_KEY required for --via-api");

  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-MCP-API-Key": key,
  };

  for (const p of seed.products) {
    const res = await fetch(`${base}/api/portfolio-products`, {
      method: "POST",
      headers,
      body: JSON.stringify(p),
    });
    if (res.status === 409) {
      const put = await fetch(`${base}/api/portfolio-products/${p.id}`, {
        method: "PUT",
        headers,
        body: JSON.stringify(p),
      });
      if (!put.ok) throw new Error(`PUT product ${p.id}: ${await put.text()}`);
      console.log(`  updated product ${p.id}`);
    } else if (!res.ok) {
      throw new Error(`POST product ${p.id}: ${await res.text()}`);
    } else {
      console.log(`  created product ${p.id}`);
    }
  }

  for (const [id, overlay] of Object.entries(seed.projectOverlays)) {
    const res = await fetch(`${base}/api/portfolio-projects/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        productIds: overlay.productIds,
        visible: overlay.visible !== false,
        imageFallback: overlay.imageFallback,
        caseStudyLevel: overlay.caseStudyLevel,
        excerpt: overlay.excerptFallback,
        humaneProblem: overlay.humaneProblem,
        humaneSolution: overlay.humaneSolution,
        technicalProblem: overlay.technicalProblem,
        technicalSolution: overlay.technicalSolution,
        technicalSpecs: overlay.technicalSpecs,
      }),
    });
    if (res.status === 404) {
      console.warn(`  skip project ${id} (404)`);
      continue;
    }
    if (!res.ok) throw new Error(`PUT project ${id}: ${await res.text()}`);
    console.log(`  updated project ${id}`);
  }
  console.log("✅ API seed complete");
}

const viaApi = process.argv.includes("--via-api");
if (viaApi) {
  seedViaApi().catch((e) => {
    console.error(e);
    process.exit(1);
  });
} else {
  seedDirect();
}
