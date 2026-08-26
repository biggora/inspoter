import { describe, expect, it } from "vitest";
import {
  createMailTemplateSchema,
  createMailTemplateTagSchema,
  listMailTemplatesQuerySchema,
  updateMailTemplateSchema,
} from "@/lib/validation/mail";

describe("mail template validation", () => {
  const valid = {
    name: "Maintenance notice",
    subject: "Maintenance on {{date}}",
    bodyText: "Hello {{name}}",
    bodyHtml: "<p>Hello {{name}}</p>",
    starred: false,
    tagIds: ["tag-1"],
  };

  it("accepts a reusable subject/body and rejects blank content", () => {
    expect(createMailTemplateSchema.parse(valid)).toEqual(valid);
    expect(
      createMailTemplateSchema.safeParse({
        ...valid,
        subject: " ",
        bodyText: " ",
      }).success,
    ).toBe(false);
  });

  it("enforces names, unique tag ids, strict bodies, and non-empty updates", () => {
    expect(
      createMailTemplateSchema.safeParse({ ...valid, name: "x".repeat(101) })
        .success,
    ).toBe(false);
    expect(
      createMailTemplateSchema.safeParse({
        ...valid,
        tagIds: ["tag-1", "tag-1"],
      }).success,
    ).toBe(false);
    expect(
      createMailTemplateSchema.safeParse({ ...valid, extra: true }).success,
    ).toBe(false);
    expect(updateMailTemplateSchema.safeParse({}).success).toBe(false);
  });

  it("normalizes tag colors and parses list filters", () => {
    expect(
      createMailTemplateTagSchema.parse({
        name: " Billing ",
        color: " #12ab34 ",
      }),
    ).toEqual({ name: "Billing", color: "#12AB34" });
    expect(
      listMailTemplatesQuerySchema.parse({
        query: " billing ",
        tagId: "tag-1",
        starred: "true",
        page: "2",
      }),
    ).toEqual({
      query: "billing",
      tagId: "tag-1",
      starred: true,
      page: 2,
      pageSize: 24,
    });
  });
});
