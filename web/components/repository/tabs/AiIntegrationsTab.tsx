"use client";

import { Bot, FileCode2, GitPullRequest, RefreshCw, ShieldCheck, TerminalSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AiArtifact, AiIntegration, AiLogSession, AiProposal } from "@/lib/types/repository";

interface AiIntegrationsTabProps {
  loading: boolean;
  integrations: AiIntegration[];
  artifacts: AiArtifact[];
  sessions: AiLogSession[];
  proposals: AiProposal[];
  scanning: boolean;
  scanAiIntegrations: () => void;
}

function statusTone(status: string): string {
  if (status === "available") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
  if (status === "needs_auth") return "border-amber-500/30 bg-amber-500/10 text-amber-200";
  if (status === "error") return "border-red-500/30 bg-red-500/10 text-red-200";
  return "border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] text-[var(--tartarus-ivory-dim)]";
}

function shortPath(value: string): string {
  return value.replace(/^\/Users\/[^/]+/, "~");
}

export function AiIntegrationsTab({
  loading,
  integrations,
  artifacts,
  sessions,
  proposals,
  scanning,
  scanAiIntegrations,
}: AiIntegrationsTabProps) {
  const artifactsByAgent = artifacts.reduce<Record<string, number>>((acc, artifact) => {
    acc[artifact.integrationKey] = (acc[artifact.integrationKey] || 0) + 1;
    return acc;
  }, {});
  const sessionsByAgent = sessions.reduce<Record<string, number>>((acc, session) => {
    acc[session.integrationKey] = (acc[session.integrationKey] || 0) + 1;
    return acc;
  }, {});

  if (loading) {
    return <div className="text-sm text-[var(--tartarus-ivory-muted)]">Loading AI integrations...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--tartarus-ivory)]">AI Integrations</h2>
          <p className="mt-1 text-sm text-[var(--tartarus-ivory-muted)]">
            Read-only index of coding agents, configs, skills, rules, logs, and Tartarus proposal copies.
          </p>
        </div>
        <Button onClick={scanAiIntegrations} disabled={scanning} className="w-fit">
          <RefreshCw className={`mr-2 h-4 w-4 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning" : "Scan sources"}
        </Button>
      </div>

      <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
        {integrations.map((integration) => (
          <div key={integration.key} className="rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-surface)] p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Bot className="h-4 w-4 text-[var(--tartarus-teal)]" />
                  <h3 className="truncate font-medium text-[var(--tartarus-ivory)]">{integration.displayName}</h3>
                </div>
                <p className="mt-1 text-xs text-[var(--tartarus-ivory-muted)]">
                  {integration.version ? `v${integration.version}` : "Version unknown"}
                  {integration.authStatus ? ` · ${integration.authStatus}` : ""}
                </p>
              </div>
              <Badge className={statusTone(integration.status)}>{integration.status.replace("_", " ")}</Badge>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div>
                <div className="text-[var(--tartarus-ivory-muted)]">Artifacts</div>
                <div className="text-base text-[var(--tartarus-ivory)]">{artifactsByAgent[integration.key] || 0}</div>
              </div>
              <div>
                <div className="text-[var(--tartarus-ivory-muted)]">Sessions</div>
                <div className="text-base text-[var(--tartarus-ivory)]">{sessionsByAgent[integration.key] || 0}</div>
              </div>
              <div>
                <div className="text-[var(--tartarus-ivory-muted)]">UUID</div>
                <div className="truncate font-mono text-[var(--tartarus-ivory-dim)]">{integration.uuid?.slice(0, 8) || "-"}</div>
              </div>
            </div>
            {integration.sourcePaths.length > 0 && (
              <div className="mt-3 space-y-1">
                {integration.sourcePaths.slice(0, 3).map((sourcePath) => (
                  <div key={sourcePath} className="truncate font-mono text-xs text-[var(--tartarus-ivory-muted)]">
                    {shortPath(sourcePath)}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--tartarus-ivory)]">
            <FileCode2 className="h-4 w-4 text-[var(--tartarus-gold)]" />
            Indexed artifacts
          </div>
          <div className="space-y-2">
            {artifacts.slice(0, 12).map((artifact) => (
              <div key={artifact.id} className="rounded-md border border-[var(--tartarus-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-[var(--tartarus-ivory)]">{artifact.title}</span>
                  <Badge variant="outline">{artifact.kind}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--tartarus-ivory-muted)]">{artifact.summary}</p>
                <div className="mt-2 truncate font-mono text-xs text-[var(--tartarus-ivory-muted)]">{shortPath(artifact.sourcePath)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--tartarus-ivory)]">
            <TerminalSquare className="h-4 w-4 text-[var(--tartarus-gold)]" />
            Normalized logs
          </div>
          <div className="space-y-2">
            {sessions.slice(0, 12).map((session) => (
              <div key={session.id} className="rounded-md border border-[var(--tartarus-border)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm text-[var(--tartarus-ivory)]">{session.title}</span>
                  <Badge variant="outline">{session.messageCount}</Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-xs text-[var(--tartarus-ivory-muted)]">{session.summary}</p>
                <div className="mt-2 truncate font-mono text-xs text-[var(--tartarus-ivory-muted)]">{session.uuid || session.stableId}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--tartarus-ivory)]">
            <GitPullRequest className="h-4 w-4 text-[var(--tartarus-gold)]" />
            Tartarus proposals
          </div>
          {proposals.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--tartarus-border)] p-4 text-sm text-[var(--tartarus-ivory-muted)]">
              No Library-side proposal copies yet.
            </div>
          ) : (
            <div className="space-y-2">
              {proposals.slice(0, 12).map((proposal) => (
                <div key={proposal.id} className="rounded-md border border-[var(--tartarus-border)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm text-[var(--tartarus-ivory)]">{proposal.title}</span>
                    <Badge variant="outline">{proposal.status}</Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-xs text-[var(--tartarus-ivory-muted)]">{proposal.summary}</p>
                  <div className="mt-2 flex items-center gap-1 text-xs text-[var(--tartarus-ivory-muted)]">
                    <ShieldCheck className="h-3 w-3" />
                    External files are not modified by v1
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
