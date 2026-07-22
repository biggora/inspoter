import { Icon } from "@/components/ui/icon";
import { HeroSection } from "./hero-section";
import { FeaturesGrid } from "./features-grid";
import { FeatureDeepDive } from "./feature-deep-dive";
import { DeploySection } from "./deploy-section";
import { HighlightsRow } from "./highlights-row";
import { CommunitySection } from "./community-section";
import { MarketingFooter } from "./marketing-footer";
import { TerminalWindow } from "./terminal-window";

export function MarketingHomePage() {
  return (
    <main className="marketing-force-dark min-h-screen bg-background-950 text-foreground-200">
      <HeroSection />
      <FeaturesGrid />

      <FeatureDeepDive
        title="Multi-Provider"
        headline="All Your Providers, One Interface"
        description="Stop juggling Cloudflare, Hetzner, GoDaddy, cPanel, and Hostinger dashboards. Inspoter aggregates them into a single, unified view."
        bullets={[
          "DNS management across Cloudflare, Hetzner DNS, and GoDaddy",
          "Server control for Hetzner Cloud with power actions",
          "Hosting accounts from cPanel WHM and Hostinger",
          "Encrypted credential storage with AES-256-GCM",
        ]}
        visual={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { icon: "ri-cloud-line", name: "Cloudflare" },
              { icon: "ri-server-line", name: "Hetzner" },
              { icon: "ri-global-line", name: "GoDaddy" },
              { icon: "ri-terminal-box-line", name: "cPanel" },
              { icon: "ri-cloud-line", name: "Hostinger" },
              { icon: "ri-add-circle-line", name: "More soon" },
            ].map((p) => (
              <div
                key={p.name}
                className="flex flex-col items-center gap-2 rounded-xl border border-foreground-800/20 bg-background-900/60 p-4"
              >
                <Icon name={p.icon} className="text-2xl text-foreground-300" />
                <span className="text-xs text-foreground-400">{p.name}</span>
              </div>
            ))}
          </div>
        }
      />

      <FeatureDeepDive
        title="Built-in Mail"
        headline="A Real Mail Client, Not Just Notifications"
        description="Inspoter includes a full three-pane IMAP mail client. Read, compose, reply, forward, manage folders — all without leaving the dashboard."
        bullets={[
          "Multi-account IMAP support with folder navigation",
          "Compose, reply, and forward with SMTP sending",
          "Attachment support with lazy IMAP fetch",
          "Webhook mailbox for automated inbound messages",
        ]}
        reverse
        visual={
          <div className="rounded-xl border border-foreground-800/20 bg-background-900/60 p-4">
            <div className="flex gap-3">
              <div className="w-1/4 space-y-2 border-r border-foreground-800/20 pr-3">
                {["Inbox", "Sent", "Drafts", "Trash"].map((f) => (
                  <div
                    key={f}
                    className={`rounded-md px-2 py-1 text-xs ${f === "Inbox" ? "bg-primary-500/10 text-primary-400" : "text-foreground-500"}`}
                  >
                    {f}
                  </div>
                ))}
              </div>
              <div className="w-3/4 space-y-2">
                {[
                  {
                    from: "deploy@ci.internal",
                    subject: "Build #847 passed",
                    time: "2m ago",
                  },
                  {
                    from: "alerts@monitoring",
                    subject: "Server us-east-1 recovered",
                    time: "1h ago",
                  },
                  {
                    from: "team@company.com",
                    subject: "Weekly infrastructure review",
                    time: "3h ago",
                  },
                ].map((m) => (
                  <div
                    key={m.subject}
                    className="flex items-center gap-3 rounded-md border border-foreground-800/10 bg-background-950/50 px-3 py-2"
                  >
                    <div className="flex-1 truncate">
                      <p className="truncate text-xs font-medium text-foreground-200">
                        {m.from}
                      </p>
                      <p className="truncate text-xs text-foreground-400">
                        {m.subject}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-foreground-500">
                      {m.time}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        }
      />

      <FeatureDeepDive
        title="Server Monitoring"
        headline="Real-Time Metrics from Every Server"
        description="Deploy a lightweight Python agent via Docker and get instant CPU, memory, disk, and load metrics streamed to your dashboard."
        bullets={[
          "CPU, RAM, swap, disk, and load average monitoring",
          "Lightweight Docker agent — one command to deploy",
          "Token-based enrollment with lifecycle management",
          "Works alongside provider-reported server data",
        ]}
        visual={
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "CPU", value: "23%", icon: "ri-cpu-line" },
                { label: "Memory", value: "4.2 / 8 GB", icon: "ri-ram-line" },
                {
                  label: "Disk",
                  value: "67%",
                  icon: "ri-hard-drive-3-line",
                },
                { label: "Load", value: "0.45", icon: "ri-speed-line" },
              ].map((m) => (
                <div
                  key={m.label}
                  className="rounded-xl border border-foreground-800/20 bg-background-900/60 p-4"
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      name={m.icon}
                      className="text-sm text-foreground-500"
                    />
                    <span className="text-xs text-foreground-500">
                      {m.label}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground-100">
                    {m.value}
                  </p>
                </div>
              ))}
            </div>
            <TerminalWindow title="Deploy Agent">
              <p>
                <span className="text-accent-400">$</span> docker run -d
                inspoter/metrics-agent
              </p>
            </TerminalWindow>
          </div>
        }
      />

      <DeploySection />
      <HighlightsRow />
      <CommunitySection />
      <MarketingFooter />
    </main>
  );
}
