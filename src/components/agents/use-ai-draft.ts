"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";

import { ApiError, draftAgentText } from "./api";

// The client half of the authoring assistant. One hook per dialog, shared by
// its two sparkle buttons: the request, the abort, the AI_UNAVAILABLE latch
// and the wording of every failure live here rather than four times over.
//
// Mirrors the helpers in mail-client-view.tsx with one improvement: ApiError
// in ./api carries a real `code` field, so the switch below reads it instead
// of pattern-matching the message the way mail has to.

export type AiDraftKind = "AGENT" | "SKILL";
export type AiDraftField = "description" | "instructions";

export interface AiDraftBrief {
  name: string;
  description: string;
  instructions: string;
}

export interface UseAiDraft {
  /** False once this workspace has answered AI_UNAVAILABLE once. */
  enabled: boolean;
  /** Which field is being drafted, or null. */
  busyField: AiDraftField | null;
  generate: (field: AiDraftField, brief: AiDraftBrief) => Promise<void>;
  /** Drops an in-flight draft. Call it when the dialog closes. */
  cancel: () => void;
}

function errorKey(error: unknown): string {
  const code = error instanceof ApiError ? error.code : undefined;
  switch (code) {
    case "AI_UNAVAILABLE":
      return "errorAiUnavailable";
    case "AI_AUTH":
      return "errorAiAuth";
    case "AI_RATE_LIMIT":
      return "errorAiRateLimit";
    case "AI_TIMEOUT":
      return "errorAiTimeout";
    case "AI_INVALID_RESPONSE":
      return "errorAiInvalidResponse";
    default:
      return "errorAiUpstream";
  }
}

function appliedKey(field: AiDraftField, trimmed: boolean): string {
  if (trimmed) return "aiTrimmedNotice";
  return field === "description"
    ? "aiDescriptionAppliedToast"
    : "aiInstructionsAppliedToast";
}

export function useAiDraft(
  kind: AiDraftKind,
  apply: (field: AiDraftField, text: string) => void,
): UseAiDraft {
  const t = useTranslations("agents");
  const locale = useLocale();
  const [enabled, setEnabled] = useState(true);
  const [busyField, setBusyField] = useState<AiDraftField | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => () => abortRef.current?.abort(), []);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setBusyField(null);
  }

  async function generate(field: AiDraftField, brief: AiDraftBrief) {
    // One draft at a time per dialog: a second click replaces the first.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setBusyField(field);

    try {
      const result = await draftAgentText(
        {
          kind,
          field,
          language: locale,
          name: brief.name.trim(),
          description: brief.description.trim(),
          // Only the instructions button sends the current body; the server
          // drops it anyway when a description is being drafted.
          instructions:
            field === "instructions" ? brief.instructions.trim() : "",
        },
        controller.signal,
      );
      // The operator may have closed the dialog while the model answered.
      if (controller.signal.aborted) return;

      apply(field, result.text);
      toast.success(t(appliedKey(field, result.trimmed)));
    } catch (error) {
      if (controller.signal.aborted) return;
      // No provider is configured: the buttons have nothing to offer, so they
      // go away for the life of this dialog instance.
      if (error instanceof ApiError && error.code === "AI_UNAVAILABLE") {
        setEnabled(false);
      }
      toast.error(t(errorKey(error)));
    } finally {
      if (!controller.signal.aborted) setBusyField(null);
    }
  }

  return { enabled, busyField, generate, cancel };
}
