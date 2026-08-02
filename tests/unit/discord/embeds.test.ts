import { describe, expect, it } from "vitest";
import { eventToEmbed, slackToDiscord } from "@/lib/discord/embeds";
import {
  embedCharacterCount,
  EMBED_TOTAL_LIMIT,
} from "@/lib/validation/discord";

// specs/discord-webhook-compatibility.md §2.7, §6.

const AT = new Date("2026-08-02T10:15:00.000Z");

describe("event to embed mapping", () => {
  it("colours an alert by severity", () => {
    const critical = eventToEmbed(
      "ALERT_CREATED",
      {
        category: "Disk",
        severity: "critical",
        source: "node-1",
        message: "full",
      },
      AT,
    );
    expect(critical.title).toBe("Disk");
    expect(critical.description).toBe("full");
    expect(critical.color).toBe(0xed4245);
    expect(critical.fields).toEqual([
      { name: "severity", value: "critical", inline: true },
      { name: "source", value: "node-1", inline: true },
    ]);

    expect(
      eventToEmbed("ALERT_CREATED", { severity: "warning" }, AT).color,
    ).toBe(0xfee75c);
    expect(eventToEmbed("ALERT_CREATED", { severity: "info" }, AT).color).toBe(
      0x5865f2,
    );
  });

  it("colours a service flip by status", () => {
    expect(
      eventToEmbed("SERVICE_STATUS", { name: "api", status: "up" }, AT).color,
    ).toBe(0x57f287);
    expect(
      eventToEmbed("SERVICE_STATUS", { name: "api", status: "down" }, AT).color,
    ).toBe(0xed4245);
    expect(
      eventToEmbed("SERVICE_STATUS", { name: "api", status: "degraded" }, AT)
        .color,
    ).toBe(0xfee75c);
  });

  it("colours a log by level", () => {
    expect(eventToEmbed("LOG_CREATED", { level: "error" }, AT).color).toBe(
      0xed4245,
    );
    expect(eventToEmbed("LOG_CREATED", { level: "info" }, AT).color).toBe(
      0x4f545c,
    );
  });

  it("maps messages and mail onto their headline field", () => {
    const message = eventToEmbed(
      "MESSAGE_CREATED",
      {
        channelName: "deploys",
        content: "shipped",
        author: "CI",
        origin: "WEBHOOK",
      },
      AT,
    );
    expect(message.title).toBe("deploys");
    expect(message.fields).toEqual([
      { name: "author", value: "CI", inline: true },
      { name: "origin", value: "WEBHOOK", inline: true },
    ]);

    const mail = eventToEmbed(
      "MAIL_RECEIVED",
      {
        subject: "Invoice",
        sender: "billing@example.test",
        body: "see attached",
      },
      AT,
    );
    expect(mail.title).toBe("Invoice");
    expect(mail.fields).toEqual([
      { name: "from", value: "billing@example.test", inline: true },
    ]);
  });

  it("renders a test delivery as its own card", () => {
    const embed = eventToEmbed(
      "ALERT_CREATED",
      { test: true, message: "Inspot outgoing webhook test delivery" },
      AT,
    );
    expect(embed.title).toBe("Inspoter test delivery");
    expect(embed.timestamp).toBe(AT.toISOString());
  });

  it("keeps oversized event data inside the Discord limits", () => {
    const embed = eventToEmbed(
      "LOG_CREATED",
      {
        source: "x".repeat(500),
        message: "y".repeat(9000),
        level: "z".repeat(4000),
      },
      AT,
    );
    expect(embed.title?.length).toBeLessThanOrEqual(256);
    expect(embed.description?.length).toBeLessThanOrEqual(4096);
    expect(embed.fields?.[0].value.length).toBeLessThanOrEqual(1024);
    expect(embedCharacterCount([embed])).toBeLessThanOrEqual(EMBED_TOTAL_LIMIT);
  });

  it("omits fields whose source value is missing", () => {
    const embed = eventToEmbed("ALERT_CREATED", { message: "no severity" }, AT);
    expect(embed.fields).toBeUndefined();
    expect(embed.title).toBe("Alert");
  });
});

describe("Slack attachments to embeds", () => {
  it("translates text, colour names and fields", () => {
    const result = slackToDiscord({
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

    expect(result.content).toBe("deploy finished");
    expect(result.username).toBe("CI");
    expect(result.embeds).toHaveLength(1);
    expect(result.embeds[0]).toMatchObject({
      title: "Build 842",
      description: "passed",
      color: 0x57f287,
      fields: [{ name: "branch", value: "main", inline: true }],
    });
  });

  it("accepts hex colours with and without a leading hash", () => {
    expect(
      slackToDiscord({ attachments: [{ color: "#112233" }] }).embeds[0].color,
    ).toBe(0x112233);
    expect(
      slackToDiscord({ attachments: [{ color: "112233" }] }).embeds[0].color,
    ).toBe(0x112233);
    expect(
      slackToDiscord({ attachments: [{ color: "not-a-colour" }] }).embeds[0]
        .color,
    ).toBeUndefined();
  });

  it("converts a Slack epoch ts into an ISO timestamp", () => {
    const embed = slackToDiscord({
      attachments: [{ ts: AT.getTime() / 1000 }],
    }).embeds[0];
    expect(embed.timestamp).toBe(AT.toISOString());
  });

  it("caps the attachment count at Discord's ten embeds", () => {
    const result = slackToDiscord({
      attachments: Array.from({ length: 12 }, (_, index) => ({
        title: `a${index}`,
      })),
    });
    expect(result.embeds).toHaveLength(10);
  });
});
