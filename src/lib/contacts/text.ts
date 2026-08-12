// Byte-level plumbing shared by every importer. Contact files come off real
// phones and desktop clients, so they arrive in whatever encoding that client
// used a decade ago: UTF-16 with a BOM from Windows Contacts, windows-1251
// from a Russian-locale Nokia export, plain UTF-8 from everything modern.

const UTF8_BOM = [0xef, 0xbb, 0xbf];
const UTF16LE_BOM = [0xff, 0xfe];
const UTF16BE_BOM = [0xfe, 0xff];

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  return prefix.every((byte, index) => bytes[index] === byte);
}

function tryDecode(
  bytes: Uint8Array,
  encoding: string,
  fatal: boolean,
): string | null {
  try {
    return new TextDecoder(encoding, { fatal }).decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Decodes an uploaded file. A BOM wins outright; an explicit charset (vCard
 * 2.1's CHARSET parameter, an HTTP-style hint) comes next; otherwise the bytes
 * are tried as strict UTF-8 and, when that fails, as the two single-byte
 * encodings a legacy address book is realistically written in. Nothing throws:
 * the worst case is lossy UTF-8, which still yields an importable file.
 */
export function decodeText(bytes: Uint8Array, charsetHint?: string): string {
  if (startsWith(bytes, UTF8_BOM)) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (startsWith(bytes, UTF16LE_BOM)) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (startsWith(bytes, UTF16BE_BOM)) {
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  }

  if (charsetHint) {
    const decoded = tryDecode(bytes, charsetHint.toLowerCase(), false);
    if (decoded !== null) return decoded;
  }

  return (
    tryDecode(bytes, "utf-8", true) ??
    tryDecode(bytes, "windows-1251", true) ??
    tryDecode(bytes, "windows-1252", true) ??
    new TextDecoder("utf-8").decode(bytes)
  );
}

/**
 * Splits into physical lines, accepting CRLF, LF and the bare CR that classic
 * Mac exports still use.
 */
export function splitLines(text: string): string[] {
  return text.split(/\r\n|\r|\n/u);
}

/**
 * RFC 2425 §5.8.1 line unfolding, shared by vCard and LDIF: a line that starts
 * with a single space or tab continues the previous one.
 */
export function unfoldLines(lines: readonly string[]): string[] {
  const unfolded: string[] = [];
  for (const line of lines) {
    if (
      unfolded.length > 0 &&
      (line.startsWith(" ") || line.startsWith("\t"))
    ) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }
  return unfolded;
}

/**
 * Folds a logical line to `limit` octets per physical line with a single-space
 * continuation, never splitting a UTF-8 code point (RFC 6350 §3.2 counts
 * octets, not characters — a Cyrillic name is two octets per letter).
 */
export function foldLine(line: string, limit = 75): string {
  const segments: string[] = [];
  let current = "";
  let currentBytes = 0;
  // Iterating the string yields whole code points, so surrogate pairs stay put.
  for (const char of line) {
    const charBytes = Buffer.byteLength(char, "utf8");
    // Continuation lines spend one octet on the leading space.
    const max = segments.length === 0 ? limit : limit - 1;
    if (currentBytes + charBytes > max) {
      segments.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  segments.push(current);
  return segments
    .map((segment, index) => (index === 0 ? segment : ` ${segment}`))
    .join("\r\n");
}

/** Decodes a quoted-printable body to raw bytes (vCard 2.1 ENCODING=QUOTED-PRINTABLE). */
export function decodeQuotedPrintable(value: string): Uint8Array {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char !== "=") {
      // Anything outside Latin-1 here means the producer lied about the
      // encoding; push its UTF-8 bytes rather than dropping the character.
      if (char.codePointAt(0)! < 0x100) {
        bytes.push(char.charCodeAt(0));
      } else {
        bytes.push(...Buffer.from(char, "utf8"));
      }
      continue;
    }
    const hex = value.slice(index + 1, index + 3);
    if (/^[0-9A-Fa-f]{2}$/u.test(hex)) {
      bytes.push(Number.parseInt(hex, 16));
      index += 2;
    } else {
      bytes.push(char.charCodeAt(0));
    }
  }
  return Uint8Array.from(bytes);
}

/** Encodes text as quoted-printable — only used by the vCard 2.1 test fixtures. */
export function encodeQuotedPrintable(value: string): string {
  return [...Buffer.from(value, "utf8")]
    .map((byte) =>
      byte >= 33 && byte <= 126 && byte !== 61
        ? String.fromCharCode(byte)
        : byte === 32
          ? " "
          : `=${byte.toString(16).toUpperCase().padStart(2, "0")}`,
    )
    .join("");
}
