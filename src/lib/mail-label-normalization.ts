export function normalizeMailLabelDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeMailLabelName(value: string): string {
  return normalizeMailLabelDisplayName(value).toLocaleLowerCase("en-US");
}
