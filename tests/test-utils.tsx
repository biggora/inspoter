import { NextIntlClientProvider } from "next-intl";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactElement } from "react";
import { ruMessages } from "@/i18n/messages";

export function renderWithIntl(ui: ReactElement, options?: RenderOptions) {
  return render(
    <NextIntlClientProvider locale="ru" messages={ruMessages} timeZone="UTC">
      {ui}
    </NextIntlClientProvider>,
    options,
  );
}
