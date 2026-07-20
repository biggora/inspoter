import { describe, expect, it } from "vitest";
import {
  createOutgoingWebhookSchema,
  updateOutgoingWebhookSchema,
} from "@/lib/validation/outgoingWebhooks";

describe("createOutgoingWebhookSchema", () => {
  const valid = {
    name: "Slack",
    url: "https://example.com/hook",
    events: ["ALERT_CREATED"],
  };

  it("accepts a valid payload and defaults isActive to true", () => {
    const parsed = createOutgoingWebhookSchema.parse(valid);
    expect(parsed.isActive).toBe(true);
    expect(parsed.events).toEqual(["ALERT_CREATED"]);
  });

  it("rejects an empty name", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({ ...valid, name: "  " }).success,
    ).toBe(false);
  });

  it("rejects a non-https url", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({
        ...valid,
        url: "http://example.com/hook",
      }).success,
    ).toBe(false);
  });

  it("rejects a malformed url", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({ ...valid, url: "https://" })
        .success,
    ).toBe(false);
  });

  it("rejects an empty events array", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({ ...valid, events: [] }).success,
    ).toBe(false);
  });

  it("rejects an unknown event value", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({ ...valid, events: ["NOPE"] })
        .success,
    ).toBe(false);
  });

  it("rejects unknown keys (strict)", () => {
    expect(
      createOutgoingWebhookSchema.safeParse({ ...valid, extra: 1 }).success,
    ).toBe(false);
  });
});

describe("updateOutgoingWebhookSchema", () => {
  it("accepts a partial payload", () => {
    expect(
      updateOutgoingWebhookSchema.safeParse({ isActive: false }).success,
    ).toBe(true);
  });

  it("still rejects an empty events array when present", () => {
    expect(updateOutgoingWebhookSchema.safeParse({ events: [] }).success).toBe(
      false,
    );
  });
});
