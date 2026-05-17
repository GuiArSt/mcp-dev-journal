"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import type {
  Document,
  Skill,
  WorkExperience,
  Education,
  PortfolioProject,
  LinearCachedProject,
  LinearCachedIssue,
  SliteCachedNote,
  NotionCachedPage,
  KronusChat,
  ChatConversation,
  MediaAsset,
  SkillCategory,
  AiIntegration,
  AiArtifact,
  AiLogSession,
  AiProposal,
} from "@/lib/types/repository";

interface DocumentType {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  sortOrder: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function useRepositoryData(activeTab: string) {
  const [writings, setWritings] = useState<Document[]>([]);
  const [prompts, setPrompts] = useState<Document[]>([]);
  const [notes, setNotes] = useState<Document[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [experience, setExperience] = useState<WorkExperience[]>([]);
  const [education, setEducation] = useState<Education[]>([]);
  const [portfolioProjects, setPortfolioProjects] = useState<PortfolioProject[]>([]);
  const [skillCategories, setSkillCategories] = useState<SkillCategory[]>([]);
  const [documentTypes, setDocumentTypes] = useState<DocumentType[]>([]);
  const [loading, setLoading] = useState(true);

  // Linear cache state
  const [linearProjects, setLinearProjects] = useState<LinearCachedProject[]>([]);
  const [linearIssues, setLinearIssues] = useState<LinearCachedIssue[]>([]);
  const [linearLastSync, setLinearLastSync] = useState<string | null>(null);
  const [linearSyncing, setLinearSyncing] = useState(false);

  // Slite cache state
  const [sliteNotes, setSliteNotes] = useState<SliteCachedNote[]>([]);
  const [sliteLastSync, setSliteLastSync] = useState<string | null>(null);
  const [sliteSyncing, setSliteSyncing] = useState(false);
  const [sliteCurrentUserId, setSliteCurrentUserId] = useState<string | null>(null);

  // Notion cache state
  const [notionPages, setNotionPages] = useState<NotionCachedPage[]>([]);
  const [notionLastSync, setNotionLastSync] = useState<string | null>(null);
  const [notionSyncing, setNotionSyncing] = useState(false);

  // Kronus MCP chats state
  const [kronusChats, setKronusChats] = useState<KronusChat[]>([]);
  const [kronusChatsPagination, setKronusChatsPagination] = useState<{
    total: number;
    limit: number;
    offset: number;
    has_more: boolean;
  } | null>(null);

  // Main chat conversations state
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [conversationsPagination, setConversationsPagination] = useState<{
    total: number;
  } | null>(null);

  // Media assets state
  const [mediaAssets, setMediaAssets] = useState<MediaAsset[]>([]);
  const [mediaTotal, setMediaTotal] = useState<number>(0);

  // AI Integration Library state
  const [aiIntegrations, setAiIntegrations] = useState<AiIntegration[]>([]);
  const [aiArtifacts, setAiArtifacts] = useState<AiArtifact[]>([]);
  const [aiLogSessions, setAiLogSessions] = useState<AiLogSession[]>([]);
  const [aiProposals, setAiProposals] = useState<AiProposal[]>([]);
  const [aiIntegrationsScanning, setAiIntegrationsScanning] = useState(false);

  // Tab data cache
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [tabDataCache, setTabDataCache] = useState<Record<string, { data: any; fetchedAt: number }>>(
    {}
  );

  // AbortController ref for cancelling in-flight requests on tab switch
  const abortControllerRef = useRef<AbortController | null>(null);

  // Apply cached data to state based on tab
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyTabData = useCallback((tab: string, data: any) => {
    switch (tab) {
      case "writings":
        setWritings(data.documents || []);
        if (data.documentTypes) setDocumentTypes(data.documentTypes);
        break;
      case "prompts":
        setPrompts(data.documents || []);
        if (data.documentTypes) setDocumentTypes(data.documentTypes);
        break;
      case "notes":
        setNotes(data.documents || []);
        break;
      case "cv":
        setSkills(data.skills || []);
        setExperience(data.experience || []);
        setEducation(data.education || []);
        if (data.categories) setSkillCategories(data.categories);
        break;
      case "portfolio":
        setPortfolioProjects(data.projects || []);
        break;
      case "linear":
        setLinearProjects(data.projects || []);
        setLinearIssues(data.issues || []);
        setLinearLastSync(data.lastSync || null);
        break;
      case "slite":
        setSliteNotes(data.notes || []);
        setSliteLastSync(data.lastSync || null);
        if (data.currentUserId) setSliteCurrentUserId(data.currentUserId);
        break;
      case "notion":
        setNotionPages(data.pages || []);
        setNotionLastSync(data.lastSync || null);
        break;
      case "chats":
        setConversations(data.conversations || []);
        setConversationsPagination(data.conversationsPagination || null);
        setKronusChats(data.kronusChats || []);
        setKronusChatsPagination(data.kronusChatsPagination || null);
        break;
      case "media":
        setMediaAssets(data.assets || []);
        setMediaTotal(data.total || 0);
        break;
      case "ai-integrations":
        setAiIntegrations(data.integrations || []);
        setAiArtifacts(data.artifacts || []);
        setAiLogSessions(data.sessions || []);
        setAiProposals(data.proposals || []);
        break;
    }
  }, []);

  const invalidateTabCache = useCallback((tab: string) => {
    setTabDataCache((prev) => {
      const next = { ...prev };
      delete next[tab];
      return next;
    });
  }, []);

  const fetchData = useCallback(
    async (forceRefresh = false) => {
      // Check cache first (unless forcing refresh)
      const cached = tabDataCache[activeTab];
      if (!forceRefresh && cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
        applyTabData(activeTab, cached.data);
        setLoading(false);
        return;
      }

      // Cancel any in-flight request
      abortControllerRef.current?.abort();
      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      setLoading(true);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let fetchedData: any = {};

        if (activeTab === "writings") {
          const [res, typesRes] = await Promise.all([
            fetch("/api/documents?type=writing", { signal }),
            fetch("/api/document-types", { signal }),
          ]);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = { documents: data.documents || [] };
          if (typesRes.ok) {
            fetchedData.documentTypes = await typesRes.json();
          }
        } else if (activeTab === "prompts") {
          const [res, typesRes] = await Promise.all([
            fetch("/api/documents?type=prompt", { signal }),
            fetch("/api/document-types", { signal }),
          ]);
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = { documents: data.documents || [] };
          if (typesRes.ok) {
            fetchedData.documentTypes = await typesRes.json();
          }
        } else if (activeTab === "cv") {
          const [cvRes, catRes] = await Promise.all([
            fetch("/api/cv", { signal }),
            fetch("/api/cv/categories", { signal }),
          ]);
          if (!cvRes.ok) throw new Error(`HTTP error! status: ${cvRes.status}`);
          const data = await cvRes.json();
          fetchedData = {
            skills: data.skills || [],
            experience: data.experience || [],
            education: data.education || [],
          };
          if (catRes.ok) {
            fetchedData.categories = await catRes.json();
          }
        } else if (activeTab === "portfolio") {
          const res = await fetch("/api/portfolio-projects", { signal });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = { projects: data.projects || [] };
        } else if (activeTab === "notes") {
          const res = await fetch("/api/documents?type=note", { signal });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = { documents: data.documents || [] };
        } else if (activeTab === "linear") {
          const res = await fetch("/api/integrations/linear/cache", { signal });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = {
            projects: data.projects || [],
            issues: data.issues || [],
            lastSync: data.lastSync || null,
          };
        } else if (activeTab === "slite") {
          const res = await fetch("/api/integrations/slite/cache", { signal });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = {
            notes: data.notes || [],
            lastSync: data.lastSync || null,
          };
        } else if (activeTab === "notion") {
          const res = await fetch("/api/integrations/notion/cache", { signal });
          if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
          const data = await res.json();
          fetchedData = {
            pages: data.pages || [],
            lastSync: data.lastSync || null,
          };
        } else if (activeTab === "chats") {
          const [convRes, kronusRes] = await Promise.all([
            fetch("/api/conversations?limit=20", { signal }),
            fetch("/api/kronus/chats?limit=20", { signal }),
          ]);
          fetchedData = {};
          if (convRes.ok) {
            const convData = await convRes.json();
            fetchedData.conversations = convData.conversations || [];
            fetchedData.conversationsPagination = { total: convData.total || 0 };
          }
          if (kronusRes.ok) {
            const kronusData = await kronusRes.json();
            fetchedData.kronusChats = kronusData.chats || [];
            fetchedData.kronusChatsPagination = kronusData.pagination || null;
          }
        } else if (activeTab === "media") {
          const res = await fetch("/api/media?limit=24", { signal });
          if (res.ok) {
            const data = await res.json();
            fetchedData = { assets: data.assets || [], total: data.total || 0 };
          }
        } else if (activeTab === "ai-integrations") {
          const [integrationsRes, artifactsRes, sessionsRes, proposalsRes] = await Promise.all([
            fetch("/api/ai-integrations", { signal }),
            fetch("/api/ai-integrations/artifacts?limit=80", { signal }),
            fetch("/api/ai-integrations/sessions?limit=80", { signal }),
            fetch("/api/ai-integrations/proposals?limit=40", { signal }),
          ]);
          fetchedData = {};
          if (integrationsRes.ok) fetchedData.integrations = (await integrationsRes.json()).integrations || [];
          if (artifactsRes.ok) fetchedData.artifacts = (await artifactsRes.json()).artifacts || [];
          if (sessionsRes.ok) fetchedData.sessions = (await sessionsRes.json()).sessions || [];
          if (proposalsRes.ok) fetchedData.proposals = (await proposalsRes.json()).proposals || [];
        }

        applyTabData(activeTab, fetchedData);

        setTabDataCache((prev) => ({
          ...prev,
          [activeTab]: { data: fetchedData, fetchedAt: Date.now() },
        }));
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch data:", error);
        if (activeTab === "writings") setWritings([]);
        else if (activeTab === "prompts") setPrompts([]);
        else if (activeTab === "notes") setNotes([]);
        else if (activeTab === "portfolio") setPortfolioProjects([]);
        else if (activeTab === "cv") {
          setSkills([]);
          setExperience([]);
          setEducation([]);
        } else if (activeTab === "linear") {
          setLinearProjects([]);
          setLinearIssues([]);
          setLinearLastSync(null);
        } else if (activeTab === "slite") {
          setSliteNotes([]);
          setSliteLastSync(null);
        } else if (activeTab === "notion") {
          setNotionPages([]);
          setNotionLastSync(null);
        } else if (activeTab === "chats") {
          setConversations([]);
          setConversationsPagination(null);
          setKronusChats([]);
          setKronusChatsPagination(null);
        } else if (activeTab === "media") {
          setMediaAssets([]);
          setMediaTotal(0);
        } else if (activeTab === "ai-integrations") {
          setAiIntegrations([]);
          setAiArtifacts([]);
          setAiLogSessions([]);
          setAiProposals([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [activeTab, tabDataCache, applyTabData]
  );

  // Sync Slite data
  const syncSliteData = useCallback(async () => {
    setSliteSyncing(true);
    try {
      const res = await fetch("/api/integrations/slite/sync", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      console.log("Slite sync result:", data);
      const cacheRes = await fetch("/api/integrations/slite/cache");
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        setSliteNotes(cacheData.notes || []);
        setSliteLastSync(cacheData.lastSync || null);
        if (cacheData.currentUserId) setSliteCurrentUserId(cacheData.currentUserId);
      }
    } catch (error) {
      console.error("Failed to sync Slite data:", error);
    } finally {
      setSliteSyncing(false);
    }
  }, []);

  // Sync Notion data
  const syncNotionData = useCallback(async () => {
    setNotionSyncing(true);
    try {
      const res = await fetch("/api/integrations/notion/sync", {
        method: "POST",
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      console.log("Notion sync result:", data);
      const cacheRes = await fetch("/api/integrations/notion/cache");
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        setNotionPages(cacheData.pages || []);
        setNotionLastSync(cacheData.lastSync || null);
      }
    } catch (error) {
      console.error("Failed to sync Notion data:", error);
    } finally {
      setNotionSyncing(false);
    }
  }, []);

  // Sync Linear data
  const syncLinearData = useCallback(async () => {
    setLinearSyncing(true);
    try {
      const res = await fetch("/api/integrations/linear/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      console.log("Linear sync result:", data);
      const cacheRes = await fetch("/api/integrations/linear/cache");
      if (cacheRes.ok) {
        const cacheData = await cacheRes.json();
        setLinearProjects(cacheData.projects || []);
        setLinearIssues(cacheData.issues || []);
        setLinearLastSync(cacheData.lastSync || null);
      }
    } catch (error) {
      console.error("Failed to sync Linear data:", error);
    } finally {
      setLinearSyncing(false);
    }
  }, []);

  const scanAiIntegrations = useCallback(async () => {
    setAiIntegrationsScanning(true);
    try {
      const res = await fetch("/api/ai-integrations/scan", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      invalidateTabCache("ai-integrations");
      await fetchData(true);
    } catch (error) {
      console.error("Failed to scan AI integrations:", error);
    } finally {
      setAiIntegrationsScanning(false);
    }
  }, [fetchData, invalidateTabCache]);

  useEffect(() => {
    fetchData();
    return () => {
      abortControllerRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  return {
    loading,
    writings,
    prompts,
    notes,
    skills,
    experience,
    education,
    portfolioProjects,
    skillCategories,
    documentTypes,
    linearProjects,
    linearIssues,
    linearLastSync,
    linearSyncing,
    sliteNotes,
    sliteLastSync,
    sliteSyncing,
    sliteCurrentUserId,
    syncSliteData,
    notionPages,
    notionLastSync,
    notionSyncing,
    syncNotionData,
    kronusChats,
    kronusChatsPagination,
    conversations,
    conversationsPagination,
    mediaAssets,
    mediaTotal,
    aiIntegrations,
    aiArtifacts,
    aiLogSessions,
    aiProposals,
    aiIntegrationsScanning,
    scanAiIntegrations,
    fetchData,
    invalidateTabCache,
    syncLinearData,
  };
}
