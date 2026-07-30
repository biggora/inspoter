"use client";

import { useTranslations } from "next-intl";

import type { NoteConfig } from "@/lib/validation/dashboards";

// Plain text, rendered with line breaks preserved. Deliberately not rich text:
// the note holds a duty roster or a phone number, and the only rich-text editor
// in the project is bound to the mail composer's vocabulary
// (src/components/mail/rich-text-editor.tsx). Plain text also means nothing here
// can inject markup.

export function NoteWidget({ config }: { config: NoteConfig }) {
  const t = useTranslations("dashboards");
  const text = config.text.trim();

  if (!text) {
    return <p className="text-xs text-muted-foreground">{t("note.empty")}</p>;
  }

  return (
    <p className="whitespace-pre-wrap break-words text-sm text-foreground-800">
      {text}
    </p>
  );
}
