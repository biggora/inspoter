"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

// First keyboard stop in the dashboard shell (critique 2026-08-29, P1):
// hidden until focused, then jumps focus past the sidebar nav and topbar
// straight into <main>. next-intl's Link intercepts the hash navigation, so
// the focus move is done explicitly here — a plain href="#…" would only
// scroll.
export function SkipToContentLink({ targetId }: { targetId: string }) {
  const t = useTranslations("shell");

  function activate(event: React.MouseEvent<HTMLAnchorElement>) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    const target = document.getElementById(targetId);
    target?.focus();
    target?.scrollIntoView();
    window.history.replaceState(null, "", `#${targetId}`);
  }

  return (
    <Link
      href={`#${targetId}`}
      onClick={activate}
      className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:border focus:border-[var(--border-strong)] focus:bg-[var(--surface-card)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg focus:outline-solid focus:outline-2 focus:outline-[var(--focus-ring)]"
    >
      {t("skipToContent")}
    </Link>
  );
}
