"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { routing } from "@/i18n/routing";
import { usePathname, useRouter } from "@/i18n/navigation";

// Native language names are conventionally NOT translated — every locale
// shows "English"/"Русский" the same way regardless of which is currently
// active (design.md-equivalent convention for language switchers). Extend
// this map whenever routing.ts grows a new locale.
const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  ru: "Русский",
};

// Top-bar language switcher (sibling of ThemeToggle/OperatorMenu in
// dashboard-topbar.tsx's control row). Mirrors OperatorMenu's dropdown
// composition but uses the icon-only trigger pattern already established by
// bookmark-card.tsx (DropdownMenuTrigger's `render` prop wrapping a styled
// Button) so it lines up with ThemeToggle's `variant="ghost" size="icon-sm"`
// sizing right next to it.
export function LanguageSwitcher() {
  const t = useTranslations("shell");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  function handleSelect(nextLocale: string) {
    if (nextLocale === locale) return;
    startTransition(() => {
      router.replace(pathname, { locale: nextLocale });
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" />}
        aria-label={t("languageSwitcherLabel")}
        disabled={isPending}
      >
        <Icon name="ri-translate-2" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuGroup>
          {routing.locales.map((code) => (
            <DropdownMenuItem
              key={code}
              disabled={isPending}
              onClick={() => handleSelect(code)}
            >
              <span className="min-w-0 flex-1 truncate">
                {LOCALE_LABELS[code] ?? code}
              </span>
              {code === locale && <Icon name="ri-check-line" aria-hidden />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
