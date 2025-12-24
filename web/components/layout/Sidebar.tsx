"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare,
  BookOpen,
  Image,
  Plug,
  Database,
  Moon,
  Sun,
  LogOut,
  Settings,
  Archive,
  Scissors,
  Languages,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useState, useEffect } from "react";
import { DatabaseOperations } from "@/components/db/DatabaseOperations";

const navItems = [
  {
    title: "Chat",
    href: "/chat",
    icon: MessageSquare,
    description: "Talk with Kronus",
  },
  {
    title: "Reader",
    href: "/reader",
    icon: BookOpen,
    description: "Browse journal entries",
  },
  {
    title: "Atropos",
    href: "/atropos",
    icon: Scissors,
    description: "The fate that corrects",
  },
  {
    title: "Hermes",
    href: "/hermes",
    icon: Languages,
    description: "The messenger translates",
  },
  {
    title: "Repository",
    href: "/repository",
    icon: Archive,
    description: "Writings, prompts, CV",
  },
  {
    title: "Multimedia",
    href: "/multimedia",
    icon: Image,
    description: "Images & diagrams",
  },
  {
    title: "Integrations",
    href: "/integrations",
    icon: Plug,
    description: "Linear, Slack, Notion",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    const isDarkMode = document.documentElement.classList.contains("dark");
    setIsDark(isDarkMode);

    // Check localStorage
    const savedTheme = localStorage.getItem("theme");
    if (savedTheme === "dark") {
      document.documentElement.classList.add("dark");
      setIsDark(true);
    }
  }, []);

  const toggleTheme = () => {
    const newIsDark = !isDark;
    setIsDark(newIsDark);
    document.documentElement.classList.toggle("dark", newIsDark);
    localStorage.setItem("theme", newIsDark ? "dark" : "light");
  };

  const handleLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  };

  return (
    <div className="tartarus-sidebar flex h-full w-64 flex-col bg-[var(--tartarus-deep)]">
      {/* Logo / Brand */}
      <div className="flex h-16 items-center border-b border-[var(--tartarus-border)] px-6">
        <Link href="/chat" className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full overflow-hidden border-2 border-[var(--tartarus-gold)] shadow-[0_0_15px_var(--tartarus-teal-glow)]">
            <img src="/chronus-logo.png" alt="Tartarus" className="h-full w-full object-cover" />
          </div>
          <span className="text-[var(--tartarus-ivory)] text-lg font-semibold tracking-tight">Tartarus</span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "tartarus-sidebar-item flex items-center gap-3 px-3 py-2.5 text-sm transition-colors rounded-md",
                isActive && "active"
              )}
            >
              <item.icon className={cn("h-5 w-5", isActive ? "text-[var(--tartarus-teal)]" : "")} />
              <div className="flex flex-col">
                <span>{item.title}</span>
                <span className="text-[var(--tartarus-ivory-faded)] text-xs">{item.description}</span>
              </div>
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-[var(--tartarus-border)]" />

      {/* Footer Actions */}
      <div className="space-y-2 p-4">
        {/* Settings Dialog */}
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-ivory)] hover:bg-[var(--tartarus-surface)]">
              <Settings className="h-4 w-4" />
              Settings
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg bg-[var(--tartarus-surface)] border-[var(--tartarus-border)]">
            <DialogHeader>
              <DialogTitle className="text-[var(--tartarus-ivory)]">Settings</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <DatabaseOperations />
            </div>
          </DialogContent>
        </Dialog>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-gold)] hover:bg-[var(--tartarus-surface)]"
          onClick={toggleTheme}
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {isDark ? "Light Mode" : "Dark Mode"}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start gap-2 text-[var(--tartarus-ivory-dim)] hover:text-[var(--tartarus-error)] hover:bg-[var(--tartarus-surface)]"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          Logout
        </Button>
      </div>
    </div>
  );
}
