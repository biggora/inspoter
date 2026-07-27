"use client";

import { useTranslations } from "next-intl";

import {
  LabelColorField as SharedLabelColorField,
  type LabelColorFieldProps as SharedLabelColorFieldProps,
} from "@/components/ui/label-color-field";

export type LabelColorFieldProps = Omit<SharedLabelColorFieldProps, "copy">;

// Mail-facing adapter over the shared field (@/components/ui/label-color-field):
// it only supplies the "mail" namespace copy, keeping the props the mail
// dialogs already pass unchanged.
export function LabelColorField(props: LabelColorFieldProps) {
  const t = useTranslations("mail");

  return (
    <SharedLabelColorField
      {...props}
      copy={{
        groupLabel: t("newLabelColorLabel"),
        presetColorName: (color) => t(`labelColor${color}`),
        customTitle: t("labelCustomColorLabel"),
        customPickerLabel: t("labelCustomColorPickerLabel"),
        customHexLabel: t("labelCustomColorHexLabel"),
        customDescription: t("labelCustomColorDescription"),
        invalidColor: t("validationLabelColorInvalid"),
      }}
    />
  );
}
