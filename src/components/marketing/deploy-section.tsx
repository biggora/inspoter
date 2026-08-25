import { getTranslations } from "next-intl/server";
import { Icon } from "@/components/ui/icon";
import { TerminalWindow } from "./terminal-window";

const STEP_KEYS = [
  { key: "clone", icon: "ri-git-repository-line" },
  { key: "configure", icon: "ri-settings-3-line" },
  { key: "run", icon: "ri-play-circle-line" },
] as const;

export async function DeploySection() {
  const t = await getTranslations("marketing");

  return (
    <section className="px-6 py-24" id="deploy">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-heading text-3xl font-bold text-foreground-50 sm:text-4xl">
          {t("deploy.title")}
        </h2>
        <p className="mt-4 text-lg text-foreground-400">
          {t("deploy.subtitle")}
        </p>

        <div className="mx-auto mt-12 max-w-2xl text-left">
          <TerminalWindow title="~/inspoter">
            <div className="space-y-1.5">
              <p>
                <span className="text-foreground-500">
                  {t("deploy.comments.clone")}
                </span>
              </p>
              <p>
                <span className="text-accent-400">$</span> git clone
                https://github.com/biggora/inspoter.git
              </p>
              <p className="pt-2">
                <span className="text-foreground-500">
                  {t("deploy.comments.configure")}
                </span>
              </p>
              <p>
                <span className="text-accent-400">$</span> cp .env.example .env
              </p>
              <p className="pt-2">
                <span className="text-foreground-500">
                  {t("deploy.comments.start")}
                </span>
              </p>
              <p>
                <span className="text-accent-400">$</span> docker compose up -d
              </p>
            </div>
          </TerminalWindow>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEP_KEYS.map((step) => (
            <div key={step.key} className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10">
                <Icon name={step.icon} className="text-xl text-primary-400" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground-100">
                {t(`deploy.steps.${step.key}.title`)}
              </h3>
              <p className="text-sm text-foreground-400">
                {t(`deploy.steps.${step.key}.description`)}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
