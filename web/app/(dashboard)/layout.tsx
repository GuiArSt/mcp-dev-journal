"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ClientTelemetry } from "@/components/dev/ClientTelemetry";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLegacyChatRoute = pathname === "/legacy-chat";
  const isHourglassRoute = pathname === "/chat";

  // Hourglass route renders its own full-screen shell (rail, topbar, panels).
  if (isHourglassRoute) {
    return (
      <TooltipProvider>
        <ClientTelemetry />
        {children}
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <ClientTelemetry />
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--tartarus-deep)] md:flex-row">
        <Sidebar />
        <main className="relative flex-1 overflow-auto bg-[var(--tartarus-void)]">
          {/* ChatInterface stays mounted, hidden when not on /legacy-chat */}
          <div
            className={`kronus-chamber absolute inset-0 flex flex-col ${isLegacyChatRoute ? "" : "hidden"}`}
          >
            <ChatInterface />
          </div>
          {/* Other page content */}
          {!isLegacyChatRoute && children}
        </main>
      </div>
    </TooltipProvider>
  );
}
