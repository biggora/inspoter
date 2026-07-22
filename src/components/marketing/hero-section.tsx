import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { TerminalWindow } from "./terminal-window";

export function HeroSection() {
  return (
    <section className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-24">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 60% 50% at 50% 40%, oklch(0.579 0.19 30 / 0.15), transparent)",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto max-w-4xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-foreground-800/30 bg-background-900/80 px-4 py-1.5 text-xs text-foreground-400">
          <Icon name="ri-open-source-line" className="text-primary-400" />
          <span>Open Source Infrastructure Dashboard</span>
        </div>

        <h1 className="font-heading text-5xl font-extrabold tracking-tight text-foreground-50 sm:text-6xl lg:text-7xl">
          Your Infrastructure.{" "}
          <span className="text-primary-400">One Dashboard.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-foreground-400 sm:text-xl">
          Self-hosted command center for domains, servers, hosting, uptime
          monitoring, email, and more. Open source and free forever.
        </p>

        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link
            href="#deploy"
            className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary-500 px-6 font-medium text-foreground-50 transition-colors hover:bg-primary-400"
          >
            <Icon name="ri-rocket-line" />
            Get Started
          </Link>
          <Link
            href="https://github.com/biggora/inspoter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-2 rounded-lg border border-foreground-700/50 bg-background-900/50 px-6 font-medium text-foreground-200 transition-colors hover:border-foreground-600 hover:bg-background-800"
          >
            <Icon name="ri-github-fill" />
            View on GitHub
          </Link>
        </div>

        <div className="mx-auto mt-16 max-w-2xl">
          <TerminalWindow title="~">
            <div className="space-y-2">
              <p>
                <span className="text-accent-400">$</span> git clone
                https://github.com/biggora/inspoter.git
              </p>
              <p>
                <span className="text-accent-400">$</span> cd inspoter
              </p>
              <p>
                <span className="text-accent-400">$</span> docker compose up -d
              </p>
              <p className="mt-3 text-accent-400">
                ✓ Inspoter is running at http://localhost:3000
              </p>
            </div>
          </TerminalWindow>
        </div>
      </div>
    </section>
  );
}
