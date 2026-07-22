import { Icon } from "@/components/ui/icon";

const HIGHLIGHTS = [
  {
    icon: "ri-team-line",
    title: "Workspaces",
    description:
      "Multi-tenant isolation. Each team gets their own workspace with custom section visibility.",
  },
  {
    icon: "ri-shield-keyhole-line",
    title: "Encrypted Credentials",
    description:
      "AES-256-GCM encryption for all provider API keys and passwords at rest.",
  },
  {
    icon: "ri-webhook-line",
    title: "Webhooks In & Out",
    description:
      "Ingest events from any service. Push alerts and status changes to external endpoints.",
  },
  {
    icon: "ri-key-2-line",
    title: "SSO Ready",
    description:
      "Authentik OIDC integration alongside traditional password authentication.",
  },
];

export function HighlightsRow() {
  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHTS.map((h) => (
            <div
              key={h.title}
              className="rounded-xl border border-foreground-800/20 bg-background-900/40 p-6"
            >
              <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-accent-500/10 p-2.5">
                <Icon name={h.icon} className="text-xl text-accent-400" />
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground-100">
                {h.title}
              </h3>
              <p className="mt-2 text-sm text-foreground-400">
                {h.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
