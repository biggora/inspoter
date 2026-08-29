import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";
import { HeroSection } from "./hero-section";
import { FeaturesGrid } from "./features-grid";
import { FeatureDeepDive } from "./feature-deep-dive";
import { DeploySection } from "./deploy-section";
import { HighlightsRow } from "./highlights-row";
import { CommunitySection } from "./community-section";
import { MarketingFooter } from "./marketing-footer";
import { TerminalWindow } from "./terminal-window";

export async function MarketingHomePage() {
  const t = await getTranslations("marketing");
  const mailFolders = t.raw("deepDive.mail.folders") as string[];

  return (
    <main className="marketing-force-dark min-h-screen bg-background-950 text-foreground-200">
      <HeroSection />
      <FeaturesGrid />

      <FeatureDeepDive
        title={t("deepDive.providers.title")}
        headline={t("deepDive.providers.headline")}
        description={t("deepDive.providers.description")}
        bullets={t.raw("deepDive.providers.bullets") as string[]}
        visual={
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {[
              { icon: "ri-cloud-line", name: "Cloudflare" },
              { icon: "ri-server-line", name: "Hetzner" },
              { icon: "ri-global-line", name: "GoDaddy" },
              { icon: "ri-terminal-box-line", name: "cPanel" },
              { icon: "ri-cloud-line", name: "Hostinger" },
              {
                icon: "ri-add-circle-line",
                name: t("deepDive.providers.moreSoon"),
              },
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
        title={t("deepDive.mail.title")}
        headline={t("deepDive.mail.headline")}
        description={t("deepDive.mail.description")}
        bullets={t.raw("deepDive.mail.bullets") as string[]}
        reverse
        visual={
          <div className="rounded-xl border border-foreground-800/20 bg-background-900/60 p-4">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-3">
              <div className="min-w-0 space-y-2 border-r border-foreground-800/20 pr-3">
                {mailFolders.map((folder, index) => (
                  <div
                    key={folder}
                    className={`rounded-md px-2 py-1 text-xs ${index === 0 ? "bg-primary-500/10 text-primary-400" : "text-foreground-500"}`}
                  >
                    {folder}
                  </div>
                ))}
              </div>
              <div className="min-w-0 space-y-2">
                {[
                  {
                    from: "deploy@ci.internal",
                    subject: t("deepDive.mail.demo.build.subject"),
                    time: t("deepDive.mail.demo.build.time"),
                  },
                  {
                    from: "alerts@monitoring",
                    subject: t("deepDive.mail.demo.recovered.subject"),
                    time: t("deepDive.mail.demo.recovered.time"),
                  },
                  {
                    from: "team@company.com",
                    subject: t("deepDive.mail.demo.review.subject"),
                    time: t("deepDive.mail.demo.review.time"),
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
                    <span className="shrink-0 text-2xs text-foreground-500">
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
        title={t("deepDive.monitoring.title")}
        headline={t("deepDive.monitoring.headline")}
        description={t("deepDive.monitoring.description")}
        bullets={t.raw("deepDive.monitoring.bullets") as string[]}
        visual={
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              {[
                {
                  label: t("deepDive.monitoring.metrics.cpu"),
                  value: "23%",
                  icon: "ri-cpu-line",
                },
                {
                  label: t("deepDive.monitoring.metrics.memory"),
                  value: "4.2 / 8 GB",
                  icon: "ri-ram-line",
                },
                {
                  label: t("deepDive.monitoring.metrics.disk"),
                  value: "67%",
                  icon: "ri-hard-drive-3-line",
                },
                {
                  label: t("deepDive.monitoring.metrics.load"),
                  value: "0.45",
                  icon: "ri-speed-line",
                },
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
            <TerminalWindow title={t("deepDive.monitoring.terminalTitle")}>
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
