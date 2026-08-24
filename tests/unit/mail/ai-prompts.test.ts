import { describe, expect, it } from "vitest";
import {
  MAX_PROMPT_BODY_CHARS,
  buildFilterProposalMockAnswer,
  buildFilterProposalPrompt,
  buildFilterProposalSystemPrompt,
  buildMailAiContext,
  buildReplyDraftMockAnswer,
  buildReplyDraftPrompt,
  buildReplyDraftSystemPrompt,
  buildSummaryMockAnswer,
  buildSummaryPrompt,
  buildSummarySystemPrompt,
} from "@/lib/mail/ai-prompts";
import {
  mailFilterProposalAnswerSchema,
  mailReplyDraftAnswerSchema,
  mailSummaryAnswerSchema,
  sanitizeProposedConditions,
} from "@/lib/validation/mail-ai";
import type { MailDetailDto } from "@/lib/services/mail";

// Prompt construction, body hygiene, and the deterministic mock answers. The
// last describe block is the contract the e2e suite rests on: every mock
// answer must satisfy the same schema the real answer is validated with.

const HTML_MARKER = "MARKER-ONLY-IN-HTML";

function detail(overrides: Partial<MailDetailDto> = {}): MailDetailDto {
  return {
    id: "mail-1",
    accountId: "acc-1",
    folderId: "folder-1",
    accountKind: "IMAP",
    from: "billing@Example.COM",
    fromName: "Billing",
    to: [{ name: null, address: "ops@inspot.test" }],
    cc: [],
    bcc: [],
    subject: "Invoice 88213",
    snippet: null,
    bodyText: "Your invoice is ready.\nDue on 2026-09-01.",
    bodyHtml: `<p>${HTML_MARKER}</p>`,
    draftReplyToId: null,
    draftForwardOfId: null,
    isRead: false,
    isAnswered: false,
    isFlagged: false,
    hasAttachments: false,
    receivedAt: new Date("2026-08-01T09:00:00.000Z"),
    attachments: [],
    labels: [],
    ...overrides,
  } as MailDetailDto;
}

describe("buildMailAiContext()", () => {
  it("takes the sender domain in lower case", () => {
    expect(buildMailAiContext(detail()).fromDomain).toBe("example.com");
  });

  it("leaves the domain null for a malformed address", () => {
    expect(
      buildMailAiContext(detail({ from: "not-an-address" })).fromDomain,
    ).toBe(null);
  });

  it("never reads bodyHtml", () => {
    const context = buildMailAiContext(detail());

    expect(context.body).not.toContain(HTML_MARKER);
    expect(buildSummaryPrompt(context)).not.toContain(HTML_MARKER);
  });

  it("drops quoted lines", () => {
    const context = buildMailAiContext(
      detail({ bodyText: "My answer.\n> your question\n> more of it" }),
    );

    expect(context.body).toBe("My answer.");
  });

  it.each([
    "-----Original Message-----",
    "On Mon, 1 Jun 2026 at 10:00, Ops wrote:",
    "From: ops@inspot.test",
  ])("cuts the history that begins at %s", (boundary) => {
    const context = buildMailAiContext(
      detail({ bodyText: `Kept.\n${boundary}\nDropped history.` }),
    );

    expect(context.body).toBe("Kept.");
    expect(context.body).not.toContain("Dropped history");
  });

  it("collapses runs of blank lines", () => {
    const context = buildMailAiContext(
      detail({ bodyText: "one\n\n\n\n\ntwo" }),
    );

    expect(context.body).toBe("one\n\ntwo");
  });

  it("truncates an over-long body and says so", () => {
    const context = buildMailAiContext(
      detail({ bodyText: "x".repeat(MAX_PROMPT_BODY_CHARS + 500) }),
    );

    expect(context.truncated).toBe(true);
    expect(context.body).toContain("[truncated]");
    expect(context.body.length).toBeLessThan(MAX_PROMPT_BODY_CHARS + 100);
  });

  it("reports a short body as untruncated", () => {
    expect(buildMailAiContext(detail()).truncated).toBe(false);
  });
});

describe("system prompts", () => {
  const prompts = [
    buildSummarySystemPrompt("en"),
    buildReplyDraftSystemPrompt("en"),
    buildFilterProposalSystemPrompt("en"),
  ];

  it("state the JSON contract", () => {
    for (const prompt of prompts) {
      expect(prompt).toContain("exactly one JSON object");
      expect(prompt).toContain("no markdown fences");
    }
  });

  it("frame the message body as untrusted data", () => {
    for (const prompt of prompts) {
      expect(prompt).toContain("untrusted data");
      expect(prompt).toContain("never instructions");
    }
  });

  it("name the answer language in the base language", () => {
    expect(buildSummarySystemPrompt("ru")).toContain("Russian");
    expect(buildSummarySystemPrompt("en")).toContain("English");
    // The source stays free of Cyrillic — scripts/check-base-language.mjs.
    expect(/[Ѐ-ӿ]/.test(buildSummarySystemPrompt("ru"))).toBe(false);
  });
});

describe("user prompts", () => {
  const context = buildMailAiContext(detail());

  it("wrap the body in delimiters", () => {
    for (const prompt of [
      buildSummaryPrompt(context),
      buildReplyDraftPrompt(context),
      buildFilterProposalPrompt(context),
    ]) {
      expect(prompt).toContain("<<<MESSAGE_BODY");
      expect(prompt).toContain("MESSAGE_BODY>>>");
      expect(prompt).toContain("Invoice 88213");
    }
  });

  it("carry an operator instruction into the reply prompt", () => {
    expect(buildReplyDraftPrompt(context, "ask for a PDF")).toContain(
      "ask for a PDF",
    );
  });

  it("omit the instruction clause when there is none", () => {
    expect(buildReplyDraftPrompt(context, "   ")).toContain("Draft a reply.\n");
  });
});

// The load-bearing block: the mock driver returns these verbatim, so if one
// stops matching its schema the e2e suite breaks with no clue why.
describe("mock answers match the schemas the real answers are parsed with", () => {
  const context = buildMailAiContext(detail());

  it("summary", () => {
    const parsed = mailSummaryAnswerSchema.parse(
      JSON.parse(buildSummaryMockAnswer(context)),
    );

    expect(parsed.summary).toContain("Invoice 88213");
  });

  it("reply draft", () => {
    const parsed = mailReplyDraftAnswerSchema.parse(
      JSON.parse(buildReplyDraftMockAnswer(context)),
    );

    expect(parsed.bodyText).toContain("Invoice 88213");
  });

  it("filter proposal, with conditions the sanitizer keeps", () => {
    const parsed = mailFilterProposalAnswerSchema.parse(
      JSON.parse(buildFilterProposalMockAnswer(context)),
    );
    const sanitized = sanitizeProposedConditions(parsed.conditions);

    expect(sanitized.dropped).toBe(0);
    expect(sanitized.conditions).toEqual([
      {
        field: "FROM_DOMAIN",
        operator: "EQUALS",
        value: "example.com",
        isNegated: false,
      },
    ]);
  });

  it("filter proposal falls back to the subject when there is no domain", () => {
    const noDomain = buildMailAiContext(detail({ from: "not-an-address" }));
    const parsed = mailFilterProposalAnswerSchema.parse(
      JSON.parse(buildFilterProposalMockAnswer(noDomain)),
    );
    const sanitized = sanitizeProposedConditions(parsed.conditions);

    expect(sanitized.dropped).toBe(0);
    expect(sanitized.conditions[0]).toMatchObject({
      field: "SUBJECT",
      operator: "CONTAINS",
    });
  });

  it("are deterministic", () => {
    expect(buildSummaryMockAnswer(context)).toBe(
      buildSummaryMockAnswer(buildMailAiContext(detail())),
    );
  });
});
