import Link from "next/link";
import { ArrowRight, GitBranch, MessageSquareText } from "lucide-react";

const integrations = [
  {
    title: "Slack Vault",
    href: "/integrations/slack",
    description: "Mirror accessible Slack conversations into the Tartarus data vault.",
    icon: MessageSquareText,
  },
  {
    title: "Linear",
    href: "/integrations/linear",
    description: "Browse and operate cached Linear projects and issues.",
    icon: GitBranch,
  },
];

export default function IntegrationsPage() {
  return (
    <div className="min-h-full bg-[var(--tartarus-void)] p-6 text-[var(--tartarus-ivory)]">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Integrations</h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--tartarus-ivory-muted)]">
          Connected systems that feed the Tartarus vault. Each integration keeps its own mirror before Kronus receives tools.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        {integrations.map((integration) => (
          <Link
            key={integration.href}
            href={integration.href}
            className="group rounded-lg border border-[var(--tartarus-border)] bg-[var(--tartarus-deep)] p-5 transition-colors hover:border-[var(--tartarus-gold-dim)] hover:bg-[var(--tartarus-surface)]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="rounded-md border border-[var(--tartarus-border)] bg-[var(--tartarus-void)] p-2 text-[var(--tartarus-gold)]">
                  <integration.icon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="font-medium">{integration.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-[var(--tartarus-ivory-muted)]">{integration.description}</p>
                </div>
              </div>
              <ArrowRight className="mt-1 h-4 w-4 text-[var(--tartarus-ivory-muted)] transition-transform group-hover:translate-x-1" />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
