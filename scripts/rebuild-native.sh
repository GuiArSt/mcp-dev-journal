#!/usr/bin/env bash
# Rebuild better-sqlite3 for Node 22 (MCP runtime ABI).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

NODE=""
if [ -n "${TARTARUS_NODE:-}" ] && [ -x "$TARTARUS_NODE" ]; then
  NODE="$TARTARUS_NODE"
elif [ -f "$ROOT/.node-path" ]; then
  NODE="$(tr -d '[:space:]' < "$ROOT/.node-path")"
fi
if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  for candidate in \
    "/opt/homebrew/opt/node@22/bin/node" \
    "/usr/local/opt/node@22/bin/node"; do
    if [ -x "$candidate" ]; then
      NODE="$candidate"
      break
    fi
  done
fi

if [ -z "$NODE" ] || [ ! -x "$NODE" ]; then
  echo "rebuild-native: Node 22 not found. brew install node@22" >&2
  exit 1
fi

echo "Rebuilding better-sqlite3 with $("$NODE" -v) ($NODE)"
export PATH="$(dirname "$NODE"):$PATH"
npm rebuild better-sqlite3
echo "Done."
