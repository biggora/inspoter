"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import type { AiDraftField } from "./use-ai-draft";

// The sparkle button beside a Description or Instructions label. Same markup
// as the AI draft button in mail's compose-dialog.tsx; all of the state lives
// in useAiDraft, so this stays a presentational component.
//
// type="button" is mandatory: both dialogs wrap their fields in a real
// <form>, where a button without it submits.
//
// The label is visible text rather than an icon with an aria-label, because a
// dialog renders two of these and their accessible names must differ.

interface AiDraftButtonProps {
  field: AiDraftField;
  busy: boolean;
  disabled: boolean;
  /** Shown as a tooltip while the button is disabled for want of a name. */
  hint?: string;
  onClick: () => void;
}

export function AiDraftButton({
  field,
  busy,
  disabled,
  hint,
  onClick,
}: AiDraftButtonProps) {
  const t = useTranslations("agents");

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={disabled || busy}
      title={disabled && !busy ? hint : undefined}
      onClick={onClick}
    >
      {busy ? (
        <Spinner aria-label={t("aiGeneratingLabel")} data-icon="inline-start" />
      ) : (
        <Icon name="ri-sparkling-2-line" aria-hidden data-icon="inline-start" />
      )}
      {t(
        field === "description"
          ? "aiGenerateDescriptionButton"
          : "aiGenerateInstructionsButton",
      )}
    </Button>
  );
}
