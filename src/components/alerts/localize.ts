import type { AlertCategoryDto, AlertDto } from "./api";

// Rendering rules for the two alert fields that are stored in the database but
// still belong to Inspoter rather than to a sender: a system category's name
// and a system alert's message. Both are persisted in the base language
// (English) and carry a key alongside, which is what lets the same row read
// correctly in either locale. Shared by the Alerts list, its dialogs and the
// dashboard widget so all four agree on what an alert says.

/** `t` from `useTranslations("alerts")`, narrowed to what this module needs. */
export interface AlertsTranslator {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

const SYSTEM_CATEGORY_MESSAGE_KEYS: Record<string, string> = {
  mail: "system.categoryMail",
  servers: "system.categoryServers",
  services: "system.categoryServices",
  hosting: "system.categoryHosting",
  dns: "system.categoryDns",
};

/**
 * A category's display name. `systemKey` is null for everything an operator or
 * a webhook sender named, and those names are shown exactly as typed.
 */
export function categoryLabel(
  category: Pick<AlertCategoryDto, "name" | "systemKey">,
  t: AlertsTranslator,
): string {
  const key = category.systemKey
    ? SYSTEM_CATEGORY_MESSAGE_KEYS[category.systemKey]
    : undefined;
  return key && t.has(key) ? t(key) : category.name;
}

/**
 * An alert's message. Falls back to the stored English text whenever the key
 * is absent (webhook alerts) or unknown — a producer removed in a later
 * release must not turn its historical alerts into raw key paths.
 */
export function alertMessage(
  alert: Pick<AlertDto, "message" | "messageKey" | "messageParams">,
  t: AlertsTranslator,
): string {
  if (!alert.messageKey || !t.has(alert.messageKey)) return alert.message;
  return t(alert.messageKey, alert.messageParams ?? undefined);
}
