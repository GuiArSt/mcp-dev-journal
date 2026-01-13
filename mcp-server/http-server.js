#!/usr/bin/env node
/**
 * HTTP Wrapper for Developer Journal MCP Server
 *
 * Exposes the MCP tools as a simple REST API for Docker deployment.
 * This is simpler than MCP-over-SSE and works better in containerized environments.
 *
 * Endpoints:
 *   POST /api/journal/entries     - Create journal entry
 *   GET  /api/journal/entries/:hash - Get entry by commit hash
 *   GET  /api/journal/repositories - List repositories
 *   GET  /api/journal/repositories/:repo/entries - List entries by repo
 *   GET  /api/journal/repositories/:repo/branches - List branches
 *   GET  /api/journal/repositories/:repo/branches/:branch/entries - List entries by branch
 *   GET  /api/journal/repositories/:repo/summary - Get project summary
 *   GET  /api/journal/summaries - List all project summaries
 *   GET  /api/journal/attachments/:hash - List attachments for commit
 *   GET  /api/journal/attachment/:id - Get attachment by ID
 *   GET  /api/health - Health check
 */

import http from 'node:http';
import url from 'node:url';

// Import database functions from built MCP server
import { initDatabase } from './dist/modules/journal/db/database.js';
import {
  commitHasEntry,
  getEntryByCommit,
  getEntriesByRepositoryPaginated,
  getEntriesByBranchPaginated,
  listRepositories,
  listBranches,
  getProjectSummary,
  listAllProjectSummariesPaginated,
  getAttachmentMetadataByCommit,
  getAttachmentById,
  insertJournalEntry,
} from './dist/modules/journal/db/database.js';
import { generateJournalEntry } from './dist/modules/journal/ai/generate-entry.js';

const PORT = process.env.PORT || 3333;
const DB_PATH = process.env.JOURNAL_DB_PATH || './data/journal.db';
const AI_PROVIDER = process.env.AI_PROVIDER || 'anthropic';
const AI_API_KEY = process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.GOOGLE_API_KEY;

// Initialize database
console.log(`Initializing database at ${DB_PATH}`);
initDatabase(DB_PATH);

// Journal config for AI generation
const journalConfig = {
  dbPath: DB_PATH,
  aiProvider: AI_PROVIDER,
  aiApiKey: AI_API_KEY,
  tartarusUrl: process.env.TARTARUS_URL,
};

/**
 * Parse JSON body from request
 */
async function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * Send JSON response
 */
function sendJson(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data, null, 2));
}

/**
 * Send error response
 */
function sendError(res, message, status = 500) {
  sendJson(res, { error: message }, status);
}

/**
 * Parse query parameters
 */
function parseQuery(reqUrl) {
  const parsed = url.parse(reqUrl, true);
  return {
    limit: parseInt(parsed.query.limit) || 20,
    offset: parseInt(parsed.query.offset) || 0,
    include_raw_report: parsed.query.include_raw_report === 'true',
  };
}

/**
 * Request handler
 */
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
        ai_provider: AI_PROVIDER,
      });
    }

    // Create journal entry
    if (pathname === '/api/journal/entries' && method === 'POST') {
      const body = await parseBody(req);
      const { commit_hash, repository, branch, author, date, raw_agent_report } = body;

      if (!commit_hash || !repository || !branch || !author || !date || !raw_agent_report) {
        return sendError(res, 'Missing required fields: commit_hash, repository, branch, author, date, raw_agent_report', 400);
      }

      if (commitHasEntry(commit_hash)) {
        return sendJson(res, {
          success: false,
          error: `Entry already exists for commit ${commit_hash}`
        }, 409);
      }

      // Generate AI analysis
      const aiOutput = await generateJournalEntry({
        commit_hash,
        repository,
        branch,
        author,
        date,
        raw_agent_report,
      }, journalConfig);

      // Insert into database
      const entryId = insertJournalEntry({
        commit_hash,
        repository,
        branch,
        author,
        date,
        why: aiOutput.why,
        what_changed: aiOutput.what_changed,
        decisions: aiOutput.decisions,
        technologies: aiOutput.technologies,
        kronus_wisdom: aiOutput.kronus_wisdom ?? null,
        raw_agent_report,
      });

      return sendJson(res, {
        success: true,
        entry_id: entryId,
        commit_hash,
        repository,
        branch,
        why: aiOutput.why,
        what_changed: aiOutput.what_changed,
        decisions: aiOutput.decisions,
        technologies: aiOutput.technologies,
        kronus_wisdom: aiOutput.kronus_wisdom || null,
      }, 201);
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

    // List attachments for commit
    const attachmentsMatch = pathname.match(/^\/api\/journal\/attachments\/([a-f0-9]+)$/);
    if (attachmentsMatch && method === 'GET') {
      const commitHash = attachmentsMatch[1];
      const attachments = getAttachmentMetadataByCommit(commitHash);
      return sendJson(res, { commit_hash: commitHash, attachments, count: attachments.length });
    }

    // Get attachment by ID
    const attachmentMatch = pathname.match(/^\/api\/journal\/attachment\/(\d+)$/);
    if (attachmentMatch && method === 'GET') {
      const id = parseInt(attachmentMatch[1]);
      const includeData = parsedUrl.query.include_data === 'true';
      const attachment = getAttachmentById(id);

      if (!attachment) {
        return sendError(res, `No attachment found with ID ${id}`, 404);
      }

      const response = {
        id: attachment.id,
        filename: attachment.filename,
        mime_type: attachment.mime_type,
        description: attachment.description,
        file_size: attachment.file_size,
        commit_hash: attachment.commit_hash,
        uploaded_at: attachment.uploaded_at,
      };

      if (includeData) {
        response.data_base64 = attachment.data.toString('base64');
      }

      return sendJson(res, response);
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
  console.log(`AI Provider: ${AI_PROVIDER}`);
  console.log(`Endpoints:`);
  console.log(`  POST /api/journal/entries - Create entry`);
  console.log(`  GET  /api/journal/entries/:hash - Get entry`);
  console.log(`  GET  /api/journal/repositories - List repos`);
  console.log(`  GET  /api/journal/repositories/:repo/entries - List entries`);
  console.log(`  GET  /api/health - Health check`);
});
