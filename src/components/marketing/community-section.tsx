import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";

const TECH_STACK = [
  "Next.js 16",
  "React 19",
  "TypeScript",
  "Prisma",
  "PostgreSQL",
  "Tailwind CSS",
  "Docker",
];

export async function CommunitySection() {
  const t = await getTranslations("marketing");

  return (
    <section className="px-6 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <span className="text-sm font-medium uppercase tracking-wider text-accent-400">
          {t("community.tag")}
        </span>
        <h2 className="mt-4 font-heading text-3xl font-bold text-foreground-50 sm:text-4xl">
          {t("community.title")}
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-foreground-400">
          {t("community.description")}
        </p>

        <div className="mt-10">
          <Link
            href="https://github.com/biggora/inspoter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 items-center gap-3 rounded-lg border border-foreground-700/50 bg-background-900/50 px-8 text-base font-medium text-foreground-200 transition-colors hover:border-foreground-600 hover:bg-background-800"
          >
            <Icon name="ri-github-fill" className="text-xl" />
            {t("community.starOnGithub")}
          </Link>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
          {TECH_STACK.map((tech) => (
            <span
              key={tech}
              className="rounded-full border border-foreground-800/30 bg-background-900/60 px-4 py-1.5 text-xs font-medium text-foreground-400"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
