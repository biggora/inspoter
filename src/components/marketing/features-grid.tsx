import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

const FEATURES = [
  {
    icon: "ri-bookmark-line",
    title: "Bookmarks",
    description:
      "Drag-and-drop bookmark board organized into categories. Quick access to all your resources.",
    size: "small" as const,
  },
  {
    icon: "ri-global-line",
    title: "Domains & DNS",
    description:
      "Manage DNS records across Cloudflare, Hetzner, and GoDaddy from a single interface.",
    size: "small" as const,
  },
  {
    icon: "ri-server-line",
    title: "Servers",
    description:
      "Monitor your VPS fleet with real-time CPU, RAM, and disk metrics. Start, stop, and restart with one click. Lightweight Python agent for detailed monitoring.",
    size: "large" as const,
  },
  {
    icon: "ri-cloud-line",
    title: "Hosting",
    description:
      "Unified view of cPanel and Hostinger accounts. Track disk usage, bandwidth, databases, and account status.",
    size: "small" as const,
  },
  {
    icon: "ri-pulse-line",
    title: "Uptime Monitoring",
    description:
      "HTTP, TCP, and Ping monitors with heartbeat visualization. Instant alerts when services go down. Configurable intervals and retries.",
    size: "large" as const,
  },
  {
    icon: "ri-mail-line",
    title: "Mail",
    description:
      "Full three-pane IMAP mail client built right in. Compose, reply, forward, manage folders — not just notifications, a real mail client.",
    size: "large" as const,
  },
  {
    icon: "ri-message-2-line",
    title: "Messages",
    description:
      "Slack-like channels organized by categories. Receive webhook messages alongside team communication.",
    size: "small" as const,
  },
  {
    icon: "ri-file-list-3-line",
    title: "Logs",
    description:
      "Centralized log viewer with severity filtering. Search, sort, and paginate through your infrastructure logs.",
    size: "small" as const,
  },
  {
    icon: "ri-alert-line",
    title: "Alerts",
    description:
      "Alert management with severity levels and categories. Never miss a critical infrastructure event.",
    size: "small" as const,
  },
];

export function FeaturesGrid() {
  return (
    <section className="px-6 py-24" id="features">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="font-heading text-3xl font-bold text-foreground-50 sm:text-4xl">
            Everything You Need
          </h2>
          <p className="mt-4 text-lg text-foreground-400">
            Nine modules. One dashboard. Zero context-switching.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <div
              key={feature.title}
              className={cn(
                "group rounded-xl border border-foreground-800/20 bg-background-900/60 p-6 transition-all duration-200 hover:border-primary-500/30 hover:bg-background-900",
                feature.size === "large" &&
                  "md:col-span-2 lg:col-span-1 lg:row-span-2",
              )}
            >
              <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-primary-500/10 p-2.5">
                <Icon
                  name={feature.icon}
                  className="text-xl text-primary-400"
                />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground-100">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-400">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
