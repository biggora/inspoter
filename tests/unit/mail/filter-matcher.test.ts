import { describe, expect, it } from "vitest";
import {
  matchingMailFilterLabelIds,
  matchesMailFilter,
  matchesMailFilterRule,
  matchesExactSenderMailFilter,
  normalizeMailMatchText,
} from "@/lib/mail-filter-matcher";
import { MAIL_FILTER_MATCH_CONTRACT_CASES } from "./filter-matcher-contract";

describe("mail filter canonical matcher", () => {
  it("normalizes NFKC, surrounding whitespace, and case", () => {
    expect(normalizeMailMatchText("  Ａlice@Example.COM  ")).toBe(
      "alice@example.com",
    );
  });

  it("matches the sender exactly after canonical normalization", () => {
    expect(
      matchesExactSenderMailFilter(
        { fromAddress: "Alice@Example.com" },
        { fromAddress: "  alice@example.COM " },
      ),
    ).toBe(true);
    expect(
      matchesExactSenderMailFilter(
        { fromAddress: "alice@example.com" },
        { fromAddress: "prefix-alice@example.com" },
      ),
    ).toBe(false);
  });

  it("matches a canonical subject substring", () => {
    expect(
      matchesMailFilter(
        { subjectContains: " ＡLERT " },
        { fromAddress: "sender@example.com", subject: "Build alert received" },
      ),
    ).toBe(true);
    expect(
      matchesMailFilter(
        { subjectContains: "alert" },
        { fromAddress: "sender@example.com", subject: "Build succeeded" },
      ),
    ).toBe(false);
  });

  it("combines populated sender and subject predicates with AND", () => {
    const rule = {
      fromAddress: " Alice@Example.com ",
      subjectContains: " incident ",
    };
    expect(
      matchesMailFilter(rule, {
        fromAddress: "alice@example.COM",
        subject: "Production INCIDENT detected",
      }),
    ).toBe(true);
    expect(
      matchesMailFilter(rule, {
        fromAddress: "other@example.com",
        subject: "Production incident detected",
      }),
    ).toBe(false);
    expect(
      matchesMailFilter(rule, {
        fromAddress: "alice@example.com",
        subject: "Production healthy",
      }),
    ).toBe(false);
  });

  it("treats empty criteria as unpopulated and never matches an empty rule", () => {
    const candidate = { fromAddress: "", subject: "" };
    expect(matchesMailFilter({}, candidate)).toBe(false);
    expect(
      matchesMailFilter(
        { fromAddress: "  ", subjectContains: "\u3000" },
        candidate,
      ),
    ).toBe(false);
  });

  it("supports ALL/ANY matching across sender, recipient, body, and attachments", () => {
    const conditions = [
      {
        field: "FROM_DOMAIN" as const,
        operator: "EQUALS" as const,
        value: "example.com",
        isNegated: false,
      },
      {
        field: "RECIPIENT" as const,
        operator: "CONTAINS" as const,
        value: "@inspot.local",
        isNegated: false,
      },
      {
        field: "BODY" as const,
        operator: "CONTAINS" as const,
        value: "production",
        isNegated: false,
      },
      {
        field: "HAS_ATTACHMENT" as const,
        operator: "IS" as const,
        value: "true",
        isNegated: false,
      },
    ];
    const candidate = {
      fromAddress: "Build@example.com",
      toRecipients: [{ address: "ops@inspot.local" }],
      subject: "Deployment report",
      bodyText: "Production deployment finished.",
      hasAttachments: true,
    };

    expect(
      matchesMailFilterRule({ matchMode: "ALL", conditions }, candidate),
    ).toBe(true);
    expect(
      matchesMailFilterRule(
        {
          matchMode: "ANY",
          conditions: [
            { ...conditions[0], value: "other.example" },
            conditions[2],
          ],
        },
        candidate,
      ),
    ).toBe(true);
  });

  it("negates individual conditions before applying match mode", () => {
    expect(
      matchesMailFilterRule(
        {
          matchMode: "ALL",
          conditions: [
            {
              field: "SUBJECT",
              operator: "CONTAINS",
              value: "spam",
              isNegated: true,
            },
          ],
        },
        {
          fromAddress: "sender@example.com",
          subject: "Build completed",
        },
      ),
    ).toBe(true);
  });

  it.each(MAIL_FILTER_MATCH_CONTRACT_CASES)(
    "runs shared contract vector $id through the unit matcher",
    ({ rule, candidate, expected }) => {
      expect(matchesMailFilter(rule, candidate)).toBe(expected);
    },
  );

  it("runs identical shared vectors through the batch-style evaluator", () => {
    expect(
      MAIL_FILTER_MATCH_CONTRACT_CASES.map(
        ({ id, rule, candidate, expected }) => ({
          id,
          expected,
          matched:
            matchingMailFilterLabelIds([{ ...rule, labelId: id }], candidate)
              .length === 1,
        }),
      ),
    ).toEqual(
      MAIL_FILTER_MATCH_CONTRACT_CASES.map(({ id, expected }) => ({
        id,
        expected,
        matched: expected,
      })),
    );
  });
});
