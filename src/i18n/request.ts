import { hasLocale } from "next-intl";
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";
import { enMessages, ruMessages } from "./messages";

const messagesByLocale = { en: enMessages, ru: ruMessages } as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: messagesByLocale[locale],
    // Explicit global default so every `format.dateTime()` call resolves to a
    // deterministic zone without next-intl's ENVIRONMENT_FALLBACK error (which
    // v4 raises when neither the call site nor a global default supplies one).
    // UTC keeps server/client rendering identical (no hydration mismatches)
    // and matches the UTC-derived timestamp formatting used elsewhere (e.g.
    // src/lib/services/backup.ts). No per-user timezone preference exists yet;
    // when one is added it can be read here from a cookie or user profile.
    timeZone: "UTC",
  };
});
