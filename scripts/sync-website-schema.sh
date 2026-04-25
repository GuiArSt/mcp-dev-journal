#!/usr/bin/env bash
# Copies tartarus's canonical Drizzle schema into the website submodule.
# Run before website dev/build so the website never drifts.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/web/lib/db/schema.ts"
DST="$ROOT/website/lib/db/schema.ts"

if [ ! -f "$SRC" ]; then
  echo "✗ source schema missing at $SRC" >&2
  exit 1
fi

if [ ! -d "$(dirname "$DST")" ]; then
  echo "✗ website/lib/db/ missing — submodule not checked out?" >&2
  exit 1
fi

BANNER='// =============================================================================
// AUTO-GENERATED — DO NOT EDIT
// Source of truth: tartarus/web/lib/db/schema.ts
// Sync via:       make sync-schema   (or scripts/sync-website-schema.sh)
// =============================================================================
'

{ printf '%s\n' "$BANNER"; cat "$SRC"; } > "$DST"
echo "✓ synced schema → $DST"
