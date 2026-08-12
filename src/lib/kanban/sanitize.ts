import sanitizeHtml from "sanitize-html";

// Card descriptions are authored in the shared TipTap editor
// (src/components/mail/rich-text-editor.tsx), whose StarterKit is configured
// without headings, code, strike and horizontal rules — so the allow-list
// below is exactly the tag set that editor can emit, nothing wider.
//
// This is deliberately NOT sanitizeOutgoingMailHtml: that preset also allows
// `mailto:`, which belongs in a compose window and not on a task board.
const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    "p",
    "br",
    "strong",
    "b",
    "em",
    "i",
    "u",
    "ul",
    "ol",
    "li",
    "blockquote",
    "a",
  ],
  allowedAttributes: {
    a: ["href", "title", "rel", "target"],
  },
  allowedSchemes: ["http", "https"],
  allowProtocolRelative: false,
  transformTags: {
    // Descriptions render inside the card dialog; an external link must not
    // hand the opener a window reference.
    a: sanitizeHtml.simpleTransform("a", {
      rel: "noopener noreferrer",
      target: "_blank",
    }),
  },
};

export function sanitizeCardDescription(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

// An editor that has been focused and cleared still emits "<p></p>", which is
// not a description. Callers store null instead so "has a description" stays a
// simple null check everywhere downstream.
export function normalizeCardDescription(
  html: string | null | undefined,
): string | null {
  if (html === null || html === undefined) return null;
  const clean = sanitizeCardDescription(html);
  return clean.replace(/<[^>]*>/g, "").trim().length > 0 ? clean : null;
}
