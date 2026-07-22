export const MAIL_LABEL_PRESET_COLORS = [
  "SLATE",
  "RED",
  "AMBER",
  "GREEN",
  "BLUE",
  "VIOLET",
] as const;

export type MailLabelPresetColor = (typeof MAIL_LABEL_PRESET_COLORS)[number];
export type MailLabelHexColor = `#${string}`;
export type MailLabelColor = MailLabelPresetColor | MailLabelHexColor;

export const MAIL_LABEL_PRESET_HEX: Record<
  MailLabelPresetColor,
  MailLabelHexColor
> = {
  SLATE: "#64748B",
  RED: "#EF4444",
  AMBER: "#F59E0B",
  GREEN: "#22C55E",
  BLUE: "#3B82F6",
  VIOLET: "#8B5CF6",
};

export const DEFAULT_MAIL_LABEL_CUSTOM_COLOR: MailLabelHexColor = "#64748B";

const MAIL_LABEL_HEX_PATTERN = /^#[0-9A-F]{6}$/;

export function isMailLabelPresetColor(
  value: string,
): value is MailLabelPresetColor {
  return MAIL_LABEL_PRESET_COLORS.some((preset) => preset === value);
}

export function isMailLabelHexColor(value: string): value is MailLabelHexColor {
  return MAIL_LABEL_HEX_PATTERN.test(value.toUpperCase());
}

export function isMailLabelColor(value: string): value is MailLabelColor {
  return isMailLabelPresetColor(value) || isMailLabelHexColor(value);
}

export function parseMailLabelColor(value: string): MailLabelColor {
  const normalized = normalizeMailLabelHexColor(value);
  if (isMailLabelColor(normalized)) return normalized;
  throw new Error(`Invalid stored mail label color: ${value}`);
}

export function normalizeMailLabelHexColor(value: string): string {
  return value.trim().toUpperCase();
}

export function mailLabelColorToHex(color: MailLabelColor): MailLabelHexColor {
  return isMailLabelPresetColor(color)
    ? MAIL_LABEL_PRESET_HEX[color]
    : (normalizeMailLabelHexColor(color) as MailLabelHexColor);
}

export function readableMailLabelTextColor(
  color: MailLabelColor,
): "#000000" | "#FFFFFF" {
  const hexColor = mailLabelColorToHex(color);
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
