import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import {
  alertMessage,
  categoryLabel,
  type AlertsTranslator,
} from "@/components/alerts/localize";
import { enMessages, ruMessages } from "@/i18n/messages";
import { renderSystemAlertMessage } from "@/lib/services/alert-catalog";

// The contract that makes a system alert readable in either locale: producers
// store the English text plus a key, and the two sides must never disagree.

function translatorFor(locale: "en" | "ru"): AlertsTranslator {
  return createTranslator({
    locale,
    messages: locale === "en" ? enMessages : ruMessages,
    namespace: "alerts",
  }) as unknown as AlertsTranslator;
}

const en = translatorFor("en");
const ru = translatorFor("ru");

describe("alertMessage()", () => {
  it("renders a keyed alert in the active locale", () => {
    const alert = {
      message: "Service is available again",
      messageKey: "system.serviceUp",
      messageParams: null,
    };

    expect(alertMessage(alert, en)).toBe("Service is available again");
    expect(alertMessage(alert, ru)).toBe("Сервис снова доступен");
  });

  it("interpolates the stored params", () => {
    const alert = {
      message: "Sync error: Socket timeout",
      messageKey: "system.mailSyncError",
      messageParams: { error: "Socket timeout" },
    };

    expect(alertMessage(alert, ru)).toBe(
      "Ошибка синхронизации: Socket timeout",
    );
  });

  it("keeps the stored text for a webhook alert that has no key", () => {
    const alert = {
      message: "Disk usage above 90%",
      messageKey: null,
      messageParams: null,
    };

    expect(alertMessage(alert, ru)).toBe("Disk usage above 90%");
  });

  // A producer retired in a later release leaves its alerts behind. Falling
  // back to the stored English beats rendering a bare key path at the operator.
  it("falls back to the stored text for a key the catalog no longer has", () => {
    const alert = {
      message: "Legacy producer said something",
      messageKey: "system.removedInSomeLaterRelease",
      messageParams: null,
    };

    expect(alertMessage(alert, en)).toBe("Legacy producer said something");
  });
});

describe("categoryLabel()", () => {
  it("translates a system category", () => {
    expect(categoryLabel({ name: "Mail", systemKey: "mail" }, ru)).toBe(
      "Почта",
    );
    expect(categoryLabel({ name: "Mail", systemKey: "mail" }, en)).toBe("Mail");
  });

  it("shows an operator's own category verbatim in every locale", () => {
    const own = { name: "Deploys", systemKey: null };

    expect(categoryLabel(own, en)).toBe("Deploys");
    expect(categoryLabel(own, ru)).toBe("Deploys");
  });
});

describe("renderSystemAlertMessage()", () => {
  // Producers write this into Alert.message; the UI renders the same key. If
  // the two ever diverged, search and the visible text would disagree.
  it("matches what the English translator produces for the same key", () => {
    expect(
      renderSystemAlertMessage("system.providerError", { error: "429" }),
    ).toBe(en("system.providerError", { error: "429" }));
  });

  it("keeps the [CODE] prefix the metrics dedup query matches on", () => {
    const message = renderSystemAlertMessage("system.serverMetricsError", {
      code: "SERVER_MATCH_AMBIGUOUS",
      message: "two servers share an address",
    });

    expect(message.startsWith("[SERVER_MATCH_AMBIGUOUS]")).toBe(true);
  });
});
