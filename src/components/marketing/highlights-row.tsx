import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";

const HIGHLIGHT_KEYS = [
  { key: "workspaces", icon: "ri-team-line" },
  { key: "encryption", icon: "ri-shield-keyhole-line" },
  { key: "webhooks", icon: "ri-webhook-line" },
  { key: "sso", icon: "ri-key-2-line" },
] as const;

export async function HighlightsRow() {
  const t = await getTranslations("marketing");

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {HIGHLIGHT_KEYS.map((highlight) => (
            <div
              key={highlight.key}
              className="rounded-xl border border-foreground-800/20 bg-background-900/40 p-6"
            >
              <div className="mb-4 inline-flex items-center justify-center rounded-lg bg-accent-500/10 p-2.5">
                <Icon
                  name={highlight.icon}
                  className="text-xl text-accent-400"
                />
              </div>
              <h3 className="font-heading text-base font-semibold text-foreground-100">
                {t(`highlights.${highlight.key}.title`)}
              </h3>
              <p className="mt-2 text-sm text-foreground-400">
                {t(`highlights.${highlight.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
