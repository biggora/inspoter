import { NextIntlClientProvider } from "next-intl";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { enMessages } from "@/i18n/messages";

// The base locale, so assertions read against the strings the components were
// authored with. Translations are covered separately: tests/unit/i18n checks
// that every locale has the same keys and that the alert catalog renders in
// both.
export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
    options,
  );
}
