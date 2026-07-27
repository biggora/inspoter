// Shared with service labels — see @/lib/label-normalization. This module
// stays as the Mail-facing alias.

import {
  normalizeLabelDisplayName,
  normalizeLabelName,
} from "@/lib/label-normalization";

export const normalizeMailLabelDisplayName = normalizeLabelDisplayName;
export const normalizeMailLabelName = normalizeLabelName;
