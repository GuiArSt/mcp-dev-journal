"use client";

import { useMemo, useState } from "react";
import { Archive, Hash, Lock, MessageCircle, RefreshCw, Search, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  SlackCachedConversation,
  SlackCachedMessage,
  SlackVaultStatus,
} from "@/lib/types/repository";

interface SlackTabProps {
  loading: boolean;
  conversations: SlackCachedConversation[];
  messages: SlackCachedMessage[];
  status: SlackVaultStatus | null;
  syncing: boolean;
  syncSlackData: () => void;
}

const vaultLabels: Record<SlackCachedConversation["vaultType"], string> = {
  personal_conversation: "Personal",
  group: "Groups",
  public_forum: "Public forums",
};

function formatCount(value: number | undefined) {
  return new Intl.NumberFormat().format(value ?? 0);
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function getConversationTitle(conversation: SlackCachedConversation) {
  return conversation.title || conversation.name || conversation.userId || conversation.id;
}

function getConversationIcon(type: SlackCachedConversation["vaultType"]) {
  if (type === "personal_conversation") return MessageCircle;
  if (type === "group") return Lock;
  return Hash;
}

function truncateText(text: string | null, maxLen = 180) {
  if (!text) return "";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > maxLen ? `${cleaned.slice(0, maxLen)}...` : cleaned;
}

function formatSlackTime(ts: string | null | undefined) {
  if (!ts) return "";
  const millis = Number(ts) * 1000;
  if (!Number.isFinite(millis)) return ts;
  return new Date(millis).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SlackTab({
  loading,
  conversations,
  messages,
  status,
  syncing,
  syncSlackData,
}: SlackTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [conversationMessages, setConversationMessages] = useState<SlackCachedMessage[]>([]);
  const [conversationLoading, setConversationLoading] = useState(false);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const query = searchQuery.toLowerCase().trim();

  const filteredConversations = useMemo(() => {
    if (!query) return conversations;
    return conversations.filter((conversation) =>
      [
        conversation.id,
        conversation.name,
        conversation.title,
        conversation.summary,
        conversation.userId,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [conversations, query]);

  const filteredMessages = useMemo(() => {
    if (!query) return messages;
    return messages.filter((message) =>
      [
        message.text,
        message.authorName,
        message.authorHandle,
        message.conversationTitle,
        message.conversationName,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [messages, query]);

  const groupedCounts = status?.stats.conversations ?? {};
  const backfill = status?.stats.backfill;
  const selectedConversation =
    conversations.find((conversation) => conversation.id === selectedConversationId) ??
    filteredConversations[0] ??
    null;
  const visibleMessages = selectedConversationId ? conversationMessages : filteredMessages;

  async function selectConversation(conversation: SlackCachedConversation) {
    setSelectedConversationId(conversation.id);
    setConversationLoading(true);
    setConversationError(null);
    try {
      const params = new URLSearchParams({
        limit: "80",
        messageLimit: "500",
        conversationId: conversation.id,
      });
      const response = await fetch(`/api/integrations/slack/cache?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Failed to load Slack conversation");
      setConversationMessages(data.recentMessages || []);
    } catch (error) {
      setConversationMessages([]);
      setConversationError(error instanceof Error ? error.message : "Failed to load Slack conversation");
    } finally {
      setConversationLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
              <CardContent className="p-4">
                <Skeleton className="mb-2 h-4 w-20" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[var(--tartarus-teal-soft)]">
            <MessageCircle className="h-5 w-5 text-[var(--tartarus-teal)]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[var(--tartarus-ivory)]">Slack Vault</h3>
              <Badge variant="outline" className="border-[var(--tartarus-gold-dim)] text-[var(--tartarus-gold)]">
                data-vault
              </Badge>
              {status?.configured ? (
                <Badge className="bg-[var(--tartarus-teal-soft)] text-[var(--tartarus-teal)]">
                  {status.tokenSource}
                </Badge>
              ) : (
                <Badge variant="destructive">token missing</Badge>
              )}
            </div>
            <p className="text-xs text-[var(--tartarus-ivory-muted)]">
              {status?.auth?.team ?? "Workspace not discovered"} · Synced{" "}
              {formatRelativeTime(status?.lastSync)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-[var(--tartarus-ivory-faded)]" />
            <input
              type="text"
              placeholder="Search Slack..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              className="h-8 w-52 rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] pl-8 pr-3 text-xs text-[var(--tartarus-ivory)] placeholder:text-[var(--tartarus-ivory-faded)] focus:border-[var(--tartarus-teal)] focus:outline-none"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={syncSlackData}
            disabled={syncing || !status?.configured}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Backfilling..." : "Backfill slice"}
          </Button>
        </div>
      </div>

      {status?.lastError && (
        <div className="rounded-md border border-[var(--tartarus-error)]/40 bg-[var(--tartarus-error)]/10 px-3 py-2 text-xs text-[var(--tartarus-error)]">
          {status.lastError}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
          <CardContent className="flex items-center gap-3 p-3">
            <Users className="h-4 w-4 text-[var(--tartarus-teal)]" />
            <div>
              <p className="text-lg font-bold text-[var(--tartarus-ivory)]">
                {formatCount(status?.stats.users)}
              </p>
              <p className="text-[10px] text-[var(--tartarus-ivory-muted)]">Users</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
          <CardContent className="flex items-center gap-3 p-3">
            <MessageCircle className="h-4 w-4 text-[var(--tartarus-gold)]" />
            <div>
              <p className="text-lg font-bold text-[var(--tartarus-ivory)]">
                {formatCount(status?.stats.messages)}
              </p>
              <p className="text-[10px] text-[var(--tartarus-ivory-muted)]">Messages</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
          <CardContent className="flex items-center gap-3 p-3">
            <Archive className="h-4 w-4 text-[var(--tartarus-ivory-muted)]" />
            <div>
              <p className="text-lg font-bold text-[var(--tartarus-ivory)]">
                {formatCount(backfill?.touched)} / {formatCount(backfill?.eligible)}
              </p>
              <p className="text-[10px] text-[var(--tartarus-ivory-muted)]">
                Backfill touched {backfill?.touchedPercent ?? 0}%
              </p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
          <CardContent className="flex items-center gap-3 p-3">
            <Hash className="h-4 w-4 text-[var(--tartarus-teal)]" />
            <div>
              <p className="text-lg font-bold text-[var(--tartarus-ivory)]">
                {formatCount(backfill?.pendingCursors)}
              </p>
              <p className="text-[10px] text-[var(--tartarus-ivory-muted)]">Pending cursors</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(340px,0.7fr)]">
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-[var(--tartarus-ivory)]">
              Conversations
            </h4>
            <span className="text-xs text-[var(--tartarus-ivory-muted)]">
              {filteredConversations.length} shown
            </span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {filteredConversations.slice(0, 16).map((conversation) => {
              const Icon = getConversationIcon(conversation.vaultType);
              return (
                <Card
                  key={conversation.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectConversation(conversation)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      void selectConversation(conversation);
                    }
                  }}
                  className={`cursor-pointer border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] transition-[border-color,box-shadow] duration-150 hover:border-[var(--tartarus-gold-dim)] ${
                    selectedConversationId === conversation.id
                      ? "border-[var(--tartarus-gold)] shadow-[0_0_0_1px_var(--tartarus-gold-dim)]"
                      : ""
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <Icon className="h-4 w-4 shrink-0 text-[var(--tartarus-teal)]" />
                        <p className="truncate text-sm font-semibold text-[var(--tartarus-ivory)]">
                          {getConversationTitle(conversation)}
                        </p>
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px]">
                        {vaultLabels[conversation.vaultType]}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-[10px] text-[var(--tartarus-ivory-muted)]">
                      <span>{conversation.numMembers ?? 0} members</span>
                      <span>{formatCount(conversation.messageCount)} messages</span>
                      {conversation.hasPendingCursor ? <span>more pending</span> : null}
                      {conversation.isArchived ? <span>archived</span> : null}
                      <span>{formatRelativeTime(conversation.updatedAt)}</span>
                    </div>
                    {conversation.summary && (
                      <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-[var(--tartarus-ivory-muted)]">
                        {conversation.summary}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
          {filteredConversations.length === 0 && (
            <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-8 text-center text-sm text-[var(--tartarus-ivory-muted)]">
              No Slack conversations cached yet.
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h4 className="text-sm font-semibold text-[var(--tartarus-ivory)]">
                {selectedConversation ? getConversationTitle(selectedConversation) : "Recent messages"}
              </h4>
              {selectedConversationId && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setSelectedConversationId(null);
                    setConversationMessages([]);
                    setConversationError(null);
                  }}
                  className="h-7 px-2 text-xs"
                >
                  Show recent
                </Button>
              )}
            </div>
            <p className="text-xs text-[var(--tartarus-ivory-muted)]">
              {selectedConversationId
                ? `Raw mirrored messages for this conversation${
                    selectedConversation
                      ? ` · showing ${formatCount(conversationMessages.length)} of ${formatCount(selectedConversation.messageCount)}`
                      : ""
                  }${selectedConversation?.hasPendingCursor ? " · more history pending" : ""}.`
                : "Local vault preview. Select a conversation to inspect raw mirrored messages."}
            </p>
          </div>
          {selectedConversation?.summary && (
            <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-3 text-xs leading-relaxed text-[var(--tartarus-ivory-muted)]">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-[var(--tartarus-gold)]">
                Summary
              </span>
              {selectedConversation.summary}
            </div>
          )}
          {conversationError && (
            <div className="rounded-md border border-[var(--tartarus-error)]/40 bg-[var(--tartarus-error)]/10 px-3 py-2 text-xs text-[var(--tartarus-error)]">
              {conversationError}
            </div>
          )}
          <div className="space-y-2">
            {conversationLoading ? (
              <Card className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]">
                <CardContent className="space-y-2 p-3">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-12 w-full" />
                </CardContent>
              </Card>
            ) : visibleMessages.length === 0 ? (
              <div className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-6 text-center text-xs text-[var(--tartarus-ivory-muted)]">
                {selectedConversationId
                  ? "No raw messages mirrored for this conversation yet."
                  : "No recent messages mirrored yet."}
              </div>
            ) : visibleMessages.slice(0, selectedConversationId ? 500 : 12).map((message) => (
              <Card
                key={`${message.conversationId}:${message.ts}`}
                className="border-[var(--tartarus-border)] bg-[var(--tartarus-surface)]"
              >
                <CardContent className="p-3">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-[var(--tartarus-ivory-faded)]">
                    <span className="truncate">
                      {message.authorName ?? "unknown"}
                      {message.authorHandle ? ` · @${message.authorHandle}` : ""}
                    </span>
                    <span className="shrink-0">{formatSlackTime(message.ts)}</span>
                  </div>
                  <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-[var(--tartarus-ivory-muted)]">
                    {selectedConversationId ? message.text || "empty message" : truncateText(message.text)}
                  </p>
                  {!selectedConversationId && (
                    <p className="mt-2 truncate text-[10px] uppercase tracking-wide text-[var(--tartarus-ivory-faded)]">
                      {message.conversationTitle}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      </div>

      <div className="grid gap-2 text-xs text-[var(--tartarus-ivory-muted)] sm:grid-cols-3">
        {Object.entries(vaultLabels).map(([key, label]) => (
          <div key={key} className="rounded-md border border-[var(--tartarus-border)] px-3 py-2">
            {label}: {formatCount(groupedCounts[key])}
          </div>
        ))}
      </div>
    </div>
  );
}
