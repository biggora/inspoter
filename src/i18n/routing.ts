import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ru", "lv"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
