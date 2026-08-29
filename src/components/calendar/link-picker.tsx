"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import type { CalendarLinkInput } from "@/lib/calendar/types";
import type { CalendarLinkTargetOption } from "@/lib/services/calendar-link-targets";
import { calendarApi } from "./api";

export function LinkPicker({
  value,
  onChange,
}: {
  value: CalendarLinkInput[];
  onChange: (value: CalendarLinkInput[]) => void;
}) {
  const t = useTranslations("calendar");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CalendarLinkTargetOption[]>([]);

  useEffect(() => {
    if (!query.trim()) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      void calendarApi
        .linkTargets(query)
        .then((items) => {
          if (!cancelled) setResults(items.items);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function add(option: CalendarLinkTargetOption) {
    if (
      value.some(
        (item) =>
          item.targetType === option.type && item.targetId === option.id,
      )
    )
      return;
    onChange([
      ...value,
      {
        targetType: option.type,
        targetId: option.id,
        targetLabel: option.label,
        targetHref: option.href,
        targetContext: option.context,
      },
    ]);
    setQuery("");
    setResults([]);
  }

  function addExternalUrl() {
    try {
      const url = new URL(query);
      if (url.protocol !== "http:" && url.protocol !== "https:") return;
      add({
        type: "EXTERNAL_URL",
        id: url.toString(),
        label: url.hostname,
        href: url.toString(),
      });
    } catch {
      // Keep the text so the operator can correct it.
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex gap-2">
        <Input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            if (!event.target.value.trim()) setResults([]);
          }}
          placeholder={t("linksSearchPlaceholder")}
        />
        <Button
          type="button"
          variant="outline"
          onClick={addExternalUrl}
          disabled={!/^https?:\/\//i.test(query)}
        >
          <Icon name="ri-links-line" aria-hidden />
          <span className="sr-only sm:not-sr-only">{t("externalUrl")}</span>
        </Button>
      </div>
      {results.length > 0 && (
        <div className="max-h-40 overflow-y-auto rounded-lg border bg-popover p-1 shadow-sm">
          {results.map((option) => (
            <Button
              key={`${option.type}:${option.id}`}
              type="button"
              variant="ghost"
              className="h-auto w-full justify-start px-2 py-1.5 text-left"
              onClick={() => add(option)}
            >
              <span className="min-w-0 truncate">{option.label}</span>
              <span className="ms-auto shrink-0 text-2xs text-muted-foreground">
                {option.type.replaceAll("_", " ")}
              </span>
            </Button>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {value.map((link, index) => (
            <li
              key={`${link.targetType}:${link.targetId}`}
              className="inline-flex items-center gap-1 rounded-full border bg-muted px-2 py-1 text-xs"
            >
              <span className="max-w-48 truncate">{link.targetLabel}</span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost"
                aria-label={`${t("delete")}: ${link.targetLabel}`}
                onClick={() =>
                  onChange(value.filter((_, itemIndex) => itemIndex !== index))
                }
              >
                <Icon name="ri-close-line" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
