// The single entry point the service layer uses: hand it the uploaded bytes,
// get back records and the format they came in as. Format sniffing beats
// trusting the extension — a .txt holding a vCard and a .csv that is really
// Outlook's are both normal.

import { parseCsv } from "./csv/rfc4180";
import {
  isGoogleCsvHeader,
  parseGoogleCsv,
  serializeGoogleCsv,
} from "./csv/google";
import {
  isOutlookCsvHeader,
  parseOutlookCsv,
  serializeOutlookCsv,
} from "./csv/outlook";
import { isLdif, parseLdif, serializeLdif } from "./ldif";
import type { ContactRecord } from "./model";
import { decodeText } from "./text";
import { parseVCard } from "./vcard/parse";
import { serializeVCards } from "./vcard/serialize";

export const CONTACT_IMPORT_FORMATS = [
  "vcard",
  "google-csv",
  "outlook-csv",
  "ldif",
] as const;

export type ContactImportFormat = (typeof CONTACT_IMPORT_FORMATS)[number];

export const CONTACT_EXPORT_FORMATS = [
  "vcard-3.0",
  "vcard-4.0",
  "google-csv",
  "outlook-csv",
  "ldif",
] as const;

export type ContactExportFormat = (typeof CONTACT_EXPORT_FORMATS)[number];

export class UnknownContactFormatError extends Error {
  constructor() {
    super("The file is not a recognized contacts format.");
    this.name = "UnknownContactFormatError";
  }
}

/**
 * Identifies the format from the content. Returns null rather than guessing
 * when nothing matches, so the caller can say "unrecognized file" instead of
 * importing garbage.
 */
export function detectContactFormat(text: string): ContactImportFormat | null {
  const head = text.slice(0, 4096);
  if (/BEGIN\s*:\s*VCARD/iu.test(head)) return "vcard";
  if (isLdif(head)) return "ldif";

  const [header] = parseCsv(head);
  if (header !== undefined && header.length > 1) {
    if (isGoogleCsvHeader(header)) return "google-csv";
    if (isOutlookCsvHeader(header)) return "outlook-csv";
  }
  return null;
}

export function parseContacts(
  text: string,
  format: ContactImportFormat,
): ContactRecord[] {
  switch (format) {
    case "vcard":
      return parseVCard(text);
    case "google-csv":
      return parseGoogleCsv(text);
    case "outlook-csv":
      return parseOutlookCsv(text);
    case "ldif":
      return parseLdif(text);
  }
}

export interface ParsedContactsFile {
  format: ContactImportFormat;
  contacts: ContactRecord[];
}

/**
 * Decodes and parses an uploaded file. `format` overrides sniffing for the
 * case where an operator knows better than the heuristic.
 */
export function parseContactsFile(
  bytes: Uint8Array,
  format?: ContactImportFormat,
): ParsedContactsFile {
  const text = decodeText(bytes);
  const resolved = format ?? detectContactFormat(text);
  if (resolved === null) throw new UnknownContactFormatError();
  return { format: resolved, contacts: parseContacts(text, resolved) };
}

export interface SerializedContactsFile {
  content: string;
  contentType: string;
  fileExtension: string;
}

export function serializeContacts(
  records: readonly ContactRecord[],
  format: ContactExportFormat,
): SerializedContactsFile {
  switch (format) {
    case "vcard-3.0":
      return {
        content: serializeVCards(records, "3.0"),
        contentType: "text/vcard; charset=utf-8",
        fileExtension: "vcf",
      };
    case "vcard-4.0":
      return {
        content: serializeVCards(records, "4.0"),
        contentType: "text/vcard; charset=utf-8",
        fileExtension: "vcf",
      };
    case "google-csv":
      return {
        content: serializeGoogleCsv(records),
        contentType: "text/csv; charset=utf-8",
        fileExtension: "csv",
      };
    case "outlook-csv":
      return {
        content: serializeOutlookCsv(records),
        contentType: "text/csv; charset=utf-8",
        fileExtension: "csv",
      };
    case "ldif":
      return {
        content: serializeLdif(records),
        contentType: "text/plain; charset=utf-8",
        fileExtension: "ldif",
      };
  }
}
