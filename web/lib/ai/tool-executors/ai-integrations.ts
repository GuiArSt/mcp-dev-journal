import type { ToolExecutor } from "./types";

function paramsFrom(args: Record<string, any>, keys: string[]): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of keys) {
    const value = args[key];
    if (value !== undefined && value !== null && value !== "") {
      params.set(key, String(value));
    }
  }
  return params;
}

function compactJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

export const aiIntegrationExecutors: Record<string, ToolExecutor> = {
  ai_integrations_list: async () => {
    const res = await fetch("/api/ai-integrations");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list AI integrations");

    const integrations = data.integrations || [];
    if (integrations.length === 0) return { output: "No AI integrations indexed yet. Run a Library scan first." };

    const rows = integrations.map((i: any) => {
      const status = [i.status, i.authStatus].filter(Boolean).join(" / ");
      return `- **${i.displayName || i.key}** (${i.key}) ${status ? `- ${status}` : ""}\n  UUID: ${i.uuid || "not registered"}\n  Paths: ${(i.sourcePaths || []).join(", ") || "none"}`;
    });
    return { output: `Indexed AI integrations:\n${rows.join("\n\n")}` };
  },

  ai_integration_fetch: async (args) => {
    const params = paramsFrom(args, ["key"]);
    const res = await fetch(`/api/ai-integrations?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch AI integration");
    return { output: compactJson(data.integration || data) };
  },

  ai_artifacts_list: async (args) => {
    const params = paramsFrom(args, ["integrationKey", "kind", "limit", "offset"]);
    const res = await fetch(`/api/ai-integrations/artifacts?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list AI artifacts");

    const artifacts = data.artifacts || [];
    if (artifacts.length === 0) return { output: "No AI artifacts found for that query." };
    const rows = artifacts.map((a: any) => {
      return `- [${a.id}] **${a.title}** (${a.integrationKey || a.integration_key}/${a.kind})\n  ${a.sourcePath || a.source_path || "no path"}\n  UUID: ${a.uuid || "not registered"}`;
    });
    return { output: `AI artifacts (${artifacts.length}):\n${rows.join("\n")}` };
  },

  ai_artifact_fetch: async (args) => {
    const params = paramsFrom(args, ["id"]);
    const res = await fetch(`/api/ai-integrations/artifacts?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch AI artifact");
    return { output: compactJson(data.artifact || data) };
  },

  ai_log_sessions_list: async (args) => {
    const params = paramsFrom(args, ["integrationKey", "limit", "offset"]);
    const res = await fetch(`/api/ai-integrations/sessions?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list AI log sessions");

    const sessions = data.sessions || [];
    if (sessions.length === 0) return { output: "No normalized AI log sessions found for that query." };
    const rows = sessions.map((s: any) => {
      const count = s.eventCount ?? s.event_count ?? 0;
      return `- [${s.id}] **${s.title || s.sessionId || s.session_id}** (${s.integrationKey || s.integration_key}, ${count} events)\n  ${s.sourcePath || s.source_path || "no path"}\n  UUID: ${s.uuid || "not registered"}`;
    });
    return { output: `AI log sessions (${sessions.length}):\n${rows.join("\n")}` };
  },

  ai_log_session_fetch: async (args) => {
    const params = paramsFrom(args, ["id"]);
    const res = await fetch(`/api/ai-integrations/sessions?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch AI log session");
    return { output: compactJson(data.session || data) };
  },

  ai_proposals_list: async (args) => {
    const params = paramsFrom(args, ["integrationKey", "limit", "offset"]);
    const res = await fetch(`/api/ai-integrations/proposals?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to list AI proposals");

    const proposals = data.proposals || [];
    if (proposals.length === 0) return { output: "No AI integration proposals found." };
    const rows = proposals.map((p: any) => {
      return `- [${p.id}] **${p.title}** (${p.integrationKey || p.integration_key}, ${p.status})\n  Target: ${p.targetPath || p.target_path || "unset"}\n  UUID: ${p.uuid || "not registered"}`;
    });
    return { output: `AI proposals (${proposals.length}):\n${rows.join("\n")}` };
  },

  ai_proposal_fetch: async (args) => {
    const params = paramsFrom(args, ["id"]);
    const res = await fetch(`/api/ai-integrations/proposals?${params.toString()}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Failed to fetch AI proposal");
    return { output: compactJson(data.proposal || data) };
  },
};
