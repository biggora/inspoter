export const LABEL_PRESET_COLORS = [
  "SLATE",
  "RED",
  "AMBER",
  "GREEN",
  "BLUE",
  "VIOLET",
] as const;

export type LabelPresetColor = (typeof LABEL_PRESET_COLORS)[number];
export type LabelHexColor = `#${string}`;
export type LabelColor = LabelPresetColor | LabelHexColor;

// Derived from the Inspot design tokens in src/app/inspot-tokens.css so label
// chips read as one family with the rest of the product: SLATE is the neutral
// foreground ink, RED is --action-primary (the button red), AMBER is the amber
// status hue, GREEN carries the teal accent hue. BLUE and VIOLET have no token
// of their own and sit on the same lightness/chroma band as GREEN.
export const LABEL_PRESET_HEX: Record<LabelPresetColor, LabelHexColor> = {
  SLATE: "#616367",
  RED: "#D33C2C",
  AMBER: "#F49F1E",
  GREEN: "#1F9B82",
  BLUE: "#488ACB",
  VIOLET: "#9A6EC9",
};

export const DEFAULT_LABEL_CUSTOM_COLOR: LabelHexColor = "#616367";

const LABEL_HEX_PATTERN = /^#[0-9A-F]{6}$/;

export function isLabelPresetColor(value: string): value is LabelPresetColor {
  return LABEL_PRESET_COLORS.some((preset) => preset === value);
}

export function isLabelHexColor(value: string): value is LabelHexColor {
  return LABEL_HEX_PATTERN.test(value.toUpperCase());
}

export function isLabelColor(value: string): value is LabelColor {
  return isLabelPresetColor(value) || isLabelHexColor(value);
}

export function parseLabelColor(value: string): LabelColor {
  const normalized = normalizeLabelHexColor(value);
  if (isLabelColor(normalized)) return normalized;
  throw new Error(`Invalid stored label color: ${value}`);
}

export function normalizeLabelHexColor(value: string): string {
  return value.trim().toUpperCase();
}

export function labelColorToHex(color: LabelColor): LabelHexColor {
  return isLabelPresetColor(color)
    ? LABEL_PRESET_HEX[color]
    : (normalizeLabelHexColor(color) as LabelHexColor);
}

export function readableLabelTextColor(
  color: LabelColor,
): "#000000" | "#FFFFFF" {
  const hexColor = labelColorToHex(color);
  const channels = [1, 3, 5].map((offset) => {
    const channel =
      Number.parseInt(hexColor.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance =
    channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  return luminance > 0.179 ? "#000000" : "#FFFFFF";
}
