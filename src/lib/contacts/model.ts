// The format-neutral contact shape every parser produces and every serializer
// consumes. It deliberately does not import from @/generated/prisma: keeping
// this module dependency-free is what lets the whole of src/lib/contacts stay
// unit-testable without a database, and keeps Prisma out of any bundle that
// happens to reach for a contact type.
//
// The mapping between ContactRecord and the Prisma rows lives in
// src/lib/services/contacts.ts, which is the only place that knows both.

export const CONTACT_FIELD_KINDS = [
  "EMAIL",
  "PHONE",
  "URL",
  "IM",
  "EVENT",
  "RELATION",
  "CUSTOM",
] as const;

export const CONTACT_PHOTO_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
] as const;

export type ContactFieldKind = (typeof CONTACT_FIELD_KINDS)[number];
export type ContactPhotoContentType =
  (typeof CONTACT_PHOTO_CONTENT_TYPES)[number];

export interface ContactFieldRecord {
  kind: ContactFieldKind;
  /**
   * Free-form. The well-known values the UI knows how to translate are
   * "home" | "work" | "mobile" | "main" | "fax" | "workFax" | "homeFax" |
   * "pager" | "other"; anything else is shown verbatim, which is how a label
   * survives a round-trip through a format that invented it.
   */
  label: string | null;
  value: string;
  isPrimary: boolean;
}

export interface ContactAddressRecord {
  label: string | null;
  poBox: string | null;
  extended: string | null;
  street: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
  /** The source's own one-line rendering, when it carried one. */
  formatted: string | null;
}

export interface ContactPhotoRecord {
  contentType: string;
  data: Uint8Array;
}

export interface ContactRecord {
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  phoneticFirst: string | null;
  phoneticMiddle: string | null;
  phoneticLast: string | null;
  nickname: string | null;
  /** Display override — vCard FN when it disagrees with N, Google "File As". */
  fileAs: string | null;
  organization: string | null;
  jobTitle: string | null;
  department: string | null;
  /** ISO-8601 date, or "--MM-DD" for the year-less birthdays vCard allows. */
  birthday: string | null;
  notes: string | null;
  starred: boolean;
  fields: ContactFieldRecord[];
  addresses: ContactAddressRecord[];
  /** Label *names*; ids are resolved against ContactLabel at import time. */
  labels: string[];
  photo: ContactPhotoRecord | null;
}

export function createEmptyContactRecord(): ContactRecord {
  return {
    prefix: null,
    firstName: null,
    middleName: null,
    lastName: null,
    suffix: null,
    phoneticFirst: null,
    phoneticMiddle: null,
    phoneticLast: null,
    nickname: null,
    fileAs: null,
    organization: null,
    jobTitle: null,
    department: null,
    birthday: null,
    notes: null,
    starred: false,
    fields: [],
    addresses: [],
    labels: [],
    photo: null,
  };
}

/** Trims and collapses a source value, turning blanks into null. */
export function cleanValue(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\s+/gu, " ").trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Same as cleanValue but keeps line breaks — for notes and formatted addresses. */
export function cleanMultilineValue(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;
  const trimmed = value.replace(/\r\n?/gu, "\n").trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function isAddressEmpty(address: ContactAddressRecord): boolean {
  return (
    address.poBox === null &&
    address.extended === null &&
    address.street === null &&
    address.city === null &&
    address.region === null &&
    address.postalCode === null &&
    address.country === null &&
    address.formatted === null
  );
}

/** A record with no name, no organization and no fields carries no information. */
export function isContactRecordEmpty(record: ContactRecord): boolean {
  return (
    record.fields.length === 0 &&
    record.addresses.length === 0 &&
    record.prefix === null &&
    record.firstName === null &&
    record.middleName === null &&
    record.lastName === null &&
    record.suffix === null &&
    record.nickname === null &&
    record.fileAs === null &&
    record.organization === null &&
    record.notes === null
  );
}
