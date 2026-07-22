import { describe, expect, it } from "vitest";

import {
  buildOutgoingMailContent,
  sanitizeOutgoingMailHtml,
} from "@/lib/mail-message-content";

const original = {
  fromAddress: "sender@example.com",
  fromName: "Sender",
  subject: "Original subject",
  receivedAt: new Date("2026-07-21T09:30:00.000Z"),
  bodyText: "Original\nmessage",
  bodyHtml: '<p style="color:red">Original <img src=x onerror=alert(1)></p>',
};

describe("outgoing mail content", () => {
  it("keeps supported formatting and removes unsafe markup", () => {
    expect(
      sanitizeOutgoingMailHtml(
        '<p style="color:red"><strong>Hello</strong><script>alert(1)</script><a href="javascript:alert(1)">bad</a></p>',
      ),
    ).toBe("<p><strong>Hello</strong><a>bad</a></p>");
  });

  it("adds a sanitized, non-editable original quote to replies", () => {
    const content = buildOutgoingMailContent({
      bodyText: "Reply",
      bodyHtml: "<p><em>Reply</em></p>",
      original,
      originalMode: "reply",
    });

    expect(content.text).toContain("Sender <sender@example.com> wrote:");
    expect(content.text).toContain("> Original\n> message");
    expect(content.html).toContain("<blockquote><p>Original </p></blockquote>");
    expect(content.html).not.toContain("style=");
    expect(content.html).not.toContain("<img");
  });

  it("adds forwarded-message metadata without reply threading", () => {
    const content = buildOutgoingMailContent({
      bodyText: "FYI",
      bodyHtml: "<p>FYI</p>",
      original,
      originalMode: "forward",
    });

    expect(content.text).toContain("---------- Forwarded message ----------");
    expect(content.text).toContain("Subject: Original subject");
    expect(content.html).toContain(
      "<strong>Subject:</strong> Original subject",
    );
  });
});
