"use client";

import { useId, useState } from "react";

import { FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DEFAULT_LABEL_CUSTOM_COLOR,
  isLabelHexColor,
  isLabelPresetColor,
  LABEL_PRESET_COLORS,
  LABEL_PRESET_HEX,
  normalizeLabelHexColor,
  type LabelColor,
  type LabelHexColor,
  type LabelPresetColor,
} from "@/lib/label-color";
import { cn } from "@/lib/utils";

// Copy is passed in rather than read from a translation namespace so both the
// mail and the services label managers can share one implementation.
export interface LabelColorFieldCopy {
  groupLabel: string;
  presetColorName: (color: LabelPresetColor) => string;
  customTitle: string;
  customPickerLabel: string;
  customHexLabel: string;
  customDescription: string;
  invalidColor: string;
}

export interface LabelColorFieldProps {
  value: LabelColor;
  onChange: (color: LabelColor) => void;
  onValidityChange?: (valid: boolean) => void;
  disabled?: boolean;
  copy: LabelColorFieldCopy;
}

export function LabelColorField({
  value,
  onChange,
  onValidityChange,
  disabled = false,
  copy,
}: LabelColorFieldProps) {
  const groupId = useId();
  const hexInputId = useId();
  const [customSelected, setCustomSelected] = useState(
    !isLabelPresetColor(value),
  );
  const [hexDraft, setHexDraft] = useState<string>(
    isLabelHexColor(value) ? value : DEFAULT_LABEL_CUSTOM_COLOR,
  );
  const hexValid = isLabelHexColor(hexDraft);

  function selectPreset(color: LabelPresetColor) {
    setCustomSelected(false);
    onValidityChange?.(true);
    onChange(color);
  }

  function selectCustomColor(color: string) {
    const normalized = normalizeLabelHexColor(color);
    setCustomSelected(true);
    setHexDraft(normalized);
    const valid = isLabelHexColor(normalized);
    onValidityChange?.(valid);
    if (valid) onChange(normalized as LabelHexColor);
  }

  const pickerValue = hexValid ? hexDraft : DEFAULT_LABEL_CUSTOM_COLOR;

  return (
    <div className="space-y-3">
      <span id={groupId} className="text-sm font-medium text-foreground">
        {copy.groupLabel}
      </span>
      <ToggleGroup
        value={customSelected ? [] : [value]}
        onValueChange={(values) => {
          const nextColor = values[0];
          if (nextColor && isLabelPresetColor(nextColor)) {
            selectPreset(nextColor);
          }
        }}
        aria-labelledby={groupId}
        loopFocus
        className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3"
      >
        {LABEL_PRESET_COLORS.map((color) => (
          <ToggleGroupItem
            key={color}
            value={color}
            variant="outline"
            disabled={disabled}
            aria-label={copy.presetColorName(color)}
            className="h-9 w-full justify-start gap-2 px-2"
          >
            <span
              aria-hidden
              className="size-3 rounded-full ring-1 ring-foreground/15"
              style={{ backgroundColor: LABEL_PRESET_HEX[color] }}
            />
            <span>{copy.presetColorName(color)}</span>
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
          {copy.customTitle}
        </p>
        <div className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-2">
          <Input
            type="color"
            value={pickerValue}
            onChange={(event) => selectCustomColor(event.target.value)}
            disabled={disabled}
            aria-label={copy.customPickerLabel}
            className="cursor-pointer p-1"
          />
          <div>
            <FieldLabel htmlFor={hexInputId} className="sr-only">
              {copy.customHexLabel}
            </FieldLabel>
            <Input
              id={hexInputId}
              value={hexDraft}
              onChange={(event) => selectCustomColor(event.target.value)}
              onFocus={() => selectCustomColor(hexDraft)}
              disabled={disabled}
              maxLength={7}
              placeholder={DEFAULT_LABEL_CUSTOM_COLOR}
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
          {copy.customDescription}
        </p>
        <FieldError>
          {customSelected && !hexValid ? copy.invalidColor : null}
        </FieldError>
      </div>
    </div>
  );
}
