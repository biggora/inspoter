import { Icon } from "@/components/ui/icon";
import { TerminalWindow } from "./terminal-window";

const STEPS = [
  {
    icon: "ri-git-repository-line",
    title: "Clone",
    description: "Pull the repository to your server",
  },
  {
    icon: "ri-settings-3-line",
    title: "Configure",
    description: "Set your database URL and secrets in .env",
  },
  {
    icon: "ri-play-circle-line",
    title: "Deploy",
    description: "Docker Compose brings everything up",
  },
];

export function DeploySection() {
  return (
    <section className="px-6 py-24" id="deploy">
      <div className="mx-auto max-w-4xl text-center">
        <h2 className="font-heading text-3xl font-bold text-foreground-50 sm:text-4xl">
          Deploy in Minutes
        </h2>
        <p className="mt-4 text-lg text-foreground-400">
          Three commands. That&apos;s it.
        </p>

        <div className="mx-auto mt-12 max-w-2xl text-left">
          <TerminalWindow title="~/inspoter">
            <div className="space-y-1.5">
              <p>
                <span className="text-foreground-500">
                  # Clone the repository
                </span>
              </p>
              <p>
                <span className="text-accent-400">$</span> git clone
                https://github.com/biggora/inspoter.git
              </p>
              <p className="pt-2">
                <span className="text-foreground-500">
                  # Configure environment
                </span>
              </p>
              <p>
                <span className="text-accent-400">$</span> cp .env.example .env
              </p>
              <p className="pt-2">
                <span className="text-foreground-500"># Start everything</span>
              </p>
              <p>
                <span className="text-accent-400">$</span> docker compose up -d
              </p>
            </div>
          </TerminalWindow>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((step) => (
            <div key={step.title} className="flex flex-col items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/10">
                <Icon name={step.icon} className="text-xl text-primary-400" />
              </div>
              <h3 className="font-heading text-lg font-semibold text-foreground-100">
                {step.title}
              </h3>
              <p className="text-sm text-foreground-400">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
