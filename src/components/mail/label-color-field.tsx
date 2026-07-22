"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";

import { FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_MAIL_LABEL_CUSTOM_COLOR,
  isMailLabelHexColor,
  isMailLabelPresetColor,
  MAIL_LABEL_PRESET_HEX,
  MAIL_LABEL_PRESET_COLORS,
  normalizeMailLabelHexColor,
  type MailLabelColor,
  type MailLabelHexColor,
  type MailLabelPresetColor,
} from "@/lib/mail-label-color";
import { cn } from "@/lib/utils";

export interface LabelColorFieldProps {
  value: MailLabelColor;
  onChange: (color: MailLabelColor) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
}

export function LabelColorField({
  value,
  onChange,
  onValidityChange,
  disabled = false,
}: LabelColorFieldProps) {
  const t = useTranslations("mail");
  const groupId = useId();
  const hexInputId = useId();
  const [customSelected, setCustomSelected] = useState(
    !isMailLabelPresetColor(value),
  );
  const [hexDraft, setHexDraft] = useState<string>(
    isMailLabelHexColor(value) ? value : DEFAULT_MAIL_LABEL_CUSTOM_COLOR,
  );
  const hexValid = isMailLabelHexColor(hexDraft);

  function selectPreset(color: MailLabelPresetColor) {
    setCustomSelected(false);
    onValidityChange?.(true);
    onChange(color);
  }

  function selectCustomColor(color: string) {
    const normalized = normalizeMailLabelHexColor(color);
    setCustomSelected(true);
    setHexDraft(normalized);
    const valid = isMailLabelHexColor(normalized);
    onValidityChange?.(valid);
    if (valid) onChange(normalized as MailLabelHexColor);
  }

  const pickerValue = hexValid ? hexDraft : DEFAULT_MAIL_LABEL_CUSTOM_COLOR;

  return (
    <div className="space-y-3">
      <span id={groupId} className="text-sm font-medium text-foreground">
        {t("newLabelColorLabel")}
      </span>
      <ToggleGroup
        value={customSelected ? [] : [value]}
        onValueChange={(values) => {
          const nextColor = values[0];
          if (nextColor && isMailLabelPresetColor(nextColor)) {
            selectPreset(nextColor);
          }
        }}
        aria-labelledby={groupId}
        loopFocus
        className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {MAIL_LABEL_PRESET_COLORS.map((color) => (
          <ToggleGroupItem
            key={color}
            value={color}
            variant="outline"
            disabled={disabled}
            aria-label={t(`labelColor${color}`)}
            className="h-9 w-full justify-start gap-2 px-2"
          >
            <span
              aria-hidden
              className="size-3 rounded-full ring-1 ring-foreground/15"
              style={{ backgroundColor: MAIL_LABEL_PRESET_HEX[color] }}
            />
            <span>{t(`labelColor${color}`)}</span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div
        className={cn(
          "rounded-lg border p-3 transition-colors",
          customSelected
            ? "border-[var(--focus-ring)] bg-[var(--surface-sunken)]"
            : "border-background-200",
        )}
      >
        <p className="mb-2 text-sm font-medium text-foreground">
          {t("labelCustomColorLabel")}
        </p>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
          <Input
            type="color"
            value={pickerValue}
            onChange={(event) => selectCustomColor(event.target.value)}
            disabled={disabled}
            aria-label={t("labelCustomColorPickerLabel")}
            className="cursor-pointer p-1"
          />
          <div>
            <FieldLabel htmlFor={hexInputId} className="sr-only">
              {t("labelCustomColorHexLabel")}
            </FieldLabel>
            <Input
              id={hexInputId}
              value={hexDraft}
              onChange={(event) => selectCustomColor(event.target.value)}
              onFocus={() => selectCustomColor(hexDraft)}
              disabled={disabled}
              maxLength={7}
              placeholder="#64748B"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={customSelected && !hexValid}
              aria-describedby={`${hexInputId}-description`}
              className="font-mono uppercase"
            />
          </div>
        </div>
        <p
          id={`${hexInputId}-description`}
          className="mt-2 text-xs text-muted-foreground"
        >
          {t("labelCustomColorDescription")}
        </p>
        <FieldError>
          {customSelected && !hexValid
            ? t("validationLabelColorInvalid")
            : null}
        </FieldError>
      </div>
    </div>
  );
}
