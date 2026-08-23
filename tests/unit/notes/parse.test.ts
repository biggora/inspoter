import { describe, expect, it } from "vitest";

import {
  buildExcerpt,
  normalizeTagName,
  normalizeTitle,
  toPlainText,
} from "@/lib/notes/parse";

describe("normalizeTitle", () => {
  it("folds case so [[note]] and [[Note]] address the same note", () => {
    expect(normalizeTitle("Note")).toBe(normalizeTitle("note"));
  });

  it("normalizes to NFC so precomposed and decomposed forms match", () => {
    const precomposed = "Café"; // single codepoint "é" (NFC)
    const decomposed = "Café"; // "e" + combining acute accent (NFD)
    expect(precomposed).not.toBe(decomposed); // sanity: inputs really differ
    expect(normalizeTitle(precomposed)).toBe(normalizeTitle(decomposed));
  });

  it("collapses tabs, newlines and repeated spaces into one space", () => {
    expect(normalizeTitle("My\tNote\n\nTitle")).toBe("my note title");
    expect(normalizeTitle("My    Note")).toBe("my note");
  });

  it("trims leading and trailing whitespace", () => {
    expect(normalizeTitle("  My Note  ")).toBe("my note");
  });

  it("strips trailing dots", () => {
    expect(normalizeTitle("My Note.")).toBe("my note");
    expect(normalizeTitle("My Note...")).toBe("my note");
  });

  it("keeps dots that are not trailing", () => {
    expect(normalizeTitle("Mr. Smith")).toBe("mr. smith");
  });

  it("is idempotent", () => {
    const once = normalizeTitle("  My Note.  ");
    expect(normalizeTitle(once)).toBe(once);
  });

  it("returns an empty string for an empty input", () => {
    expect(normalizeTitle("")).toBe("");
  });
});

describe("normalizeTagName", () => {
  it("strips a leading #", () => {
    expect(normalizeTagName("#project")).toBe("project");
  });

  it("replaces internal spaces with a dash", () => {
    expect(normalizeTagName("my tag")).toBe("my-tag");
  });

  it("cuts out punctuation that is not in the allow-list", () => {
    expect(normalizeTagName("#Hello, World!")).toBe("hello-world");
  });

  it("keeps hierarchical tags as-is", () => {
    expect(normalizeTagName("parent/child")).toBe("parent/child");
  });

  it("folds case", () => {
    expect(normalizeTagName("Project")).toBe(normalizeTagName("project"));
  });

  it("is idempotent", () => {
    const once = normalizeTagName("#Hello World!");
    expect(normalizeTagName(once)).toBe(once);
  });
});

describe("toPlainText", () => {
  it("discards fenced code blocks entirely, including the fences", () => {
    const fence = "`".repeat(3);
    const markdown = `Before\n${fence}\nconst x = 1;\n${fence}\nAfter`;
    const result = toPlainText(markdown);
    expect(result).not.toContain("const x = 1");
    expect(result).not.toContain(fence);
    expect(result).toBe("Before After");
  });

  it("discards fenced code blocks delimited by tildes", () => {
    const fence = "~".repeat(3);
    const markdown = `${fence}\nsecret content\n${fence}`;
    expect(toPlainText(markdown)).not.toContain("secret content");
  });

  it("unwraps inline code but keeps its content", () => {
    expect(toPlainText("Run `npm install` first")).toBe(
      "Run npm install first",
    );
  });

  it("strips ATX heading markers", () => {
    expect(toPlainText("# Title")).toBe("Title");
    expect(toPlainText("### Subtitle")).toBe("Subtitle");
  });

  it("drops setext heading underlines", () => {
    expect(toPlainText("Title\n=====\nBody")).toBe("Title Body");
    expect(toPlainText("Title\n-----\nBody")).toBe("Title Body");
  });

  it("strips bold, italic and strikethrough markers", () => {
    expect(toPlainText("**bold** and __also bold__")).toBe(
      "bold and also bold",
    );
    expect(toPlainText("*italic* and _also italic_")).toBe(
      "italic and also italic",
    );
    expect(toPlainText("~~gone~~")).toBe("gone");
  });

  // CommonMark's intraword rule for "_"/"__" only fires when a letter,
  // digit or "_" sits directly against the delimiter, so identifiers with
  // underscores glued to other word characters keep their underscores;
  // "*" has no such restriction.
  it("keeps snake_case_variable intact in plain text", () => {
    expect(toPlainText("snake_case_variable")).toBe("snake_case_variable");
  });

  it("keeps pg_dump and max_connections intact in plain text", () => {
    expect(toPlainText("pg_dump and max_connections")).toBe(
      "pg_dump and max_connections",
    );
  });

  // A bare "__init__" is not distinguishable from "__bold__" — both are
  // left-flanking/right-flanking delimiter runs with nothing (a word
  // boundary) on either side, so every CommonMark-following renderer
  // strips it. An author who means the literal identifier writes it in
  // backticks instead, which the code-span protection below preserves.
  it("strips __init__ written as bare emphasis, matching CommonMark", () => {
    expect(toPlainText("__init__")).toBe("init");
  });

  it("keeps __init__ verbatim inside inline code", () => {
    expect(toPlainText("`__init__`")).toBe("__init__");
  });

  it("strips _italic_ when it appears as its own word", () => {
    expect(toPlainText("before _italic_ after")).toBe("before italic after");
  });

  it("strips __bold__ when it appears as its own word", () => {
    expect(toPlainText("before __bold__ after")).toBe("before bold after");
  });

  // Regression: the start/end of the string must count as a non-word
  // boundary for "_"/"__", same as CommonMark's "line edges count as
  // whitespace" flanking rule — otherwise a note starting or ending with
  // emphasis would show raw underscores in its preview.
  it("strips emphasis at the very start of the string", () => {
    expect(toPlainText("_Draft_ and more")).toBe("Draft and more");
  });

  it("strips emphasis at the very end of the string", () => {
    expect(toPlainText("a note ending in _emphasis_")).toBe(
      "a note ending in emphasis",
    );
  });

  it("keeps snake_case_var verbatim inside inline code", () => {
    expect(toPlainText("`snake_case_var`")).toBe("snake_case_var");
  });

  it("keeps unmatched asterisks verbatim inside inline code", () => {
    expect(toPlainText("`**kwargs`")).toBe("**kwargs");
  });

  it("does not turn link syntax inside inline code into a link", () => {
    expect(toPlainText("`[a](b)`")).toBe("[a](b)");
  });

  it("still strips *italic* written with asterisks", () => {
    expect(toPlainText("*italic*")).toBe("italic");
  });

  it("still strips an intraword * emphasis, unlike _", () => {
    expect(toPlainText("a*b*c")).toBe("abc");
  });

  it("turns links into their text", () => {
    expect(toPlainText("See [the docs](https://example.com/docs)")).toBe(
      "See the docs",
    );
  });

  it("turns images into their alt text", () => {
    expect(toPlainText("![a diagram](https://example.com/d.png)")).toBe(
      "a diagram",
    );
  });

  it("turns autolinks into the bare URL", () => {
    expect(toPlainText("<https://example.com>")).toBe("https://example.com");
  });

  it("strips blockquote markers", () => {
    expect(toPlainText("> quoted text")).toBe("quoted text");
  });

  it("strips list markers", () => {
    expect(toPlainText("- one\n- two")).toBe("one two");
    expect(toPlainText("1. first\n2. second")).toBe("first second");
  });

  it("drops horizontal rules", () => {
    expect(toPlainText("Before\n\n***\n\nAfter")).toBe("Before After");
  });

  it("strips raw HTML tags", () => {
    expect(toPlainText("<div>hello</div>")).toBe("hello");
  });

  it("resolves wiki-links to their target, or alias when present", () => {
    expect(toPlainText("See [[Project Plan]]")).toBe("See Project Plan");
    expect(toPlainText("See [[Project Plan|the plan]]")).toBe("See the plan");
  });

  it("collapses blank lines and normalizes whitespace", () => {
    expect(toPlainText("Line one\n\n\nLine   two")).toBe("Line one Line two");
  });
});

describe("buildExcerpt", () => {
  it("returns short text unchanged, without an ellipsis", () => {
    expect(buildExcerpt("Hello world")).toBe("Hello world");
  });

  it("truncates long text at a word boundary and appends an ellipsis", () => {
    const markdown = "word ".repeat(60).trim(); // 299 chars, well over 240
    const result = buildExcerpt(markdown);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(241);
    expect(result.slice(0, -1).endsWith(" ")).toBe(false);
  });

  it("hard-cuts a long word with no spaces", () => {
    const markdown = "a".repeat(300);
    const result = buildExcerpt(markdown, 10);
    expect(result).toBe(`${"a".repeat(10)}…`);
  });

  it("returns an empty string for empty input", () => {
    expect(buildExcerpt("")).toBe("");
  });

  it("respects a custom max length", () => {
    const markdown = "one two three four five";
    expect(buildExcerpt(markdown, 8)).toBe("one two…");
  });
});
