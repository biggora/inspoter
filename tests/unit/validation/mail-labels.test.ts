import { describe, expect, it } from "vitest";
import {
  createMailFilterRuleSchema,
  createExactSenderRuleSchema,
  createMailLabelSchema,
  listMailQuerySchema,
  updateMailLabelSchema,
  updateMailFilterRuleSchema,
} from "@/lib/validation/mail";

describe("Mail label validation", () => {
  it("normalizes display whitespace and accepts every documented color", () => {
    for (const color of [
      "SLATE",
      "RED",
      "AMBER",
      "GREEN",
      "BLUE",
      "VIOLET",
    ] as const) {
      expect(
        createMailLabelSchema.parse({ name: "  Build\t Alerts  ", color }),
      ).toEqual({ name: "Build Alerts", color });
    }
    expect(
      createMailLabelSchema.parse({ name: "Custom", color: " #12ab34 " }),
    ).toEqual({ name: "Custom", color: "#12AB34" });
    expect(
      createMailLabelSchema.safeParse({ name: "Bad", color: "#12AB3" }).success,
    ).toBe(false);
    expect(
      createMailLabelSchema.safeParse({ name: "Bad", color: "transparent" })
        .success,
    ).toBe(false);
  });

  it("enforces the 40-character name limit and strict bodies", () => {
    expect(
      createMailLabelSchema.safeParse({ name: "x".repeat(40), color: "BLUE" })
        .success,
    ).toBe(true);
    expect(
      createMailLabelSchema.safeParse({ name: "x".repeat(41), color: "BLUE" })
        .success,
    ).toBe(false);
    expect(
      createMailLabelSchema.safeParse({
        name: "Valid",
        color: "BLUE",
        unexpected: true,
      }).success,
    ).toBe(false);
  });

  it("validates strict non-empty label updates", () => {
    expect(
      updateMailLabelSchema.parse({
        name: "  Updated\tName ",
        color: "GREEN",
        position: 0,
      }),
    ).toEqual({ name: "Updated Name", color: "GREEN", position: 0 });
    expect(updateMailLabelSchema.safeParse({}).success).toBe(false);
    expect(updateMailLabelSchema.safeParse({ position: -1 }).success).toBe(
      false,
    );
    expect(
      updateMailLabelSchema.safeParse({ color: "BLUE", extra: true }).success,
    ).toBe(false);
  });

  it("strictly validates every supported Mail-list facet", () => {
    expect(
      listMailQuerySchema.parse({
        cursor: "cursor",
        from: " sender@example.com ",
        query: " exact query ",
        sort: "asc",
        accountId: " account ",
        folderId: " folder ",
        labelId: " label ",
        unread: "1",
      }),
    ).toEqual({
      cursor: "cursor",
      from: " sender@example.com ",
      query: " exact query ",
      sort: "asc",
      accountId: "account",
      folderId: "folder",
      labelId: "label",
      unread: "1",
    });
    expect(listMailQuerySchema.safeParse({ unread: "true" }).success).toBe(
      false,
    );
    expect(listMailQuerySchema.safeParse({ unknown: "value" }).success).toBe(
      false,
    );
  });
});

describe("Mail filter-rule validation", () => {
  const valid = {
    accountId: "account",
    labelId: "label",
    name: "Sender rule",
    fromAddress: "sender@example.com",
  };

  it("normalizes sender compatibility characters and whitespace", () => {
    expect(
      createExactSenderRuleSchema.parse({
        ...valid,
        fromAddress: "  Ａlice@Example.com  ",
      }).fromAddress,
    ).toBe("Alice@Example.com");
  });

  it("enforces 80/320-character boundaries and rejects unknown fields", () => {
    expect(
      createExactSenderRuleSchema.safeParse({
        ...valid,
        name: "x".repeat(80),
        fromAddress: "x".repeat(320),
      }).success,
    ).toBe(true);
    expect(
      createExactSenderRuleSchema.safeParse({
        ...valid,
        name: "x".repeat(81),
      }).success,
    ).toBe(false);
    expect(
      createExactSenderRuleSchema.safeParse({
        ...valid,
        fromAddress: "x".repeat(321),
      }).success,
    ).toBe(false);
    expect(
      createExactSenderRuleSchema.safeParse({ ...valid, unexpected: true })
        .success,
    ).toBe(false);
  });

  it("accepts sender-only, subject-only, and AND criteria", () => {
    expect(createMailFilterRuleSchema.safeParse(valid).success).toBe(true);
    expect(
      createMailFilterRuleSchema.parse({
        accountId: "account",
        labelId: "label",
        name: "Subject rule",
        subjectContains: "  ＡLERT  ",
      }),
    ).toEqual({
      accountId: "account",
      labelId: "label",
      name: "Subject rule",
      subjectContains: "ALERT",
    });
    expect(
      createMailFilterRuleSchema.safeParse({
        ...valid,
        subjectContains: "incident",
      }).success,
    ).toBe(true);
    expect(
      createMailFilterRuleSchema.safeParse({
        accountId: "account",
        labelId: "label",
        name: "Empty",
        fromAddress: " ",
        subjectContains: null,
      }).success,
    ).toBe(false);
  });

  it("enforces 0/1/200/201 subject boundaries", () => {
    const subjectRule = {
      accountId: "account",
      labelId: "label",
      name: "Subject",
    };
    expect(
      createMailFilterRuleSchema.safeParse({
        ...subjectRule,
        subjectContains: "x",
      }).success,
    ).toBe(true);
    expect(
      createMailFilterRuleSchema.safeParse({
        ...subjectRule,
        subjectContains: "x".repeat(200),
      }).success,
    ).toBe(true);
    expect(
      createMailFilterRuleSchema.safeParse({
        ...subjectRule,
        subjectContains: "x".repeat(201),
      }).success,
    ).toBe(false);
    expect(
      createMailFilterRuleSchema.safeParse({
        ...subjectRule,
        subjectContains: "",
      }).success,
    ).toBe(false);
    expect(
      createMailFilterRuleSchema.safeParse({
        ...subjectRule,
        fromAddress: "sender@example.com",
        subjectContains: "",
      }).success,
    ).toBe(true);
  });

  it("validates lifecycle updates and explicit predicate clearing", () => {
    expect(
      updateMailFilterRuleSchema.safeParse({
        name: "Renamed",
        labelId: "label-2",
        isActive: false,
        position: 0,
      }).success,
    ).toBe(true);
    expect(updateMailFilterRuleSchema.safeParse({}).success).toBe(false);
    expect(
      updateMailFilterRuleSchema.safeParse({
        fromAddress: null,
        subjectContains: null,
      }).success,
    ).toBe(false);
    expect(
      updateMailFilterRuleSchema.safeParse({
        fromAddress: null,
        subjectContains: "incident",
      }).success,
    ).toBe(true);
    expect(updateMailFilterRuleSchema.safeParse({ position: -1 }).success).toBe(
      false,
    );
    expect(
      updateMailFilterRuleSchema.safeParse({ isActive: true, extra: true })
        .success,
    ).toBe(false);
  });
});
