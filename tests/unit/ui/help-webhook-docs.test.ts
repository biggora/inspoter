import { describe, expect, it } from "vitest";

import { HELP_ARTICLES } from "@/components/help/help-articles";
import { SUPPORTED_TYPES } from "@/lib/validation/webhooks";
import enHelp from "@/messages/en/help.json";
import ruHelp from "@/messages/ru/help.json";

// The webhook block of a Help article is half data (endpoint + sample, in
// help-articles.ts) and half prose (intro + field list, in help.json). Nothing
// at runtime notices when the two halves drift, and a missing key only shows up
// as a broken article page — hence these contract checks.

const locales = [
  ["en", enHelp as Record<string, unknown>],
  ["ru", ruHelp as Record<string, unknown>],
] as const;

const withWebhook = HELP_ARTICLES.filter((article) => article.webhook);
const withOutgoing = HELP_ARTICLES.filter((article) => article.outgoing);

describe("help webhook documentation", () => {
  it("documents at least one incoming and one outgoing section", () => {
    expect(withWebhook.length).toBeGreaterThan(0);
    expect(withOutgoing.length).toBeGreaterThan(0);
  });

  describe.each(locales)("%s messages", (_locale, messages) => {
    it.each(withWebhook.map((article) => article.slug))(
      "%s has a webhook intro",
      (slug) => {
        expect(messages[`${slug}WebhookIntro`]).toBeTypeOf("string");
      },
    );

    it.each(
      withWebhook
        .filter((article) => article.webhook?.curl)
        .map((article) => article.slug),
    )("%s lists its payload fields", (slug) => {
      const fields = messages[`${slug}WebhookFields`];
      expect(Array.isArray(fields)).toBe(true);
      expect(fields as string[]).not.toHaveLength(0);
    });

    it.each(withOutgoing.map((article) => article.slug))(
      "%s describes its outgoing event",
      (slug) => {
        expect(messages[`${slug}OutgoingWebhook`]).toBeTypeOf("string");
      },
    );
  });

  it("keeps the en and ru key sets identical", () => {
    expect(Object.keys(ruHelp).sort()).toEqual(Object.keys(enHelp).sort());
  });

  it("only documents webhook types the ingest pipeline accepts", () => {
    for (const article of withWebhook) {
      const match = /^POST \/api\/webhooks\/(\w+)$/.exec(
        article.webhook!.endpoint,
      );
      if (!match) continue; // e.g. /api/server-metrics, a non-[type] endpoint
      expect(SUPPORTED_TYPES).toContain(match[1]);
    }
  });

  it("never prints a channel webhook URL, which carries its credential", () => {
    for (const article of withWebhook) {
      expect(article.webhook?.curl ?? "").not.toContain(
        "/api/webhooks/channels",
      );
    }
  });
});
