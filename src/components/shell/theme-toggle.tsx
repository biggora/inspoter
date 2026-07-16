"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

const subscribeNoop = () => () => {};

// design.md §4.2 top-bar theme switcher (activated per v2.2 — see Changelog).
// Renders only after mount: `resolvedTheme` is undefined on the server, so
// rendering a fixed icon before hydration would flash the wrong glyph.
// useSyncExternalStore (server snapshot false, client snapshot true) detects
// the client render without a setState-in-effect.
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();

  if (!mounted) {
    return <Button type="button" variant="ghost" size="icon-sm" disabled />;
  }

  const isDark = resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={isDark ? "Включить светлую тему" : "Включить тёмную тему"}
      onClick={() => setTheme(isDark ? "light" : "dark")}
    >
      {isDark ? (
        <Sun aria-hidden className="size-4" />
      ) : (
        <Moon aria-hidden className="size-4" />
      )}
    </Button>
  );
}
