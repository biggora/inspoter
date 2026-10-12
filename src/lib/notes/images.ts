// Note images: validation and URL/markdown helpers shared by the upload route,
// the note-images service and the editor. Pure on purpose (no Node-only or
// database imports) so client code can import it too.
//
// An image is stored in the database and referenced from note content as
// ![alt](/api/notes/images/<id>). Only the exact relative form is ever
// recognised: an absolute URL, a data: URL or an SVG would let a note pull
// third-party or active content into the same-origin page.

export const NOTE_IMAGE_MAX_BYTES = 2_097_152;

export const NOTE_IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export type NoteImageContentType = (typeof NOTE_IMAGE_CONTENT_TYPES)[number];

export const NOTE_IMAGE_URL_PREFIX = "/api/notes/images/";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE = [0xff, 0xd8, 0xff];
const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

function hasBytesAt(
  bytes: Uint8Array,
  offset: number,
  expected: number[],
): boolean {
  if (bytes.length < offset + expected.length) return false;
  return expected.every((value, index) => bytes[offset + index] === value);
}

// Decides the type from the leading bytes alone. The declared upload type and
// the filename are never consulted: they are attacker-controlled, and a file
// named .png that is really HTML or SVG must not be stored or served as an
// image.
export function detectNoteImageType(
  bytes: Uint8Array,
): NoteImageContentType | null {
  if (hasBytesAt(bytes, 0, PNG_SIGNATURE)) return "image/png";
  if (hasBytesAt(bytes, 0, JPEG_SIGNATURE)) return "image/jpeg";
  if (hasBytesAt(bytes, 0, RIFF) && hasBytesAt(bytes, 8, WEBP)) {
    return "image/webp";
  }
  return null;
}

export function noteImageUrl(id: string): string {
  return `${NOTE_IMAGE_URL_PREFIX}${id}`;
}

// The id shape Prisma's cuid() default produces: "c" plus 24 base-36
// characters. Anchored on both ends, so a query string, fragment, traversal
// segment or trailing slash fails the match.
const NOTE_IMAGE_URL_PATTERN = /^\/api\/notes\/images\/(c[a-z0-9]{24})$/;

export function isNoteImageUrl(src: string): boolean {
  return NOTE_IMAGE_URL_PATTERN.test(src);
}

// Brackets and backslashes are dropped rather than escaped: the editor's
// markdown serializer writes alt text back unescaped on save, so an escaped
// "]" would turn into a bare one and cut the image off from its URL. Dropping
// them keeps the alt identical before and after that round trip. Parentheses,
// "<" and backticks cannot end the alt text, so they stay escaped. Line breaks
// and tabs collapse to a space because an alt text spanning lines would break
// the single-line image syntax.
function sanitizeAlt(alt: string): string {
  return alt
    .replace(/[\\[\]]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[()<`]/g, (char) => `\\${char}`);
}

export function noteImageMarkdown(id: string, alt = ""): string {
  return `![${sanitizeAlt(alt)}](${noteImageUrl(id)})`;
}

// Group 1 is the destination. The alt part accepts backslash escapes so an
// escaped "]" inside it does not end the match early.
const IMAGE_REFERENCE_PATTERN =
  /!\[(?:\\.|[^\]\\])*\]\(\s*([^\s)]+)(?:\s+"[^"]*")?\s*\)/g;

// Unique ids of the note images a markdown body references, in order of first
// appearance. Anything that is not exactly a note image URL (external images,
// data: URLs, lookalike paths) is ignored.
export function extractNoteImageIds(markdown: string): string[] {
  const ids = new Set<string>();
  for (const match of markdown.matchAll(IMAGE_REFERENCE_PATTERN)) {
    const src = match[1];
    if (src && isNoteImageUrl(src)) {
      ids.add(src.slice(NOTE_IMAGE_URL_PREFIX.length));
    }
  }
  return [...ids];
}
