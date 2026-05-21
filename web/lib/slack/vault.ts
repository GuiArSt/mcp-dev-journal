import { getDatabase } from "@/lib/db";

export type SlackVaultType = "personal_conversation" | "group" | "public_forum";

export interface SlackSyncOptions {
  syncUsers?: boolean;
  syncConversations?: boolean;
  syncMessages?: boolean;
  syncThreads?: boolean;
  types?: string;
  maxConversations?: number;
  maxConversationPages?: number;
  messageLimit?: number;
  maxThreadPages?: number;
  threadReplyLimit?: number;
  maxThreadsPerConversation?: number;
  continueBackfill?: boolean;
  maxRateLimitWaitMs?: number;
  includeArchived?: boolean;
  includeNonMemberPublic?: boolean;
  forceFull?: boolean;
}

const DEFAULT_RATE_LIMIT_WAIT_MS = 70_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SlackApiResponse<T> {
  ok: boolean;
  error?: string;
  response_metadata?: { next_cursor?: string };
  needed?: string;
  provided?: string;
  retry_after?: number;
  [key: string]: unknown;
}

interface SlackUser {
  id: string;
  team_id?: string;
  name?: string;
  real_name?: string;
  tz?: string;
  is_bot?: boolean;
  deleted?: boolean;
  profile?: Record<string, unknown>;
}

interface SlackAuthInfo {
  team_id?: string;
  team?: string;
  user_id?: string;
  user?: string;
  url?: string;
}

interface SlackConversation {
  id: string;
  name?: string;
  is_channel?: boolean;
  is_group?: boolean;
  is_im?: boolean;
  is_mpim?: boolean;
  is_private?: boolean;
  is_member?: boolean;
  is_archived?: boolean;
  user?: string;
  topic?: { value?: string };
  purpose?: { value?: string };
  num_members?: number;
  updated?: number;
}

interface SlackMessage {
  ts: string;
  user?: string;
  username?: string;
  bot_id?: string;
  subtype?: string;
  text?: string;
  thread_ts?: string;
  parent_user_id?: string;
  reply_count?: number;
}

function getSlackToken(): { token: string; source: "SLACK_USER_TOKEN" | "SLACK_BOT_TOKEN" } | null {
  if (process.env.SLACK_USER_TOKEN) return { token: process.env.SLACK_USER_TOKEN, source: "SLACK_USER_TOKEN" };
  if (process.env.SLACK_BOT_TOKEN) return { token: process.env.SLACK_BOT_TOKEN, source: "SLACK_BOT_TOKEN" };
  return null;
}

async function slackApi<T>(
  method: string,
  params: Record<string, string | number | boolean | undefined>,
  token: string,
  options: { maxRateLimitWaitMs?: number; attempt?: number } = {},
): Promise<SlackApiResponse<T>> {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") url.searchParams.set(key, String(value));
  }

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
  });

  const retryAfter = res.headers.get("retry-after");
  const json = (await res.json()) as SlackApiResponse<T>;
  if (retryAfter) json.retry_after = Number(retryAfter);
  if (!res.ok && !json.error) json.error = `HTTP ${res.status}`;

  const isRateLimited = res.status === 429 || json.error === "ratelimited";
  const retryAfterMs = Number.isFinite(json.retry_after) ? Number(json.retry_after) * 1000 : 0;
  const attempt = options.attempt ?? 0;
  const maxWait = options.maxRateLimitWaitMs ?? DEFAULT_RATE_LIMIT_WAIT_MS;
  if (isRateLimited && retryAfterMs > 0 && retryAfterMs <= maxWait && attempt < 2) {
    await sleep(retryAfterMs + 250);
    return slackApi(method, params, token, { ...options, attempt: attempt + 1 });
  }

  return json;
}

async function syncAuth(token: string) {
  const res = await slackApi<SlackAuthInfo>("auth.test", {}, token);
  if (!res.ok) throw new Error(`auth.test failed: ${res.error}${res.needed ? ` needed=${res.needed}` : ""}`);
  const auth = {
    teamId: typeof res.team_id === "string" ? res.team_id : null,
    team: typeof res.team === "string" ? res.team : null,
    userId: typeof res.user_id === "string" ? res.user_id : null,
    user: typeof res.user === "string" ? res.user : null,
    url: typeof res.url === "string" ? res.url : null,
  };
  saveSyncState("slack:auth", { stats: auth, error: null });
  return auth;
}

export function ensureSlackVaultSchema() {
  const db = getDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS slack_users (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      name TEXT,
      real_name TEXT,
      tz TEXT,
      is_bot INTEGER DEFAULT 0,
      deleted INTEGER DEFAULT 0,
      profile_json TEXT DEFAULT '{}',
      raw_json TEXT NOT NULL,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS slack_conversations (
      id TEXT PRIMARY KEY,
      team_id TEXT,
      name TEXT,
      type TEXT NOT NULL,
      vault_type TEXT NOT NULL,
      is_member INTEGER DEFAULT 0,
      is_archived INTEGER DEFAULT 0,
      is_private INTEGER DEFAULT 0,
      is_im INTEGER DEFAULT 0,
      is_mpim INTEGER DEFAULT 0,
      is_channel INTEGER DEFAULT 0,
      user_id TEXT,
      topic TEXT,
      purpose TEXT,
      num_members INTEGER,
      raw_json TEXT NOT NULL,
      summary TEXT,
      summarized_at TEXT,
      latest_ts TEXT,
      oldest_ts TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS slack_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      ts TEXT NOT NULL,
      user_id TEXT,
      username TEXT,
      bot_id TEXT,
      subtype TEXT,
      text TEXT,
      thread_ts TEXT,
      parent_user_id TEXT,
      reply_count INTEGER,
      is_thread_parent INTEGER DEFAULT 0,
      raw_json TEXT NOT NULL,
      summary TEXT,
      summarized_at TEXT,
      synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (conversation_id) REFERENCES slack_conversations(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slack_sync_state (
      scope TEXT PRIMARY KEY,
      cursor TEXT,
      last_synced_ts TEXT,
      stats_json TEXT DEFAULT '{}',
      last_error TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_slack_conversations_vault_type ON slack_conversations(vault_type);
    CREATE INDEX IF NOT EXISTS idx_slack_conversations_member ON slack_conversations(is_member);
    CREATE INDEX IF NOT EXISTS idx_slack_messages_conversation_ts ON slack_messages(conversation_id, ts);
    CREATE INDEX IF NOT EXISTS idx_slack_messages_user ON slack_messages(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slack_messages_unique_ts ON slack_messages(conversation_id, ts);
  `);
}

function conversationKind(c: SlackConversation): { type: string; vaultType: SlackVaultType } {
  if (c.is_im) return { type: "im", vaultType: "personal_conversation" };
  if (c.is_mpim) return { type: "mpim", vaultType: "group" };
  if (c.is_group || c.is_private) return { type: "private_channel", vaultType: "group" };
  return { type: "public_channel", vaultType: "public_forum" };
}

function upsertUser(user: SlackUser) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO slack_users
      (id, team_id, name, real_name, tz, is_bot, deleted, profile_json, raw_json, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      team_id = excluded.team_id,
      name = excluded.name,
      real_name = excluded.real_name,
      tz = excluded.tz,
      is_bot = excluded.is_bot,
      deleted = excluded.deleted,
      profile_json = excluded.profile_json,
      raw_json = excluded.raw_json,
      synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    user.id,
    user.team_id ?? null,
    user.name ?? null,
    user.real_name ?? null,
    user.tz ?? null,
    user.is_bot ? 1 : 0,
    user.deleted ? 1 : 0,
    JSON.stringify(user.profile ?? {}),
    JSON.stringify(user),
  );
}

function upsertConversation(c: SlackConversation) {
  const db = getDatabase();
  const kind = conversationKind(c);
  db.prepare(`
    INSERT INTO slack_conversations
      (id, name, type, vault_type, is_member, is_archived, is_private, is_im, is_mpim, is_channel,
       user_id, topic, purpose, num_members, raw_json, synced_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      type = excluded.type,
      vault_type = excluded.vault_type,
      is_member = excluded.is_member,
      is_archived = excluded.is_archived,
      is_private = excluded.is_private,
      is_im = excluded.is_im,
      is_mpim = excluded.is_mpim,
      is_channel = excluded.is_channel,
      user_id = excluded.user_id,
      topic = excluded.topic,
      purpose = excluded.purpose,
      num_members = excluded.num_members,
      raw_json = excluded.raw_json,
      synced_at = CURRENT_TIMESTAMP,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    c.id,
    c.name ?? null,
    kind.type,
    kind.vaultType,
    c.is_member ? 1 : 0,
    c.is_archived ? 1 : 0,
    c.is_private ? 1 : 0,
    c.is_im ? 1 : 0,
    c.is_mpim ? 1 : 0,
    c.is_channel ? 1 : 0,
    c.user ?? null,
    c.topic?.value ?? null,
    c.purpose?.value ?? null,
    c.num_members ?? null,
    JSON.stringify(c),
  );
}

function upsertMessage(conversationId: string, m: SlackMessage) {
  const db = getDatabase();
  const id = `${conversationId}:${m.ts}`;
  db.prepare(`
    INSERT INTO slack_messages
      (id, conversation_id, ts, user_id, username, bot_id, subtype, text, thread_ts,
       parent_user_id, reply_count, is_thread_parent, raw_json, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      user_id = excluded.user_id,
      username = excluded.username,
      bot_id = excluded.bot_id,
      subtype = excluded.subtype,
      text = excluded.text,
      thread_ts = excluded.thread_ts,
      parent_user_id = excluded.parent_user_id,
      reply_count = excluded.reply_count,
      is_thread_parent = excluded.is_thread_parent,
      raw_json = excluded.raw_json,
      synced_at = CURRENT_TIMESTAMP
  `).run(
    id,
    conversationId,
    m.ts,
    m.user ?? null,
    m.username ?? null,
    m.bot_id ?? null,
    m.subtype ?? null,
    m.text ?? null,
    m.thread_ts ?? null,
    m.parent_user_id ?? null,
    m.reply_count ?? null,
    m.reply_count && m.reply_count > 0 ? 1 : 0,
    JSON.stringify(m),
  );
}

function getConversationLastSyncedTs(conversationId: string): string | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT last_synced_ts FROM slack_sync_state WHERE scope = ?`).get(`conversation:${conversationId}`) as
    | { last_synced_ts?: string | null }
    | undefined;
  return row?.last_synced_ts ?? null;
}

function getSyncState(scope: string): { cursor: string | null; lastSyncedTs: string | null } {
  const db = getDatabase();
  const row = db.prepare(`SELECT cursor, last_synced_ts FROM slack_sync_state WHERE scope = ?`).get(scope) as
    | { cursor?: string | null; last_synced_ts?: string | null }
    | undefined;
  return {
    cursor: row?.cursor ?? null,
    lastSyncedTs: row?.last_synced_ts ?? null,
  };
}

function saveSyncState(scope: string, patch: { cursor?: string | null; lastSyncedTs?: string | null; stats?: unknown; error?: string | null }) {
  const db = getDatabase();
  db.prepare(`
    INSERT INTO slack_sync_state (scope, cursor, last_synced_ts, stats_json, last_error, updated_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(scope) DO UPDATE SET
      cursor = excluded.cursor,
      last_synced_ts = excluded.last_synced_ts,
      stats_json = excluded.stats_json,
      last_error = excluded.last_error,
      updated_at = CURRENT_TIMESTAMP
  `).run(
    scope,
    patch.cursor ?? null,
    patch.lastSyncedTs ?? null,
    JSON.stringify(patch.stats ?? {}),
    patch.error ?? null,
  );
}

export function getSlackVaultStatus() {
  ensureSlackVaultSchema();
  const db = getDatabase();
  const token = getSlackToken();
  const userCount = (db.prepare(`SELECT COUNT(*) as count FROM slack_users`).get() as { count: number }).count;
  const conversationCounts = db.prepare(`
    SELECT vault_type as vaultType, COUNT(*) as count
    FROM slack_conversations
    GROUP BY vault_type
  `).all() as Array<{ vaultType: SlackVaultType; count: number }>;
  const messageCount = (db.prepare(`SELECT COUNT(*) as count FROM slack_messages`).get() as { count: number }).count;
  const lastSync = db.prepare(`
    SELECT updated_at, last_error FROM slack_sync_state
    ORDER BY updated_at DESC
    LIMIT 1
  `).get() as { updated_at?: string; last_error?: string | null } | undefined;
  const authRow = db.prepare(`
    SELECT stats_json FROM slack_sync_state
    WHERE scope = 'slack:auth'
    LIMIT 1
  `).get() as { stats_json?: string | null } | undefined;
  const auth = authRow?.stats_json ? JSON.parse(authRow.stats_json) : null;

  return {
    configured: !!token,
    tokenSource: token?.source ?? null,
    requiredEnv: ["SLACK_USER_TOKEN preferred", "SLACK_BOT_TOKEN fallback"],
    auth,
    stats: {
      users: userCount,
      messages: messageCount,
      conversations: conversationCounts.reduce<Record<string, number>>((acc, row) => {
        acc[row.vaultType] = row.count;
        return acc;
      }, {}),
    },
    lastSync: lastSync?.updated_at ?? null,
    lastError: lastSync?.last_error ?? null,
  };
}

export function listSlackVaultCache(limit = 50) {
  ensureSlackVaultSchema();
  const db = getDatabase();
  const conversations = db.prepare(`
    SELECT c.id, c.name, c.type, c.vault_type as vaultType, c.is_member as isMember, c.is_archived as isArchived,
           c.is_private as isPrivate, c.user_id as userId, c.num_members as numMembers, c.latest_ts as latestTs,
           COALESCE(c.name, im.real_name, im.name, c.user_id, c.id) as title,
           c.summary, c.synced_at as syncedAt, c.updated_at as updatedAt
    FROM slack_conversations c
    LEFT JOIN slack_users im ON im.id = c.user_id
    ORDER BY c.updated_at DESC
    LIMIT ?
  `).all(limit);
  const recentMessages = db.prepare(`
    SELECT m.conversation_id as conversationId, m.ts, m.user_id as userId, m.username, m.subtype, m.text,
           m.thread_ts as threadTs, m.reply_count as replyCount, m.synced_at as syncedAt,
           c.name as conversationName, c.type as conversationType, c.vault_type as conversationVaultType,
           COALESCE(c.name, im.real_name, im.name, c.user_id, m.conversation_id) as conversationTitle,
           COALESCE(u.real_name, u.name, m.username, m.user_id, m.bot_id) as authorName,
           u.name as authorHandle
    FROM slack_messages m
    LEFT JOIN slack_conversations c ON c.id = m.conversation_id
    LEFT JOIN slack_users u ON u.id = m.user_id
    LEFT JOIN slack_users im ON im.id = c.user_id
    ORDER BY CAST(m.ts AS REAL) DESC
    LIMIT ?
  `).all(limit);
  return { conversations, recentMessages, status: getSlackVaultStatus() };
}

async function syncUsers(token: string) {
  let cursor = "";
  let createdOrUpdated = 0;
  let pages = 0;
  do {
    const res = await slackApi<{ members: SlackUser[] }>("users.list", { limit: 200, cursor }, token);
    pages += 1;
    if (!res.ok) throw new Error(`users.list failed: ${res.error}${res.needed ? ` needed=${res.needed}` : ""}`);
    const members = (res.members as SlackUser[] | undefined) ?? [];
    for (const member of members) {
      if (member.id) {
        upsertUser(member);
        createdOrUpdated += 1;
      }
    }
    cursor = res.response_metadata?.next_cursor ?? "";
  } while (cursor);

  saveSyncState("users", { cursor: null, stats: { pages, users: createdOrUpdated }, error: null });
  return { pages, users: createdOrUpdated };
}

async function syncConversations(token: string, opts: Required<Pick<SlackSyncOptions, "types" | "includeArchived">>) {
  let cursor = "";
  let count = 0;
  let pages = 0;
  const conversations: SlackConversation[] = [];
  do {
    const res = await slackApi<{ channels: SlackConversation[] }>("conversations.list", {
      types: opts.types,
      exclude_archived: opts.includeArchived ? false : true,
      limit: 200,
      cursor,
    }, token);
    pages += 1;
    if (!res.ok) throw new Error(`conversations.list failed: ${res.error}${res.needed ? ` needed=${res.needed}` : ""}`);
    const channels = (res.channels as SlackConversation[] | undefined) ?? [];
    for (const channel of channels) {
      if (!channel.id) continue;
      upsertConversation(channel);
      conversations.push(channel);
      count += 1;
    }
    cursor = res.response_metadata?.next_cursor ?? "";
  } while (cursor);

  saveSyncState("conversations", { cursor: null, stats: { pages, conversations: count }, error: null });
  return { pages, conversations: count, items: conversations };
}

async function syncMessagesForConversation(token: string, conversation: SlackConversation, opts: Required<Pick<SlackSyncOptions, "maxConversationPages" | "messageLimit" | "forceFull" | "continueBackfill">>) {
  const state = getSyncState(`conversation:${conversation.id}`);
  let cursor = opts.continueBackfill ? state.cursor ?? "" : "";
  let count = 0;
  let pages = 0;
  let newestTs = getConversationLastSyncedTs(conversation.id);
  const oldest = opts.forceFull || opts.continueBackfill ? undefined : newestTs ?? undefined;

  do {
    const res = await slackApi<{ messages: SlackMessage[] }>("conversations.history", {
      channel: conversation.id,
      limit: opts.messageLimit,
      cursor,
      oldest,
      inclusive: false,
    }, token);
    pages += 1;
    if (!res.ok) {
      saveSyncState(`conversation:${conversation.id}`, { stats: { pages, messages: count }, error: res.error ?? "unknown" });
      return { conversationId: conversation.id, ok: false, error: res.error, pages, messages: count, retryAfter: res.retry_after };
    }
    const messages = (res.messages as SlackMessage[] | undefined) ?? [];
    for (const message of messages) {
      if (!message.ts) continue;
      upsertMessage(conversation.id, message);
      count += 1;
      if (!newestTs || Number(message.ts) > Number(newestTs)) newestTs = message.ts;
    }
    cursor = res.response_metadata?.next_cursor ?? "";
    if (pages >= opts.maxConversationPages) break;
  } while (cursor);

  if (newestTs) {
    const db = getDatabase();
    db.prepare(`
      UPDATE slack_conversations
      SET latest_ts = CASE WHEN latest_ts IS NULL OR CAST(? AS REAL) > CAST(latest_ts AS REAL) THEN ? ELSE latest_ts END,
          synced_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(newestTs, newestTs, conversation.id);
  }

  saveSyncState(`conversation:${conversation.id}`, { cursor: cursor || null, lastSyncedTs: newestTs ?? null, stats: { pages, messages: count }, error: null });
  return { conversationId: conversation.id, ok: true, pages, messages: count, cursor: cursor || null };
}

async function syncRepliesForThread(token: string, conversationId: string, threadTs: string, opts: Required<Pick<SlackSyncOptions, "maxThreadPages" | "threadReplyLimit">>) {
  let cursor = "";
  let count = 0;
  let pages = 0;

  do {
    const res = await slackApi<{ messages: SlackMessage[] }>("conversations.replies", {
      channel: conversationId,
      ts: threadTs,
      limit: opts.threadReplyLimit,
      cursor,
    }, token);
    pages += 1;
    if (!res.ok) {
      saveSyncState(`thread:${conversationId}:${threadTs}`, { stats: { pages, replies: count }, error: res.error ?? "unknown" });
      return { conversationId, threadTs, ok: false, error: res.error, pages, replies: count, retryAfter: res.retry_after };
    }

    const replies = (res.messages as SlackMessage[] | undefined) ?? [];
    for (const reply of replies) {
      if (!reply.ts) continue;
      upsertMessage(conversationId, reply);
      count += 1;
    }

    cursor = res.response_metadata?.next_cursor ?? "";
    if (pages >= opts.maxThreadPages) break;
  } while (cursor);

  saveSyncState(`thread:${conversationId}:${threadTs}`, { cursor: cursor || null, stats: { pages, replies: count }, error: null });
  return { conversationId, threadTs, ok: true, pages, replies: count, cursor: cursor || null };
}

async function syncThreadsForConversation(token: string, conversationId: string, opts: Required<Pick<SlackSyncOptions, "maxThreadPages" | "threadReplyLimit" | "maxThreadsPerConversation">>) {
  const db = getDatabase();
  const parents = db.prepare(`
    SELECT ts
    FROM slack_messages
    WHERE conversation_id = ?
      AND is_thread_parent = 1
    ORDER BY CAST(ts AS REAL) DESC
    LIMIT ?
  `).all(conversationId, opts.maxThreadsPerConversation) as Array<{ ts: string }>;

  const results = [];
  for (const parent of parents) {
    const synced = await syncRepliesForThread(token, conversationId, parent.ts, opts);
    results.push(synced);
    if (!synced.ok && synced.retryAfter) break;
  }
  return results;
}

export async function syncSlackVault(options: SlackSyncOptions = {}) {
  ensureSlackVaultSchema();
  const tokenConfig = getSlackToken();
  if (!tokenConfig) {
    throw new Error("Slack token missing. Set SLACK_USER_TOKEN for a personal vault mirror, or SLACK_BOT_TOKEN for bot-visible workspaces.");
  }

  const opts = {
    syncUsers: options.syncUsers ?? true,
    syncConversations: options.syncConversations ?? true,
    syncMessages: options.syncMessages ?? true,
    syncThreads: options.syncThreads ?? true,
    types: options.types ?? "public_channel,private_channel,mpim,im",
    maxConversations: Math.max(1, Math.min(options.maxConversations ?? 8, 1000)),
    maxConversationPages: Math.max(1, Math.min(options.maxConversationPages ?? 1, 10)),
    messageLimit: Math.max(1, Math.min(options.messageLimit ?? 15, 200)),
    maxThreadPages: Math.max(1, Math.min(options.maxThreadPages ?? 1, 10)),
    threadReplyLimit: Math.max(1, Math.min(options.threadReplyLimit ?? 15, 200)),
    maxThreadsPerConversation: Math.max(0, Math.min(options.maxThreadsPerConversation ?? 1, 25)),
    continueBackfill: options.continueBackfill ?? false,
    maxRateLimitWaitMs: Math.max(0, Math.min(options.maxRateLimitWaitMs ?? DEFAULT_RATE_LIMIT_WAIT_MS, 120_000)),
    includeArchived: options.includeArchived ?? false,
    includeNonMemberPublic: options.includeNonMemberPublic ?? false,
    forceFull: options.forceFull ?? false,
  };

  const result: Record<string, unknown> = {
    tokenSource: tokenConfig.source,
    options: opts,
  };

  try {
    result.auth = await syncAuth(tokenConfig.token);

    if (opts.syncUsers) result.users = await syncUsers(tokenConfig.token);

    let conversations: SlackConversation[] = [];
    let eligible: SlackConversation[] = [];
    if (opts.syncConversations) {
      const synced = await syncConversations(tokenConfig.token, {
        types: opts.types,
        includeArchived: opts.includeArchived,
      });
      result.conversations = { pages: synced.pages, conversations: synced.conversations };
      conversations = synced.items;
    } else {
      const db = getDatabase();
      conversations = db.prepare(`
        SELECT c.raw_json
        FROM slack_conversations c
        LEFT JOIN slack_sync_state s ON s.scope = 'conversation:' || c.id
        WHERE (? = 1 OR c.is_archived = 0)
          AND (
            c.is_im = 1
            OR c.is_mpim = 1
            OR c.is_private = 1
            OR c.type = 'private_channel'
            OR (? = 1 OR c.is_member = 1)
          )
        ORDER BY
          CASE WHEN s.updated_at IS NULL THEN 0 ELSE 1 END ASC,
          s.updated_at ASC,
          c.updated_at ASC
        LIMIT ?
      `).all(opts.includeArchived ? 1 : 0, opts.includeNonMemberPublic ? 1 : 0, opts.maxConversations).map((row: any) => JSON.parse(row.raw_json));
    }

    if (opts.syncMessages) {
      eligible = conversations
        .filter((conversation) => {
          if (conversation.is_archived && !opts.includeArchived) return false;
          if (conversation.is_im || conversation.is_mpim || conversation.is_private || conversation.is_group) return true;
          return opts.includeNonMemberPublic || conversation.is_member;
        })
        .slice(0, opts.maxConversations);
      const messageResults = [];
      for (const conversation of eligible) {
        const synced = await syncMessagesForConversation(tokenConfig.token, conversation, {
          maxConversationPages: opts.maxConversationPages,
          messageLimit: opts.messageLimit,
          forceFull: opts.forceFull,
          continueBackfill: opts.continueBackfill,
        });
        messageResults.push(synced);
        if (!synced.ok && synced.retryAfter) break;
      }
      result.messages = messageResults;
    }

    if (opts.syncThreads && opts.syncMessages && opts.maxThreadsPerConversation > 0) {
      const threadResults = [];
      for (const conversation of eligible) {
        const synced = await syncThreadsForConversation(tokenConfig.token, conversation.id, {
          maxThreadPages: opts.maxThreadPages,
          threadReplyLimit: opts.threadReplyLimit,
          maxThreadsPerConversation: opts.maxThreadsPerConversation,
        });
        threadResults.push(...synced);
      }
      result.threads = threadResults;
    }

    saveSyncState("slack:last", { stats: result, error: null });
    return { ok: true, ...result, status: getSlackVaultStatus() };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Slack sync failed";
    saveSyncState("slack:last", { stats: result, error: message });
    throw error;
  }
}
