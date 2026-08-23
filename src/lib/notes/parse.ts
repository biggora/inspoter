// Pure text utilities for the Obsidian-like Notes section. No Prisma, no
// React, no next-intl, no I/O — this module is shared as-is by server
// services and client components. Wiki-link resolution and tag-graph
// extraction belong to a later slice and are intentionally not here.

// normalizeTitle is the addressing key for a note: two raw titles collide
// (and therefore refer to the same note) exactly when this function maps
// them to the same string. It must be deterministic and idempotent.
export function normalizeTitle(raw: string): string {
  const collapsed = raw.normalize("NFC").replace(/\s+/gu, " ").trim();
  // toLocaleLowerCase() (no locale argument) follows the runtime's default
  // locale, whereas toLowerCase() always applies the locale-invariant
  // Unicode mapping. This matters for Turkish: under a tr-* default locale
  // "I" case-folds to the dotless "ı", not "i", so a locale-invariant
  // toLowerCase() would fold "Istanbul" and "istanbul" to two different
  // normalized titles while toLocaleLowerCase() keeps them consistent with
  // what the user actually sees and types.
  const lower = collapsed.toLocaleLowerCase();
  // Trailing dots are stripped for Windows filename compatibility (Explorer
  // and the Win32 APIs silently drop a trailing "." from file names, which
  // matters if notes are ever exported to disk); dots inside the title
  // ("Mr. Smith") are ordinary punctuation and must survive.
  const withoutTrailingDots = lower.replace(/\.+$/u, "");
  return withoutTrailingDots.trim();
}

// Same addressing idea as normalizeTitle, but for a single tag token: NFC,
// casefold, a stripped leading "#", spaces collapsed into "-" (tags are
// single tokens, not phrases), and only letters/digits/"_"/"/"/"-" survive.
// Hierarchical tags ("parent/child") are preserved as-is.
export function normalizeTagName(raw: string): string {
  const withoutHash = raw.trim().normalize("NFC").replace(/^#+/u, "");
  const dashed = withoutHash.toLocaleLowerCase().replace(/\s+/gu, "-");
  // Keep letters, digits, "_", "/" (hierarchy separator) and "-"; anything
  // else (punctuation, emoji, ...) is cut rather than substituted.
  return dashed.replace(/[^\p{L}\p{N}_/-]/gu, "");
}

// Fenced code blocks: fence lines and everything between them are dropped
// outright — code samples are not part of a readable preview.
const FENCE_RE =
  /^[ \t]{0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gmu;
// Inline code spans, matched before any other inline pass so their literal
// content never gets parsed as markdown or HTML.
const INLINE_CODE_RE = /`([^`]+)`/gu;
// The NUL control character can't occur in text authored through the app's
// editor, and none of the regexes below can match, consume or emit it (no
// digit-dot, bracket, angle-bracket, "*", "_" or "~" appears in it), so it
// is a safe placeholder delimiter for protected code-span content while
// the rest of this function runs — unlike plain spaces, which real prose
// numbers ("wait 3 seconds") could collide with. Built via
// String.fromCharCode rather than a literal escape so the character stays
// out of this file's raw bytes.
const NUL = String.fromCharCode(0);
const CODE_PLACEHOLDER_RE = new RegExp(`${NUL}(\\d+)${NUL}`, "gu");
// Setext underlines ("===" / "---") and horizontal rules ("---", "***",
// "___") are both "a line made of 2+ repeated marker characters".
const SETEXT_OR_HR_RE = /^[ \t]{0,3}([=\-_*])\1+[ \t]*$/gmu;
// ATX headings: only the leading "#" marker(s) are stripped.
const ATX_HEADING_RE = /^[ \t]{0,3}#{1,6}[ \t]+/gmu;
// One or more nested "> " blockquote markers at line start.
const BLOCKQUOTE_RE = /^[ \t]{0,3}(?:>[ \t]?)+/gmu;
// "-", "*", "+" or "1." — only when followed by a space, so "*italic*" at
// line start is left alone for the emphasis pass below.
const LIST_MARKER_RE = /^[ \t]{0,3}(?:[-*+]|\d+\.)[ \t]+/gmu;
const IMAGE_RE = /!\[([^\]]*)\]\([^)]*\)/gu;
const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/gu;
const LINK_RE = /\[([^\]]*)\]\([^)]*\)/gu;
const AUTOLINK_RE = /<(https?:\/\/[^\s>]+)>/gu;
const HTML_TAG_RE = /<[^>]+>/gu;
// CommonMark restricts "_"/"__" emphasis to non-intraword positions, which
// is what keeps identifiers such as snake_case_variable or pg_dump intact
// as ordinary text: an opening "_" only counts as a delimiter when it is
// NOT immediately preceded by a letter/digit/"_", and a closing "_" only
// counts when it is NOT immediately followed by one. The start and end of
// the string count as a non-word boundary too (there is no character to
// violate the negative lookaround), so emphasis at the very edges of the
// text still gets stripped, same as CommonMark's "beginning/end of line
// counts as whitespace" flanking rule. A bare "__init__" is therefore
// treated as emphasis ("init"), matching every CommonMark renderer; an
// author who wants the literal dunder writes it in backticks, which the
// code-span protection above already preserves verbatim. "*" has no
// intraword restriction in CommonMark and is left as-is.
const UNDERSCORE_BOLD_RE = /(?<![\p{L}\p{N}_])__([^_]+)__(?![\p{L}\p{N}_])/gu;
const UNDERSCORE_ITALIC_RE = /(?<![\p{L}\p{N}_])_([^_]+)_(?![\p{L}\p{N}_])/gu;

// Strips markdown down to readable prose for previews and snippets.
// Implemented with regexes only (no remark/marked/markdown-it dependency),
// so it is a best-effort subset of CommonMark rather than a full parser.
export function toPlainText(markdown: string): string {
  let text = markdown.replace(/\r\n?/g, "\n");

  text = text.replace(FENCE_RE, "");

  // Inline code spans are protected right after fenced blocks are removed
  // and before any other inline pass runs, so their literal content —
  // snake_case identifiers, "**stars**", "[a](b)", "<tags>" — survives
  // every later regex untouched instead of being parsed as markdown/HTML.
  const codeSpans: string[] = [];
  text = text.replace(INLINE_CODE_RE, (_match, code: string) => {
    codeSpans.push(code);
    return `${NUL}${codeSpans.length - 1}${NUL}`;
  });

  text = text.replace(SETEXT_OR_HR_RE, "");
  text = text.replace(ATX_HEADING_RE, "");
  text = text.replace(BLOCKQUOTE_RE, "");
  text = text.replace(LIST_MARKER_RE, "");

  // Images before links: "![alt](url)" would otherwise be mistaken for a
  // link whose text is "!" plus the alt text.
  text = text.replace(IMAGE_RE, "$1");
  text = text.replace(
    WIKI_LINK_RE,
    (_match, target: string, alias?: string) => alias ?? target,
  );
  text = text.replace(LINK_RE, "$1");
  text = text.replace(AUTOLINK_RE, "$1");

  // Double markers first so "**bold**" is not mistaken for two "*italic*".
  text = text
    .replace(/\*\*([^*]+)\*\*/gu, "$1")
    .replace(UNDERSCORE_BOLD_RE, "$1")
    .replace(/~~([^~]+)~~/gu, "$1")
    .replace(/\*([^*]+)\*/gu, "$1")
    .replace(UNDERSCORE_ITALIC_RE, "$1");

  text = text.replace(HTML_TAG_RE, "");

  // Restore protected code spans verbatim now that no further markdown or
  // HTML processing will run over the text.
  text = text.replace(
    CODE_PLACEHOLDER_RE,
    (_match, index: string) => codeSpans[Number(index)] ?? "",
  );

  // Collapse to a flowing, single-line preview: normalize inner spaces per
  // line, drop blank lines, join what remains with a single space.
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/gu, " ").trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .trim();
}

// Plain-text excerpt cut at a word boundary, never mid-word, with a single
// horizontal-ellipsis codepoint appended when truncated.
export function buildExcerpt(markdown: string, max = 240): string {
  const text = toPlainText(markdown);
  if (text.length <= max) return text;

  const sliced = text.slice(0, max);
  const lastSpace = sliced.lastIndexOf(" ");
  const cut = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${cut}…`;
}
