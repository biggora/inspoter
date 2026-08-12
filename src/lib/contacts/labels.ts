// The label vocabulary shared by every format. Each importer maps its own
// spelling onto these canonical values, and each exporter maps back, so a
// contact that arrives as an Outlook "Business Phone" leaves as a vCard
// `TEL;TYPE=WORK` without either side knowing about the other.
//
// Anything outside this list is kept verbatim: a label the source invented is
// data, not an error.

export const CONTACT_LABELS = [
  "home",
  "work",
  "mobile",
  "main",
  "fax",
  "workFax",
  "homeFax",
  "pager",
  "other",
] as const;

export type ContactLabelToken = (typeof CONTACT_LABELS)[number];

const KNOWN_LABELS: ReadonlySet<string> = new Set(CONTACT_LABELS);

export function isKnownLabel(value: string): value is ContactLabelToken {
  return KNOWN_LABELS.has(value);
}

// TYPE values that describe the transport rather than the contact's intent —
// they say nothing an operator wants to read on a card.
const NOISE_TYPES: ReadonlySet<string> = new Set([
  "INTERNET",
  "PREF",
  "VOICE",
  "X400",
  "PARCEL",
  "POSTAL",
  "DOM",
  "INTL",
  "TEXT",
  "TEXTPHONE",
  "VIDEO",
]);

function meaningfulTypes(types: readonly string[]): string[] {
  return types
    .map((type) => type.trim().toUpperCase())
    .filter((type) => type.length > 0 && !NOISE_TYPES.has(type));
}

/** vCard TEL TYPE values → a canonical phone label. */
export function phoneLabelFromTypes(types: readonly string[]): string | null {
  const upper = meaningfulTypes(types);
  const has = (type: string) => upper.includes(type);

  if (has("FAX")) {
    if (has("WORK")) return "workFax";
    if (has("HOME")) return "homeFax";
    return "fax";
  }
  if (has("CELL") || has("MOBILE")) return "mobile";
  if (has("PAGER")) return "pager";
  if (has("MAIN")) return "main";
  if (has("WORK")) return "work";
  if (has("HOME")) return "home";
  if (has("OTHER")) return "other";
  return upper[0]?.toLowerCase() ?? null;
}

/** vCard EMAIL/URL/ADR TYPE values → a canonical label. */
export function simpleLabelFromTypes(types: readonly string[]): string | null {
  const upper = meaningfulTypes(types);
  if (upper.includes("WORK")) return "work";
  if (upper.includes("HOME")) return "home";
  if (upper.includes("OTHER")) return "other";
  return upper[0]?.toLowerCase() ?? null;
}

/** Canonical label → the vCard TYPE values that express it. */
export function typesFromLabel(label: string | null): string[] {
  switch (label) {
    case null:
      return [];
    case "mobile":
      return ["CELL"];
    case "workFax":
      return ["WORK", "FAX"];
    case "homeFax":
      return ["HOME", "FAX"];
    case "fax":
      return ["FAX"];
    case "pager":
      return ["PAGER"];
    case "main":
      return ["MAIN"];
    case "home":
    case "work":
    case "other":
      return [label.toUpperCase()];
    default:
      // A custom label still round-trips as a TYPE; readers that do not know
      // it show it verbatim, which is what we want.
      return [label.toUpperCase()];
  }
}
