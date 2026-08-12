"use client";

import { useTranslations } from "next-intl";

import type { LabelColorFieldCopy } from "@/components/ui/label-color-field";

// LabelColorField takes its copy as props so mail, services and kanban can
// share one implementation. Both kanban consumers — the column dialog and the
// label manager — need the identical object, so it is built once here.
export function useLabelColorCopy(): LabelColorFieldCopy {
  const t = useTranslations("kanban");

  return {
    groupLabel: t("labelPresetColorLabel"),
    presetColorName: (preset) => t(`labelColor${preset}`),
    customTitle: t("labelCustomColorLabel"),
    customPickerLabel: t("labelCustomColorPickerLabel"),
    customHexLabel: t("labelCustomColorHexLabel"),
    customDescription: t("labelCustomColorDescription"),
    invalidColor: t("labelColorInvalid"),
  };
}
