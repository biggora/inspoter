// Lexical layer of the vCard reader: turns a file into properties, without any
// idea of what a TEL or an ADR means. Everything version-specific about
// *syntax* lives here (2.1's bare type parameters and quoted-printable soft
// breaks, 3.0/4.0's quoted parameter values); everything version-specific about
// *meaning* lives in ./parse.ts.

import { decodeQuotedPrintable, decodeText, splitLines } from "../text";

export interface VCardProperty {
  /** Apple/Google grouping prefix, as in `item1.X-ABLabel`. */
  group: string | null;
  /** Upper-cased property name. */
  name: string;
  /** Upper-cased parameter name to its values, already comma-split. */
  params: Map<string, string[]>;
  /**
   * Decoded but still escaped: quoted-printable is undone and the charset
   * applied, while `\,` and `\;` survive so structured values can be split on
   * the unescaped separators.
   */
  value: string;
}

/**
 * Joins folded and quoted-printable-continued lines into logical ones. Two
 * different continuation rules are in play: RFC 2425 folding (next line starts
 * with whitespace) and vCard 2.1's soft line break (this line ends with "=" and
 * the property is quoted-printable).
 */
function toLogicalLines(lines: readonly string[]): string[] {
  const logical: string[] = [];
  let pendingQuotedPrintable = false;

  for (const line of lines) {
    const previous = logical[logical.length - 1];

    if (pendingQuotedPrintable && previous !== undefined) {
      logical[logical.length - 1] = previous.slice(0, -1) + line.trimStart();
      pendingQuotedPrintable = logical[logical.length - 1].endsWith("=");
      continue;
    }

    if (
      previous !== undefined &&
      (line.startsWith(" ") || line.startsWith("\t"))
    ) {
      logical[logical.length - 1] = previous + line.slice(1);
      continue;
    }

    logical.push(line);
    pendingQuotedPrintable =
      line.endsWith("=") && /quoted-printable/iu.test(line.split(":", 1)[0]);
  }

  return logical.filter((line) => line.trim().length > 0);
}

/** Index of the first colon that is not inside a quoted parameter value. */
function findValueSeparator(line: string): number {
  let inQuotes = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ":" && !inQuotes) return index;
  }
  return -1;
}

/** Splits on `;` outside quotes — the parameter separator. */
function splitParameters(head: string): string[] {
  const parts: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const char of head) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (char === ";" && !inQuotes) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

// vCard 2.1 writes `TEL;HOME;VOICE:` — a bare word is a TYPE unless it is one
// of the encodings, which 2.1 also allows to appear bare.
const BARE_ENCODINGS = new Set([
  "BASE64",
  "QUOTED-PRINTABLE",
  "7BIT",
  "8BIT",
  "B",
]);

function addParam(
  params: Map<string, string[]>,
  key: string,
  values: readonly string[],
): void {
  const existing = params.get(key) ?? [];
  params.set(key, [...existing, ...values]);
}

function parseHead(
  head: string,
): Pick<VCardProperty, "group" | "name" | "params"> {
  const [nameToken, ...parameterTokens] = splitParameters(head);
  const dotIndex = nameToken.indexOf(".");
  const group = dotIndex > 0 ? nameToken.slice(0, dotIndex) : null;
  const name = (dotIndex > 0 ? nameToken.slice(dotIndex + 1) : nameToken)
    .trim()
    .toUpperCase();

  const params = new Map<string, string[]>();
  for (const token of parameterTokens) {
    const equalsIndex = token.indexOf("=");
    if (equalsIndex === -1) {
      const bare = token.trim().toUpperCase();
      if (bare.length === 0) continue;
      addParam(params, BARE_ENCODINGS.has(bare) ? "ENCODING" : "TYPE", [bare]);
      continue;
    }
    const key = token.slice(0, equalsIndex).trim().toUpperCase();
    const values = token
      .slice(equalsIndex + 1)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    addParam(params, key, values);
  }

  return { group, name, params };
}

function decodeValue(value: string, params: Map<string, string[]>): string {
  const encoding = params.get("ENCODING")?.[0]?.toUpperCase();
  if (encoding === "QUOTED-PRINTABLE") {
    const charset = params.get("CHARSET")?.[0];
    return decodeText(decodeQuotedPrintable(value), charset);
  }
  // BASE64/B values (photos) are handed on verbatim; only the property that
  // knows what the bytes are supposed to be can decode them.
  return value;
}

/**
 * Splits a file into cards and each card into properties. A file holding
 * several vCards (the normal shape of an address-book export) yields one array
 * per BEGIN:VCARD block; properties outside a block are ignored.
 */
export function tokenizeVCards(text: string): VCardProperty[][] {
  const cards: VCardProperty[][] = [];
  let current: VCardProperty[] | null = null;

  for (const line of toLogicalLines(splitLines(text))) {
    const separator = findValueSeparator(line);
    if (separator === -1) continue;

    const { group, name, params } = parseHead(line.slice(0, separator));
    const rawValue = line.slice(separator + 1);

    if (name === "BEGIN") {
      if (rawValue.trim().toUpperCase() === "VCARD") current = [];
      continue;
    }
    if (name === "END") {
      if (current !== null && rawValue.trim().toUpperCase() === "VCARD") {
        cards.push(current);
        current = null;
      }
      continue;
    }
    if (current === null) continue;

    current.push({ group, name, params, value: decodeValue(rawValue, params) });
  }

  // A file whose last card is missing its END is still worth importing.
  if (current !== null && current.length > 0) cards.push(current);
  return cards;
}

/** Undoes `\\`, `\;`, `\,` and `\n` escaping (RFC 6350 §3.4). */
export function unescapeValue(value: string): string {
  return value.replace(/\\(.)/gu, (_match, char: string) =>
    char === "n" || char === "N" ? "\n" : char,
  );
}

/** Splits a structured value on unescaped `;` (N, ADR, ORG). */
export function splitComponents(value: string): string[] {
  return splitUnescaped(value, ";");
}

/** Splits a multi-value component on unescaped `,` (CATEGORIES, NICKNAME). */
export function splitValues(value: string): string[] {
  return splitUnescaped(value, ",");
}

function splitUnescaped(value: string, separator: string): string[] {
  const parts: string[] = [];
  let current = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (char === "\\") {
      current += char + (value[index + 1] ?? "");
      index += 1;
      continue;
    }
    if (char === separator) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}
