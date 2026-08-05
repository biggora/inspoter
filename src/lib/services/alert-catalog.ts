import { createTranslator } from "next-intl";
import { enMessages } from "@/i18n/messages";

// The vocabulary Inspoter's own alert producers speak: which categories they
// file into, and which message templates they raise. Everything here is keyed
// rather than spelled out at the call site, so one alert has exactly one
// wording per locale and the stored English text can never drift from what the
// UI renders.

export const SYSTEM_ALERT_CATEGORY_KEYS = [
  "mail",
  "servers",
  "services",
  "hosting",
  "dns",
] as const;

export type SystemAlertCategoryKey =
  (typeof SYSTEM_ALERT_CATEGORY_KEYS)[number];

/**
 * English base name each system category is stored under. The UI renders
 * `alerts.system.category*` instead whenever `AlertCategory.systemKey` is set —
 * these values exist so the row is still readable straight from the database,
 * a backup archive, or the MCP tools.
 */
export const SYSTEM_ALERT_CATEGORY_NAMES: Record<
  SystemAlertCategoryKey,
  string
> = {
  mail: "Mail",
  servers: "Servers",
  services: "Services",
  hosting: "Hosting",
  dns: "DNS",
};

/** `alerts.system.category*` message key for a system category. */
export const SYSTEM_ALERT_CATEGORY_MESSAGE_KEYS: Record<
  SystemAlertCategoryKey,
  string
> = {
  mail: "system.categoryMail",
  servers: "system.categoryServers",
  services: "system.categoryServices",
  hosting: "system.categoryHosting",
  dns: "system.categoryDns",
};

export type SystemAlertMessageKey =
  | "system.providerError"
  | "system.providerRecovered"
  | "system.mailSyncError"
  | "system.mailSyncRecovered"
  | "system.metricsStale"
  | "system.metricsRecovered"
  | "system.serviceDown"
  | "system.serviceUp"
  | "system.serverMetricsError";

export type SystemAlertMessageParams = Record<string, string | number>;

// Same ICU templates the client resolves, evaluated against the base locale.
// Building the translator once at module scope is safe: it closes over static
// message JSON and holds no request state.
const translateBase = createTranslator({
  locale: "en",
  messages: enMessages,
  namespace: "alerts",
});

/**
 * Renders the English text stored in `Alert.message`. Keeping this on the same
 * template as the client render is the point: a producer cannot ship a stored
 * sentence that says something different from what an operator reads.
 */
export function renderSystemAlertMessage(
  key: SystemAlertMessageKey,
  params?: SystemAlertMessageParams,
): string {
  return translateBase(key, params);
}
