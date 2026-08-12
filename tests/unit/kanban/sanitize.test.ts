import { describe, expect, it } from "vitest";

import {
  normalizeCardDescription,
  sanitizeCardDescription,
} from "@/lib/kanban/sanitize";

describe("sanitizeCardDescription", () => {
  it("keeps the tags the shared editor can emit", () => {
    const html =
      "<p><strong>Bold</strong> <em>italic</em> <u>underline</u></p><ul><li>one</li></ul><blockquote>quote</blockquote>";
    expect(sanitizeCardDescription(html)).toBe(html);
  });

  it("strips scripts and event handlers", () => {
    expect(sanitizeCardDescription("<p>ok</p><script>alert(1)</script>")).toBe(
      "<p>ok</p>",
    );
    expect(sanitizeCardDescription('<p onclick="steal()">ok</p>')).toBe(
      "<p>ok</p>",
    );
  });

  it("drops headings and code, which the editor cannot produce", () => {
    expect(sanitizeCardDescription("<h1>Title</h1>")).toBe("Title");
    expect(sanitizeCardDescription("<code>rm -rf</code>")).toBe("rm -rf");
  });

  it("allows http(s) links and hardens them", () => {
    const output = sanitizeCardDescription(
      '<p><a href="https://example.com">link</a></p>',
    );
    expect(output).toContain('href="https://example.com"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).toContain('target="_blank"');
  });

  // Unlike the mail preset, mailto: has no place on a task board.
  it("rejects javascript: and mailto: links", () => {
    expect(
      sanitizeCardDescription('<p><a href="javascript:alert(1)">x</a></p>'),
    ).not.toContain("javascript:");
    expect(
      sanitizeCardDescription('<p><a href="mailto:a@b.c">x</a></p>'),
    ).not.toContain("mailto:");
  });
});

describe("normalizeCardDescription", () => {
  it("passes null and undefined through as null", () => {
    expect(normalizeCardDescription(null)).toBe(null);
    expect(normalizeCardDescription(undefined)).toBe(null);
  });

  // A focused-then-cleared editor still emits "<p></p>", which is not a
  // description — storing it would make "has a description" always true.
  it("treats markup with no text as no description", () => {
    expect(normalizeCardDescription("<p></p>")).toBe(null);
    expect(normalizeCardDescription("<p><br></p>")).toBe(null);
    expect(normalizeCardDescription("   ")).toBe(null);
  });

  it("keeps sanitized markup that carries text", () => {
    expect(normalizeCardDescription("<p>Real text</p>")).toBe(
      "<p>Real text</p>",
    );
  });
});
