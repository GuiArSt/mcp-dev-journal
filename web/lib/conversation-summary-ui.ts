/** Shared helpers for Hourglass + legacy chat summary UI. */

export interface ConversationSummaryRow {
  id: number;
  title: string;
  updated_at: string;
  summary?: string | null;
  summary_updated_at?: string | null;
}

export function conversationHasSummary(conv: ConversationSummaryRow): boolean {
  return !!conv.summary?.trim();
}

export function conversationNeedsSummary(conv: ConversationSummaryRow): boolean {
  if (!conversationHasSummary(conv)) return true;
  if (!conv.summary_updated_at) return true;
  return new Date(conv.updated_at).getTime() > new Date(conv.summary_updated_at).getTime();
}

export type ConversationSummaryStatus = "missing" | "stale" | "current";

export function conversationSummaryStatus(conv: ConversationSummaryRow): ConversationSummaryStatus {
  if (!conversationHasSummary(conv)) return "missing";
  if (conversationNeedsSummary(conv)) return "stale";
  return "current";
}
