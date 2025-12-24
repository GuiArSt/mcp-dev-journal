import { AtroposInterface } from "@/components/atropos/AtroposInterface";
import { Scissors } from "lucide-react";

export default function AtroposPage() {
  return (
    <div className="flex flex-col h-full bg-[var(--tartarus-void)]">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 py-4 border-b border-[var(--tartarus-border)]">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--tartarus-gold)]/20 border border-[var(--tartarus-gold)]/30">
          <Scissors className="h-5 w-5 text-[var(--tartarus-gold)]" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-[var(--tartarus-ivory)]">
            Atropos
          </h1>
          <p className="text-sm text-[var(--tartarus-ivory-dim)]">
            The Fate That Corrects · Spellcheck that learns your dance
          </p>
        </div>
      </div>

      {/* Main Interface */}
      <div className="flex-1 overflow-hidden">
        <AtroposInterface />
      </div>
    </div>
  );
}
