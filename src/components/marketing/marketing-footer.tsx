import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { InspoterIcon } from "@/components/ui/inspoter-logo";

export function MarketingFooter() {
  return (
    <footer className="border-t border-foreground-800/20 px-6 py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <div className="flex items-center gap-2">
          <InspoterIcon aria-hidden className="size-7 shrink-0" />
          <span className="font-heading text-lg font-bold">
            <span className="text-foreground-100">In</span>
            <span className="text-[#e60000]">Spoter</span>
          </span>
          <span className="text-xs text-foreground-500">
            Infrastructure Dashboard
          </span>
        </div>

        <div className="flex items-center gap-6 text-sm text-foreground-400">
          <Link
            href="https://github.com/biggora/inspoter"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground-200"
          >
            <Icon name="ri-github-fill" />
            GitHub
          </Link>
          <Link
            href="/login"
            className="transition-colors hover:text-foreground-200"
          >
            Log In
          </Link>
        </div>
      </div>
    </footer>
  );
}
