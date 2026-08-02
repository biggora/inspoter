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
const withDiscord = HELP_ARTICLES.filter((article) => article.discord);
const withOutgoing = HELP_ARTICLES.filter((article) => article.outgoing);

// The only tag handlers help-article-body.tsx passes to t.rich. next-intl throws
// at render time when a string uses any other tag, and the Help page is behind
// auth, so an unhandled tag would otherwise surface as a blank article in prod.
const RICH_TAGS = ["tokens", "apiDocs", "outgoing"];

describe("help webhook documentation", () => {
  it("documents at least one incoming, Discord and outgoing section", () => {
    expect(withWebhook.length).toBeGreaterThan(0);
    expect(withDiscord.length).toBeGreaterThan(0);
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

    it.each(withDiscord.map((article) => article.slug))(
      "%s has a Discord intro and payload fields",
      (slug) => {
        expect(messages[`${slug}DiscordIntro`]).toBeTypeOf("string");
        const fields = messages[`${slug}DiscordFields`];
        expect(Array.isArray(fields)).toBe(true);
        expect(fields as string[]).not.toHaveLength(0);
      },
    );

    it.each(withOutgoing.map((article) => article.slug))(
      "%s describes its outgoing event",
      (slug) => {
        expect(messages[`${slug}OutgoingWebhook`]).toBeTypeOf("string");
      },
    );

    it("explains the delivery formats once, shared by every outgoing article", () => {
      expect(messages.discordWebhookHeading).toBeTypeOf("string");
      expect(messages.outgoingFormatsNote).toBeTypeOf("string");
    });

    it("only uses rich-text tags the article body actually handles", () => {
      const richKeys = [
        "outgoingFormatsNote",
        ...withWebhook.map((article) => `${article.slug}WebhookIntro`),
        ...withDiscord.map((article) => `${article.slug}DiscordIntro`),
        ...withOutgoing.map((article) => `${article.slug}OutgoingWebhook`),
      ];

      for (const key of richKeys) {
        const value = messages[key];
        expect(value, `${key} is missing`).toBeTypeOf("string");
        for (const [, tag] of (value as string).matchAll(/<(\w+)>/g)) {
          expect(RICH_TAGS, `${key} uses <${tag}>`).toContain(tag);
        }
        // An opened tag must close, or next-intl rejects the whole string.
        for (const tag of RICH_TAGS) {
          const opens = (value as string).split(`<${tag}>`).length - 1;
          const closes = (value as string).split(`</${tag}>`).length - 1;
          expect(closes, `${key} unbalanced <${tag}>`).toBe(opens);
        }
      }
    });
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

  it("keeps the Discord sample on placeholders, since its path is the secret", () => {
    for (const article of withDiscord) {
      const { endpoint, curl = "" } = article.discord!;
      expect(endpoint.startsWith("POST /api/discord/webhooks/")).toBe(true);
      // A real 48-hex-character token must never reach the docs.
      expect(curl).not.toMatch(/[0-9a-f]{48}/);
      expect(curl).toContain("WEBHOOK_TOKEN");
    }
  });
});
