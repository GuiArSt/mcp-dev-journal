"use client";

import { memo, type ReactNode } from "react";
import { Topbar } from "./Topbar";
import { Rail } from "./Rail";
import { MoodPanel } from "./MoodPanel";
import type { MoodTab } from "./types";
import type { Artifact, ArtifactRef } from "./artifacts/types";
import type { MuseThought } from "./MoodPanel";
import type { PendingApproval } from "./ApprovalCard";

export interface HourglassChromeProps {
  // Topbar
  conversationTitle: string;
  conversationId: number | null;
  moodCollapsed: boolean;
  moodTab: MoodTab;
  onMoodTabChange: (tab: MoodTab) => void;
  shelfCounts: { mood: number; infographic: number; repo: number };
  // Rail
  onNewChat: () => void;
  onLoadConversation: (id: number) => void;
  railOpen: boolean;
  onToggleRail: () => void;
  conversationStartedAt: number;
  chatModelLabel: string;
  // Mood panel
  shelf: ArtifactRef[];
  viewingUuid: string | null;
  onViewingUuidChange: (uuid: string | null) => void;
  hydratedArtifact: Artifact | null;
  hydrating: boolean;
  museSilenceReason: string | null;
  museThoughts: MuseThought[];
  musePainting: boolean;
  onToggleMoodCollapsed: () => void;
  onRegen: () => void;
  onOpenAddSheet: () => void;
  pendingApproval: PendingApproval | null;
  onAcceptApproval: () => void;
  onPickAlternative: (index: number) => void;
  onSkipApproval: () => void;
  onEditImage?: () => void;
  editPopover?: ReactNode;
  turnNav?: {
    visibleTurn: number;
    latestTurn: number;
    onStep: (direction: -1 | 1) => void;
    onCharged: (direction: -1 | 1) => void;
  };
}

/**
 * Shell around Topbar, Rail, and MoodPanel. Memoized so Kronus stream tokens
 * only re-render Hero and Composer — not the artifact shelf or mood chrome.
 */
export const HourglassChrome = memo(function HourglassChrome({
  conversationTitle,
  conversationId,
  moodCollapsed,
  moodTab,
  onMoodTabChange,
  shelfCounts,
  onNewChat,
  onLoadConversation,
  railOpen,
  onToggleRail,
  conversationStartedAt,
  chatModelLabel,
  shelf,
  viewingUuid,
  onViewingUuidChange,
  hydratedArtifact,
  hydrating,
  museSilenceReason,
  museThoughts,
  musePainting,
  onToggleMoodCollapsed,
  onRegen,
  onOpenAddSheet,
  pendingApproval,
  onAcceptApproval,
  onPickAlternative,
  onSkipApproval,
  onEditImage,
  editPopover,
  turnNav,
}: HourglassChromeProps) {
  return (
    <>
      <Topbar
        title={conversationTitle || "Untitled Conversation"}
        conversationId={conversationId}
        shelfVisible={!moodCollapsed}
        shelfTabs={{
          active: moodTab,
          onChange: onMoodTabChange,
          counts: shelfCounts,
        }}
      />

      <Rail
        onNewChat={onNewChat}
        onLoadConversation={onLoadConversation}
        open={railOpen}
        onToggleOpen={onToggleRail}
        conversationTitle={conversationTitle}
        conversationStartedAt={conversationStartedAt}
        modelLabel={chatModelLabel}
        currentConversationId={conversationId}
      />

      <MoodPanel
        shelf={shelf}
        viewingUuid={viewingUuid}
        onViewingUuidChange={onViewingUuidChange}
        hydratedArtifact={hydratedArtifact}
        hydrating={hydrating}
        museSilenceReason={museSilenceReason}
        museThoughts={museThoughts}
        musePainting={musePainting}
        collapsed={moodCollapsed}
        onToggleCollapse={onToggleMoodCollapsed}
        tab={moodTab}
        onTabChange={onMoodTabChange}
        onRegen={onRegen}
        onAdd={onOpenAddSheet}
        pendingApproval={pendingApproval}
        onAcceptApproval={onAcceptApproval}
        onPickAlternative={onPickAlternative}
        onSkipApproval={onSkipApproval}
        onEditImage={onEditImage}
        editPopover={editPopover}
        turnNav={turnNav}
      />
    </>
  );
});
