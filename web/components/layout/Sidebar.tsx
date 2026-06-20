"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Moon,
  Sun,
  LogOut,
  Archive,
  PanelLeftClose,
  PanelLeft,
  Menu,
  Activity,
  Crosshair,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useState, useEffect } from "react";
import { useIsMobile } from "@/hooks/useMobile";

const navItems = [
  {
    title: "Chat",
    href: "/chat",
    icon: MessageSquare,
    description: "Kronus and the Muse",
  },
  {
    title: "Reader",
    href: "/reader",
    icon: BookOpen,
    description: "Browse journal entries",
  },
  {
    title: "Library",
    href: "/library",
    icon: Archive,
    description: "Unified knowledge base",
  },
  {
    title: "Artemis",
    href: "/artemis",
    icon: Crosshair,
    description: "Job hunt tracker",
  },
];

// Page title mapping for mobile header
const pageTitles: Record<string, string> = {
  "/chat": "Chat",
  "/legacy-chat": "Legacy Chat",
  "/reader": "Reader",
  "/library": "Library",
  "/artemis": "Artemis",
  "/repository": "Library",
  "/kronus": "Kronus History",
  "/multimedia": "Multimedia",
  "/prompts": "Prompts",
  "/integrations": "Integrations",
  "/monitor": "Monitor",
};

function getPageTitle(pathname: string): string {
  if (pageTitles[pathname]) return pageTitles[pathname];
  // Check prefix matches for dynamic routes
  for (const [prefix, title] of Object.entries(pageTitles)) {
    if (pathname.startsWith(prefix + "/")) return title;
  }
  return "Tartarus";
}

/** Shared sidebar content used by both desktop sidebar and mobile drawer */
function SidebarContent({
  expanded,
  isDark,
  toggleTheme,
  handleLogout,
  isPinned,
  togglePinned,
  showPinToggle,
  onNavigate,
}: {
  expanded: boolean;
  isDark: boolean;
  toggleTheme: () => void;
  handleLogout: () => void;
  isPinned: boolean;
  togglePinned: () => void;
  showPinToggle: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  return (
    <>
      {/* Logo / Brand */}
      <div
        className={cn(
          "flex h-16 items-center border-b border-[var(--tartarus-border)]",
          expanded ? "px-6" : "justify-center px-2"
        )}
      >
        <Link href="/chat" className="flex items-center gap-3" onClick={onNavigate}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-surface)] shadow-[0_1px_4px_rgba(0,0,0,0.3)]">
            <img
              src="/chronus-logo.png"
              alt="Tartarus"
              className="h-full w-full object-cover"
              style={{ filter: "brightness(1.2) contrast(1.05) sepia(0.15)" }}
            />
          </div>
          {expanded && (
            <span className="text-lg font-semibold tracking-tight text-[var(--tartarus-gold)]">
              Tartarus
            </span>
          )}
        </Link>
      </div>

      {/* Navigation */}
      <nav className={cn("flex-1 space-y-1", expanded ? "p-4" : "p-2")}>
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

          if (!expanded) {
            return (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "tartarus-sidebar-item relative flex items-center justify-center rounded-md p-2.5 transition-colors hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-ivory)]",
                      isActive && "active"
                    )}
                    onClick={onNavigate}
                  >
                    <item.icon
                      className={cn("h-5 w-5", isActive ? "text-[var(--tartarus-teal)]" : "")}
                    />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p className="font-medium">{item.title}</p>
                  <p className="text-muted-foreground text-xs">{item.description}</p>
                </TooltipContent>
              </Tooltip>
            );
          }

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "tartarus-sidebar-item flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-ivory)]",
                isActive && "active"
              )}
              onClick={onNavigate}
            >
              <item.icon
                className={cn("h-5 w-5 shrink-0", isActive ? "text-[var(--tartarus-teal)]" : "")}
              />
              <div className="flex min-w-0 flex-col">
                <span>{item.title}</span>
                <span className="truncate text-xs text-[var(--tartarus-ivory-faded)]">
                  {item.description}
                </span>
              </div>
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-[var(--tartarus-border)]" />

      {/* Control Panel link (was Monitor) */}
      <div className={cn("pt-1", expanded ? "px-4" : "px-2")}>
        {!expanded ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/monitor"
                className={cn(
                  "flex w-full items-center justify-center rounded-md p-2 text-[var(--tartarus-ivory-dim)] transition-colors hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-ivory)]",
                  pathname?.startsWith("/monitor") && "text-[var(--tartarus-teal)]"
                )}
                onClick={onNavigate}
              >
                <Activity className="h-4 w-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Control Panel</TooltipContent>
          </Tooltip>
        ) : (
          <Link
            href="/monitor"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-[var(--tartarus-ivory-dim)] transition-colors hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-ivory)]",
              pathname?.startsWith("/monitor") && "text-[var(--tartarus-teal)]"
            )}
            onClick={onNavigate}
          >
            <Activity className="h-4 w-4" />
            Control Panel
          </Link>
        )}
      </div>

      {/* Footer Actions */}
      <div className={cn("space-y-2", expanded ? "p-4" : "p-2")}>
        {/* Pin/Unpin toggle - only show when expanded on desktop */}
        {showPinToggle && expanded && (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-ivory)]"
            onClick={togglePinned}
          >
            {isPinned ? (
              <>
                <PanelLeftClose className="h-4 w-4" />
                Unpin
              </>
            ) : (
              <>
                <PanelLeft className="h-4 w-4" />
                Pin Sidebar
              </>
            )}
          </Button>
        )}

        {/* Theme toggle */}
        {!expanded ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center p-2 text-[var(--tartarus-ivory-dim)] hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-gold)]"
                onClick={toggleTheme}
              >
                {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{isDark ? "Light Mode" : "Dark Mode"}</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-gold)]"
            onClick={toggleTheme}
          >
            {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {isDark ? "Light Mode" : "Dark Mode"}
          </Button>
        )}

        {/* Logout */}
        {!expanded ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-center p-2 text-[var(--tartarus-ivory-dim)] hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-error)]"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Logout</TooltipContent>
          </Tooltip>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:bg-[var(--tartarus-surface)] hover:text-[var(--tartarus-error)]"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
            Logout
          </Button>
        )}
      </div>
    </>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const isMobile = useIsMobile();
  const [isDark, setIsDark] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }

    const savedPinned = localStorage.getItem("sidebar-pinned");
    if (savedPinned === "true") {
      setIsPinned(true);
    }
  }, []);

  // Close sheet on navigation
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  const showExpanded = isPinned || isHovered;

  const togglePinned = () => {
    const newPinned = !isPinned;
    setIsPinned(newPinned);
    localStorage.setItem("sidebar-pinned", newPinned ? "true" : "false");
  };

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle("dark", newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
    window.dispatchEvent(new CustomEvent("theme-change", { detail: { isDark: newIsDark } }));
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  // Mobile: Sheet drawer + top header bar
  if (isMobile) {
    return (
      <>
        {/* Mobile top bar */}
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] px-3">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-[var(--tartarus-ivory-dim)]"
            onClick={() => setSheetOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--tartarus-gold-dim)] bg-[var(--tartarus-surface)]">
              <img
                src="/chronus-logo.png"
                alt="Tartarus"
                className="h-full w-full object-cover"
                style={{ filter: "brightness(1.2) contrast(1.05) sepia(0.15)" }}
              />
            </div>
            <span className="text-sm font-medium text-[var(--tartarus-ivory)]">
              {getPageTitle(pathname)}
            </span>
          </div>
        </div>

        {/* Mobile sheet drawer */}
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetContent
            side="left"
            showCloseButton={false}
            className="w-64 border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-0"
          >
            <SheetTitle className="sr-only">Navigation</SheetTitle>
            <div className="flex h-full flex-col">
              <SidebarContent
                expanded={true}
                isDark={isDark}
                toggleTheme={toggleTheme}
                handleLogout={handleLogout}
                isPinned={false}
                togglePinned={() => {}}
                showPinToggle={false}
                onNavigate={() => setSheetOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </>
    );
  }

  // Desktop: hover-expand sidebar
  return (
    <div
      className={cn(
        "tartarus-sidebar flex h-full flex-col bg-[var(--tartarus-deep)] transition-[width] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
        showExpanded ? "w-64" : "sidebar-collapsed w-16"
      )}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <SidebarContent
        expanded={showExpanded}
        isDark={isDark}
        toggleTheme={toggleTheme}
        handleLogout={handleLogout}
        isPinned={isPinned}
        togglePinned={togglePinned}
        showPinToggle={true}
      />
    </div>
  );
}
