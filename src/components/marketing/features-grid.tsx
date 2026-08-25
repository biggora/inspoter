import { getTranslations } from "next-intl/server";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/ui/icon";

const FEATURE_KEYS = [
  { key: "bookmarks", icon: "ri-bookmark-line", size: "small" },
  { key: "domains", icon: "ri-global-line", size: "small" },
  { key: "servers", icon: "ri-server-line", size: "large" },
  { key: "hosting", icon: "ri-cloud-line", size: "small" },
  { key: "uptime", icon: "ri-pulse-line", size: "large" },
  { key: "mail", icon: "ri-mail-line", size: "large" },
  { key: "messages", icon: "ri-message-2-line", size: "small" },
  { key: "logs", icon: "ri-file-list-3-line", size: "small" },
  { key: "alerts", icon: "ri-alert-line", size: "small" },
] as const;

export async function FeaturesGrid() {
  const t = await getTranslations("marketing");

  return (
    <section className="px-6 py-24" id="features">
      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="font-heading text-3xl font-bold text-foreground-50 sm:text-4xl">
            {t("features.title")}
          </h2>
          <p className="mt-4 text-lg text-foreground-400">
            {t("features.subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURE_KEYS.map((feature) => (
            <div
              key={feature.key}
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
                {t(`features.items.${feature.key}.title`)}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-foreground-400">
                {t(`features.items.${feature.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
