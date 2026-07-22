import sanitizeHtml from "sanitize-html";

interface OriginalMailContent {
  fromAddress: string;
  fromName: string | null;
  subject: string;
  receivedAt: Date;
  bodyText: string;
  bodyHtml: string | null;
}

export type OriginalMailMode = "reply" | "forward";

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
    a: ["href", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowProtocolRelative: false,
};

export function sanitizeOutgoingMailHtml(html: string): string {
  return sanitizeHtml(html, SANITIZE_OPTIONS);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function textToHtml(value: string): string {
  return escapeHtml(value).replaceAll("\n", "<br>");
}

function quoteText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function sender(original: OriginalMailContent): string {
  return original.fromName
    ? `${original.fromName} <${original.fromAddress}>`
    : original.fromAddress;
}

export function buildOutgoingMailContent(input: {
  bodyText: string;
  bodyHtml: string;
  original?: OriginalMailContent;
  originalMode?: OriginalMailMode;
}): { text: string; html: string } {
  const cleanBodyHtml = sanitizeOutgoingMailHtml(input.bodyHtml);
  if (!input.original || !input.originalMode) {
    return { text: input.bodyText, html: cleanBodyHtml };
  }

  const original = input.original;
  const originalHtml = sanitizeOutgoingMailHtml(
    original.bodyHtml || textToHtml(original.bodyText),
  );
  const date = original.receivedAt.toISOString();
  const from = sender(original);

  if (input.originalMode === "reply") {
    return {
      text: `${input.bodyText.trimEnd()}\n\nOn ${date}, ${from} wrote:\n${quoteText(original.bodyText)}`,
      html: sanitizeOutgoingMailHtml(
        `${cleanBodyHtml}<br><p>On ${escapeHtml(date)}, ${escapeHtml(from)} wrote:</p><blockquote>${originalHtml}</blockquote>`,
      ),
    };
  }

  const forwardedHeader = [
    "---------- Forwarded message ----------",
    `From: ${from}`,
    `Date: ${date}`,
    `Subject: ${original.subject}`,
  ].join("\n");

  return {
    text: `${input.bodyText.trimEnd()}\n\n${forwardedHeader}\n\n${original.bodyText}`,
    html: sanitizeOutgoingMailHtml(
      `${cleanBodyHtml}<br><p>---------- Forwarded message ----------<br><strong>From:</strong> ${escapeHtml(from)}<br><strong>Date:</strong> ${escapeHtml(date)}<br><strong>Subject:</strong> ${escapeHtml(original.subject)}</p><blockquote>${originalHtml}</blockquote>`,
    ),
  };
}
