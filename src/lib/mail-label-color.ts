// The palette and contrast helpers moved to @/lib/label-color when service
// labels started sharing them. This module stays as the Mail-facing alias so
// the mail feature keeps its own vocabulary.

import {
  DEFAULT_LABEL_CUSTOM_COLOR,
  isLabelColor,
  isLabelHexColor,
  isLabelPresetColor,
  LABEL_PRESET_COLORS,
  LABEL_PRESET_HEX,
  labelColorToHex,
  normalizeLabelHexColor,
  parseLabelColor,
  readableLabelTextColor,
  type LabelColor,
  type LabelHexColor,
  type LabelPresetColor,
} from "@/lib/label-color";

export type MailLabelPresetColor = LabelPresetColor;
export type MailLabelHexColor = LabelHexColor;
export type MailLabelColor = LabelColor;

export const MAIL_LABEL_PRESET_COLORS = LABEL_PRESET_COLORS;
export const MAIL_LABEL_PRESET_HEX = LABEL_PRESET_HEX;
export const DEFAULT_MAIL_LABEL_CUSTOM_COLOR = DEFAULT_LABEL_CUSTOM_COLOR;

export const isMailLabelPresetColor = isLabelPresetColor;
export const isMailLabelHexColor = isLabelHexColor;
export const isMailLabelColor = isLabelColor;
export const parseMailLabelColor = parseLabelColor;
export const normalizeMailLabelHexColor = normalizeLabelHexColor;
export const mailLabelColorToHex = labelColorToHex;
export const readableMailLabelTextColor = readableLabelTextColor;
