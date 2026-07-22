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
