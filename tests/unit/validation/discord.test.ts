import { describe, expect, it } from "vitest";
import {
  EMBED_TOTAL_LIMIT,
  embedCharacterCount,
  exceedsEmbedBudget,
  executeWebhookSchema,
  hasDisplayableContent,
  slackWebhookSchema,
  type ExecuteWebhookPayload,
} from "@/lib/validation/discord";

// specs/discord-webhook-compatibility.md §2.3, §3.1.

function parse(payload: unknown): ExecuteWebhookPayload {
  const result = executeWebhookSchema.safeParse(payload);
  if (!result.success) {
    throw new Error(`expected a valid payload: ${result.error.message}`);
  }
  return result.data;
}

describe("Discord Execute Webhook payload", () => {
  it("accepts a minimal content-only body", () => {
    expect(parse({ content: "hello" }).content).toBe("hello");
  });

  it("ignores unknown properties the way Discord does", () => {
    const result = executeWebhookSchema.safeParse({
      content: "hello",
      // Discord silently drops keys it doesn't know; the strict native channel
      // schema would reject this.
      nonce: "1234",
      channelId: "not-a-discord-field",
    });
    expect(result.success).toBe(true);
  });

  it("enforces the per-field Discord limits", () => {
    expect(
      executeWebhookSchema.safeParse({ content: "x".repeat(2001) }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({ content: "x".repeat(2000) }).success,
    ).toBe(true);
    expect(
      executeWebhookSchema.safeParse({
        content: "hi",
        username: "x".repeat(81),
      }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: Array.from({ length: 11 }, () => ({ title: "t" })),
      }).success,
    ).toBe(false);
  });

  it("enforces the embed field limits", () => {
    expect(
      executeWebhookSchema.safeParse({ embeds: [{ title: "x".repeat(257) }] })
        .success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: [{ description: "x".repeat(4097) }],
      }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: [
          {
            fields: Array.from({ length: 26 }, () => ({
              name: "n",
              value: "v",
            })),
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: [{ fields: [{ name: "n", value: "x".repeat(1025) }] }],
      }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: [{ footer: { text: "x".repeat(2049) } }],
      }).success,
    ).toBe(false);
    expect(
      executeWebhookSchema.safeParse({
        embeds: [{ author: { name: "x".repeat(257) } }],
      }).success,
    ).toBe(false);
  });

  it("counts every budgeted embed character exactly once", () => {
    expect(
      embedCharacterCount([
        {
          title: "abc", // 3
          description: "de", // 2
          footer: { text: "f" }, // 1
          author: { name: "gh" }, // 2
          fields: [{ name: "ij", value: "klm" }], // 5
        },
      ]),
    ).toBe(13);
    // url/timestamp/color are not part of Discord's 6000-character budget.
    expect(
      embedCharacterCount([{ url: "x".repeat(50), timestamp: "y".repeat(20) }]),
    ).toBe(0);
  });

  it("rejects only above the 6000-character budget, and across embeds", () => {
    const atLimit = parse({
      embeds: [
        { description: "x".repeat(4000) },
        { description: "y".repeat(2000) },
      ],
    });
    expect(embedCharacterCount(atLimit.embeds ?? [])).toBe(EMBED_TOTAL_LIMIT);
    expect(exceedsEmbedBudget(atLimit)).toBe(false);

    const overLimit = parse({
      embeds: [
        { description: "x".repeat(4000) },
        { description: "y".repeat(2001) },
      ],
    });
    expect(exceedsEmbedBudget(overLimit)).toBe(true);
  });

  it("treats a body with nothing displayable as empty", () => {
    expect(hasDisplayableContent(parse({}))).toBe(false);
    expect(hasDisplayableContent(parse({ content: "   " }))).toBe(false);
    expect(hasDisplayableContent(parse({ tts: true }))).toBe(false);
    // A file part alone satisfies Discord's rule even with no JSON body.
    expect(hasDisplayableContent(parse({}), true)).toBe(true);
    expect(hasDisplayableContent(parse({ content: "hi" }))).toBe(true);
    expect(hasDisplayableContent(parse({ embeds: [{ title: "t" }] }))).toBe(
      true,
    );
    expect(hasDisplayableContent(parse({ poll: { question: "?" } }))).toBe(
      true,
    );
  });
});

describe("Slack-compatible payload", () => {
  it("accepts a text-and-attachments body", () => {
    const result = slackWebhookSchema.safeParse({
      text: "deploy finished",
      username: "CI",
      attachments: [
        {
          title: "Build 842",
          text: "passed",
          color: "good",
          fields: [{ title: "branch", value: "main", short: true }],
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts ts as either a number or a string", () => {
    expect(
      slackWebhookSchema.safeParse({ attachments: [{ ts: 1_700_000_000 }] })
        .success,
    ).toBe(true);
    expect(
      slackWebhookSchema.safeParse({ attachments: [{ ts: "1700000000" }] })
        .success,
    ).toBe(true);
  });
});
