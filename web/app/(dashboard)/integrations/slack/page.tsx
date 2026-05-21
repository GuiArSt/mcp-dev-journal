"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, Hash, Lock, MessageCircle, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SlackStatus {
  configured: boolean;
  tokenSource: string | null;
  auth: {
    team?: string | null;
    user?: string | null;
    url?: string | null;
  } | null;
  stats: {
    users: number;
    messages: number;
    conversations: Record<string, number>;
  };
  lastSync: string | null;
  lastError: string | null;
}

interface SlackConversation {
  id: string;
  name?: string | null;
  type: string;
  vaultType: "personal_conversation" | "group" | "public_forum";
  isMember: number;
  isArchived: number;
  isPrivate: number;
  userId?: string | null;
  numMembers?: number | null;
  latestTs?: string | null;
  title?: string | null;
  summary?: string | null;
  syncedAt?: string | null;
  updatedAt?: string | null;
}

interface SlackMessage {
  conversationId: string;
  ts: string;
  userId?: string | null;
  username?: string | null;
  subtype?: string | null;
  text?: string | null;
  threadTs?: string | null;
  replyCount?: number | null;
  conversationTitle?: string | null;
  conversationName?: string | null;
  conversationType?: string | null;
  conversationVaultType?: string | null;
  authorName?: string | null;
  authorHandle?: string | null;
  syncedAt?: string | null;
}

interface SlackCache {
  conversations: SlackConversation[];
  recentMessages: SlackMessage[];
  status: SlackStatus;
}

const vaultLabels: Record<SlackConversation["vaultType"], string> = {
  personal_conversation: "Personal",
  group: "Groups",
  public_forum: "Public forums",
};

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function conversationTitle(conversation: SlackConversation) {
  if (conversation.title) return conversation.title;
  if (conversation.name) return conversation.name;
  if (conversation.userId) return `DM ${conversation.userId}`;
  return conversation.id;
}

function conversationIcon(type: SlackConversation["vaultType"]) {
  if (type === "personal_conversation") return MessageCircle;
  if (type === "group") return Lock;
  return Hash;
}

export default function SlackIntegrationPage() {
  const [cache, setCache] = useState<SlackCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const status = cache?.status;
  const groupedConversations = useMemo(() => {
    const groups: Record<SlackConversation["vaultType"], SlackConversation[]> = {
      personal_conversation: [],
      group: [],
      public_forum: [],
    };
    for (const conversation of cache?.conversations ?? []) {
      groups[conversation.vaultType]?.push(conversation);
    }
    return groups;
  }, [cache]);

  async function loadCache() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/slack/cache?limit=80");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load Slack vault");
      setCache(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load Slack vault");
    } finally {
      setLoading(false);
    }
  }

  function hasConversationDirectory() {
    return Object.values(status?.stats.conversations ?? {}).some((count) => count > 0);
  }

  async function runSync(kind: "pilot" | "backfill" | "discover") {
    setSyncing(kind);
    setError(null);
    try {
      const body =
        kind === "discover"
          ? {
              syncUsers: true,
              syncConversations: true,
              syncMessages: false,
              syncThreads: false,
              maxRateLimitWaitMs: 70_000,
            }
          : kind === "pilot"
          ? {
              syncUsers: false,
              syncConversations: !hasConversationDirectory(),
              syncMessages: true,
              syncThreads: true,
              maxConversations: 1,
              maxConversationPages: 1,
              messageLimit: 15,
              maxThreadPages: 1,
              threadReplyLimit: 15,
              maxThreadsPerConversation: 1,
              maxRateLimitWaitMs: 70_000,
              includeNonMemberPublic: false,
              forceFull: false,
            }
          : {
              syncUsers: false,
              syncConversations: false,
              syncMessages: true,
              syncThreads: false,
              maxConversations: 1,
              maxConversationPages: 1,
              messageLimit: 15,
              maxThreadPages: 1,
              threadReplyLimit: 15,
              maxThreadsPerConversation: 0,
              maxRateLimitWaitMs: 70_000,
              continueBackfill: true,
              includeNonMemberPublic: false,
              forceFull: true,
            };

      const response = await fetch("/api/integrations/slack/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Slack sync failed");
      setCache((current) => ({ conversations: current?.conversations ?? [], recentMessages: current?.recentMessages ?? [], status: data.status }));
      await loadCache();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Slack sync failed");
    } finally {
      setSyncing(null);
    }
  }

  useEffect(() => {
    void loadCache();
  }, []);

  return (
    <div className="min-h-full bg-[var(--tartarus-void)] text-[var(--tartarus-ivory)]">
      <header className="border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-6 py-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold tracking-tight">Slack Vault</h1>
              <Badge className="border-[var(--tartarus-teal-dim)] bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
                data-vault only
              </Badge>
              {status?.configured ? (
                <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                  {status.tokenSource}
                </Badge>
              ) : (
                <Badge variant="destructive">token missing</Badge>
              )}
            </div>
            <p className="mt-2 max-w-3xl text-sm text-[var(--tartarus-ivory-muted)]">
              Mirrors Slack data you can access into the local Tartarus vault. Kronus tools are intentionally not exposed yet.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={loadCache} disabled={loading || !!syncing}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
            <Button variant="outline" onClick={() => runSync("discover")} disabled={loading || !!syncing || !status?.configured}>
              {syncing === "discover" ? "Discovering..." : "Rediscover"}
            </Button>
            <Button variant="outline" onClick={() => runSync("pilot")} disabled={loading || !!syncing || !status?.configured}>
              {syncing === "pilot" ? "Syncing..." : "Pilot sync"}
            </Button>
            <Button onClick={() => runSync("backfill")} disabled={loading || !!syncing || !status?.configured}>
              {syncing === "backfill" ? "Backfilling..." : "Backfill slice"}
            </Button>
          </div>
        </div>
      </header>

      <main className="space-y-6 p-6">
        {error && (
          <div className="rounded-md border border-[var(--tartarus-error)]/50 bg-[var(--tartarus-error)]/10 px-4 py-3 text-sm text-[var(--tartarus-error)]">
            {error}
          </div>
        )}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
            <CardHeader className="pb-2">
              <CardDescription>Workspace</CardDescription>
              <CardTitle className="text-base">{status?.auth?.team ?? "Not synced"}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-[var(--tartarus-ivory-muted)]">
              {status?.auth?.user ?? "Set SLACK_USER_TOKEN"}
            </CardContent>
          </Card>
          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
            <CardHeader className="pb-2">
              <CardDescription>Users</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-[var(--tartarus-teal)]" />
                {formatCount(status?.stats.users)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
            <CardHeader className="pb-2">
              <CardDescription>Conversations</CardDescription>
              <CardTitle className="flex items-center gap-2 text-base">
                <Archive className="h-4 w-4 text-[var(--tartarus-gold)]" />
                {formatCount(Object.values(status?.stats.conversations ?? {}).reduce((sum, count) => sum + count, 0))}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
            <CardHeader className="pb-2">
              <CardDescription>Messages</CardDescription>
              <CardTitle className="text-base">{formatCount(status?.stats.messages)}</CardTitle>
            </CardHeader>
            <CardContent className="text-xs text-[var(--tartarus-ivory-muted)]">
              Last sync: {status?.lastSync ?? "never"}
            </CardContent>
          </Card>
        </section>

        <section className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-[var(--tartarus-teal)]" />
            <div>
              <h2 className="font-medium">Copy boundary</h2>
              <p className="mt-1 text-sm leading-6 text-[var(--tartarus-ivory-muted)]">
                The vault copies Slack conversations visible to your token: direct messages, multi-person groups, private
                channels you can access, and public channels you are a member of. Public channels you have not joined are
                discovered as metadata but skipped for message history unless explicitly enabled in the API. Because Slack
                enforces per-method limits, normal sync buttons reuse the cached directory; use Rediscover only when you
                need to refresh the channel list.
              </p>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
          <div className="space-y-4">
            {(["personal_conversation", "group", "public_forum"] as const).map((type) => {
              const Icon = conversationIcon(type);
              const conversations = groupedConversations[type];
              return (
                <Card key={type} className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Icon className="h-4 w-4 text-[var(--tartarus-gold)]" />
                      {vaultLabels[type]}
                      <Badge variant="outline" className="ml-auto">
                        {formatCount(status?.stats.conversations[type])}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-2 md:grid-cols-2">
                      {conversations.slice(0, 8).map((conversation) => (
                        <div key={conversation.id} className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] px-3 py-2">
                          <div className="truncate text-sm font-medium">{conversationTitle(conversation)}</div>
                          <div className="mt-1 flex gap-2 text-xs text-[var(--tartarus-ivory-muted)]">
                            <span>{conversation.type}</span>
                            <span>{conversation.isMember ? "member" : "metadata only"}</span>
                          </div>
                        </div>
                      ))}
                      {!loading && conversations.length === 0 && (
                        <div className="text-sm text-[var(--tartarus-ivory-muted)]">No mirrored conversations yet.</div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-deep)]">
            <CardHeader>
              <CardTitle className="text-base">Recent mirrored messages</CardTitle>
              <CardDescription>Sanity check view from the local vault.</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[560px] pr-4">
                <div className="space-y-3">
                  {(cache?.recentMessages ?? []).slice(0, 40).map((message) => (
                    <div key={`${message.conversationId}:${message.ts}`} className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-3">
                      <div className="mb-1 flex items-center justify-between gap-2 text-xs text-[var(--tartarus-ivory-muted)]">
                        <span className="truncate">{message.conversationTitle ?? message.conversationId}</span>
                        {message.threadTs && <span>thread</span>}
                      </div>
                      <div className="mb-2 text-xs text-[var(--tartarus-gold)]">
                        {message.authorName ?? message.userId ?? message.username ?? "unknown"}
                      </div>
                      <p className="line-clamp-4 whitespace-pre-wrap text-sm leading-5">{message.text || message.subtype || "(empty event)"}</p>
                    </div>
                  ))}
                  {!loading && (cache?.recentMessages ?? []).length === 0 && (
                    <p className="text-sm text-[var(--tartarus-ivory-muted)]">No mirrored messages yet.</p>
                  )}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
