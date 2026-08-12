import { CONTACT_LABELS, isKnownLabel } from "@/lib/contacts/labels";
import { CONTACT_FIELD_KINDS } from "@/lib/contacts/model";

// Presentation vocabulary shared by the table, the detail page and the form.
// The canonical label tokens have translations; anything else came from an
// imported file and is shown exactly as it arrived.

export { CONTACT_FIELD_KINDS, CONTACT_LABELS };

/** i18n key for a canonical label token, or null when it has no translation. */
export function labelMessageKey(label: string | null): string | null {
  if (label === null || !isKnownLabel(label)) return null;
  return `label${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

/** The label tokens offered for each field kind, in the order Google uses. */
export const LABEL_OPTIONS_BY_KIND: Record<string, readonly string[]> = {
  EMAIL: ["home", "work", "other"],
  PHONE: [
    "mobile",
    "home",
    "work",
    "main",
    "workFax",
    "homeFax",
    "pager",
    "other",
  ],
  URL: ["home", "work", "other"],
  IM: [],
  EVENT: [],
  RELATION: [],
  CUSTOM: [],
};

/** Input type that makes a browser offer the right keyboard for a kind. */
export function inputTypeForKind(kind: string): string {
  if (kind === "EMAIL") return "email";
  if (kind === "PHONE") return "tel";
  if (kind === "URL") return "url";
  return "text";
}
