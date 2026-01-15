#!/usr/bin/env node
/**
 * HTTP Wrapper for Developer Journal MCP Server
 *
 * STANDALONE implementation - uses better-sqlite3 directly.
 * Does NOT import from the bundled MCP server (esbuild creates single bundle).
 *
 * Endpoints:
 *   GET  /api/journal/entries/:hash - Get entry by commit hash
 *   GET  /api/journal/repositories - List repositories
 *   GET  /api/journal/repositories/:repo/entries - List entries by repo
 *   GET  /api/journal/repositories/:repo/branches - List branches
 *   GET  /api/journal/repositories/:repo/branches/:branch/entries - List entries by branch
 *   GET  /api/journal/repositories/:repo/summary - Get project summary
 *   GET  /api/journal/summaries - List all project summaries
 *   GET  /api/health - Health check
 */

import http from 'node:http';
import url from 'node:url';
import Database from 'better-sqlite3';

const PORT = process.env.PORT || 3333;
const DB_PATH = process.env.JOURNAL_DB_PATH || './data/journal.db';

// Initialize database
console.log(`Initializing database at ${DB_PATH}`);
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

// ============================================
// Database Query Functions
// ============================================

function getEntryByCommit(commitHash) {
  // Try exact match first, then prefix match
  let entry = db.prepare('SELECT * FROM journal_entries WHERE commit_hash = ?').get(commitHash);
  if (!entry) {
    entry = db.prepare('SELECT * FROM journal_entries WHERE commit_hash LIKE ?').get(`${commitHash}%`);
  }
  if (entry && entry.files_changed) {
    try {
      entry.files_changed = JSON.parse(entry.files_changed);
    } catch {}
  }
  return entry;
}

function getEntriesByRepositoryPaginated(repository, limit, offset) {
  const entries = db.prepare(`
    SELECT * FROM journal_entries
    WHERE repository = ?
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `).all(repository, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM journal_entries WHERE repository = ?').get(repository).count;

  entries.forEach(e => {
    if (e.files_changed) {
      try { e.files_changed = JSON.parse(e.files_changed); } catch {}
    }
  });

  return { entries, total };
}

function getEntriesByBranchPaginated(repository, branch, limit, offset) {
  const entries = db.prepare(`
    SELECT * FROM journal_entries
    WHERE repository = ? AND branch = ?
    ORDER BY date DESC
    LIMIT ? OFFSET ?
  `).all(repository, branch, limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM journal_entries WHERE repository = ? AND branch = ?')
    .get(repository, branch).count;

  entries.forEach(e => {
    if (e.files_changed) {
      try { e.files_changed = JSON.parse(e.files_changed); } catch {}
    }
  });

  return { entries, total };
}

function listRepositories() {
  const rows = db.prepare('SELECT DISTINCT repository FROM journal_entries ORDER BY repository').all();
  return rows.map(r => r.repository);
}

function listBranches(repository) {
  const rows = db.prepare('SELECT DISTINCT branch FROM journal_entries WHERE repository = ? ORDER BY branch').all(repository);
  return rows.map(r => r.branch);
}

function getProjectSummary(repository) {
  return db.prepare('SELECT * FROM project_summaries WHERE repository = ?').get(repository);
}

function listAllProjectSummariesPaginated(limit, offset) {
  const summaries = db.prepare(`
    SELECT * FROM project_summaries
    ORDER BY repository
    LIMIT ? OFFSET ?
  `).all(limit, offset);

  const total = db.prepare('SELECT COUNT(*) as count FROM project_summaries').get().count;

  return { summaries, total };
}

// ============================================
// HTTP Server
// ============================================

function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

function sendError(res, message, status = 500) {
  sendJson(res, { error: message }, status);
}

function parseQuery(reqUrl) {
  const parsed = url.parse(reqUrl, true);
  return {
    limit: parseInt(parsed.query.limit) || 20,
    offset: parseInt(parsed.query.offset) || 0,
    include_raw_report: parsed.query.include_raw_report === 'true',
  };
}

async function handleRequest(req, res) {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    // Health check
    if (pathname === '/api/health' && method === 'GET') {
      return sendJson(res, {
        status: 'healthy',
        version: '2.0.0',
        database: DB_PATH,
      });
    }

    // Get entry by commit hash
    const entryMatch = pathname.match(/^\/api\/journal\/entries\/([a-f0-9]+)$/);
    if (entryMatch && method === 'GET') {
      const commitHash = entryMatch[1];
      const { include_raw_report } = parseQuery(req.url);
      const entry = getEntryByCommit(commitHash);

      if (!entry) {
        return sendError(res, `No entry found for commit ${commitHash}`, 404);
      }

      if (!include_raw_report) {
        delete entry.raw_agent_report;
      }
      return sendJson(res, entry);
    }

    // List repositories
    if (pathname === '/api/journal/repositories' && method === 'GET') {
      const repositories = listRepositories();
      return sendJson(res, { repositories, count: repositories.length });
    }

    // List entries by repository
    const repoEntriesMatch = pathname.match(/^\/api\/journal\/repositories\/([^/]+)\/entries$/);
    if (repoEntriesMatch && method === 'GET') {
      const repository = decodeURIComponent(repoEntriesMatch[1]);
      const { limit, offset, include_raw_report } = parseQuery(req.url);
      const { entries, total } = getEntriesByRepositoryPaginated(repository, Math.min(limit, 50), offset);

      if (!include_raw_report) {
        entries.forEach(e => delete e.raw_agent_report);
      }

      return sendJson(res, {
        repository,
        entries,
        total,
        limit,
        offset,
        has_more: offset + entries.length < total,
      });
    }

    // List branches for repository
    const branchesMatch = pathname.match(/^\/api\/journal\/repositories\/([^/]+)\/branches$/);
    if (branchesMatch && method === 'GET') {
      const repository = decodeURIComponent(branchesMatch[1]);
      const branches = listBranches(repository);
      return sendJson(res, { repository, branches, count: branches.length });
    }

    // List entries by branch
    const branchEntriesMatch = pathname.match(/^\/api\/journal\/repositories\/([^/]+)\/branches\/([^/]+)\/entries$/);
    if (branchEntriesMatch && method === 'GET') {
      const repository = decodeURIComponent(branchEntriesMatch[1]);
      const branch = decodeURIComponent(branchEntriesMatch[2]);
      const { limit, offset, include_raw_report } = parseQuery(req.url);
      const { entries, total } = getEntriesByBranchPaginated(repository, branch, Math.min(limit, 50), offset);

      if (!include_raw_report) {
        entries.forEach(e => delete e.raw_agent_report);
      }

      return sendJson(res, {
        repository,
        branch,
        entries,
        total,
        limit,
        offset,
        has_more: offset + entries.length < total,
      });
    }

    // Get project summary
    const summaryMatch = pathname.match(/^\/api\/journal\/repositories\/([^/]+)\/summary$/);
    if (summaryMatch && method === 'GET') {
      const repository = decodeURIComponent(summaryMatch[1]);
      const summary = getProjectSummary(repository);

      if (!summary) {
        return sendError(res, `No summary found for ${repository}`, 404);
      }
      return sendJson(res, summary);
    }

    // List all project summaries
    if (pathname === '/api/journal/summaries' && method === 'GET') {
      const { limit, offset } = parseQuery(req.url);
      const { summaries, total } = listAllProjectSummariesPaginated(Math.min(limit, 50), offset);
      return sendJson(res, {
        summaries,
        total,
        limit,
        offset,
        has_more: offset + summaries.length < total,
      });
    }

    // 404 for unknown routes
    return sendError(res, `Not found: ${method} ${pathname}`, 404);

  } catch (error) {
    console.error('Request error:', error);
    return sendError(res, error.message || 'Internal server error', 500);
  }
}

// Create and start server
const server = http.createServer(handleRequest);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Developer Journal HTTP API listening on port ${PORT}`);
  console.log(`Database: ${DB_PATH}`);
  console.log(`Endpoints:`);
  console.log(`  GET  /api/journal/entries/:hash - Get entry`);
  console.log(`  GET  /api/journal/repositories - List repos`);
  console.log(`  GET  /api/journal/repositories/:repo/entries - List entries`);
  console.log(`  GET  /api/journal/repositories/:repo/summary - Get summary`);
  console.log(`  GET  /api/journal/summaries - List all summaries`);
  console.log(`  GET  /api/health - Health check`);
});
