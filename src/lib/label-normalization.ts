export function normalizeLabelDisplayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

export function normalizeLabelName(value: string): string {
  return normalizeLabelDisplayName(value).toLocaleLowerCase("en-US");
}
