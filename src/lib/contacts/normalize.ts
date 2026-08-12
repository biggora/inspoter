// Derived values: everything the database stores but nobody types. Kept in one
// pure module so the service layer, the duplicate finder and the importers all
// agree on what "the same email" or "the same person" means.

import type { ContactFieldRecord, ContactRecord } from "./model";

const EMAIL_IN_ANGLE_BRACKETS = /<([^<>]+)>\s*$/u;

/**
 * Lowercased bare address. Accepts the "Display Name <a@b.c>" form mail
 * clients paste, because that is what lands in the field when an operator
 * copies a recipient out of a message header.
 */
export function normalizeEmail(value: string): string | null {
  const inBrackets = EMAIL_IN_ANGLE_BRACKETS.exec(value.trim());
  const candidate = (inBrackets ? inBrackets[1] : value).trim().toLowerCase();
  return candidate.includes("@") && !/\s/u.test(candidate) ? candidate : null;
}

/** Digits only, keeping a leading "+" so an international number stays one. */
export function normalizePhone(value: string): string | null {
  const digits = value.replace(/[^\d+]/gu, "").replace(/(?!^)\+/gu, "");
  const bare = digits.startsWith("+") ? digits.slice(1) : digits;
  return bare.length >= 3 ? digits : null;
}

/**
 * The comparison key for "is this the same number". The same line gets written
 * with and without its country code depending on which device exported it, so
 * only the last eight significant digits are compared: long enough to keep
 * distinct subscriber numbers apart, short enough that +371 20 000 001 and
 * 20 000 001 land on the same key. It only ever feeds the merge screen, which
 * asks before it acts, so an occasional over-match costs a decline.
 */
const PHONE_KEY_DIGITS = 8;

export function phoneDuplicateKey(value: string): string | null {
  const normalized = normalizePhone(value);
  if (normalized === null) return null;
  const digits = normalized.replace(/\D/gu, "");
  return digits.length <= PHONE_KEY_DIGITS
    ? digits
    : digits.slice(-PHONE_KEY_DIGITS);
}

/** The normalized form stored on ContactField.normalizedValue. */
export function normalizeFieldValue(
  field: Pick<ContactFieldRecord, "kind" | "value">,
): string | null {
  if (field.kind === "EMAIL") return normalizeEmail(field.value);
  if (field.kind === "PHONE") return normalizePhone(field.value);
  return null;
}

function joinNameParts(record: ContactRecord): string {
  return [record.prefix, record.firstName, record.middleName, record.lastName]
    .filter((part): part is string => part !== null && part.length > 0)
    .join(" ")
    .concat(record.suffix ? `, ${record.suffix}` : "")
    .trim();
}

/**
 * What the list and the detail header show. Mirrors the order Google falls
 * back through, so an import of contacts that are only an email address still
 * reads as something rather than as a blank row.
 */
export function buildDisplayName(record: ContactRecord): string {
  const fromName = joinNameParts(record);
  if (fromName.length > 0) return fromName;
  if (record.fileAs) return record.fileAs;
  if (record.nickname) return record.nickname;
  if (record.organization) return record.organization;
  const firstEmail = record.fields.find((field) => field.kind === "EMAIL");
  if (firstEmail) return firstEmail.value;
  const firstPhone = record.fields.find((field) => field.kind === "PHONE");
  if (firstPhone) return firstPhone.value;
  return "";
}

/**
 * Sort key for the list. PostgreSQL orders by the database collation, so the
 * casing is folded here and the string normalized first: "ANNA" and "anna"
 * land together. Letters that differ only by a diacritic still sort apart,
 * which is the behaviour every desktop address book has.
 */
export function buildSortKey(displayName: string): string {
  return displayName.normalize("NFKC").trim().toLocaleLowerCase("en-US");
}

/**
 * The single haystack the list search ILIKEs against: names, organization,
 * every field value plus its normalized form (so "+371 20 000 000" is found by
 * typing "37120000000"), addresses, labels and notes.
 */
export function buildSearchText(record: ContactRecord): string {
  const parts: (string | null)[] = [
    record.prefix,
    record.firstName,
    record.middleName,
    record.lastName,
    record.suffix,
    record.phoneticFirst,
    record.phoneticMiddle,
    record.phoneticLast,
    record.nickname,
    record.fileAs,
    record.organization,
    record.jobTitle,
    record.department,
    record.birthday,
    record.notes,
    ...record.labels,
  ];

  for (const field of record.fields) {
    parts.push(field.label, field.value, normalizeFieldValue(field));
  }
  for (const address of record.addresses) {
    parts.push(
      address.label,
      address.poBox,
      address.extended,
      address.street,
      address.city,
      address.region,
      address.postalCode,
      address.country,
      address.formatted,
    );
  }

  const seen = new Set<string>();
  for (const part of parts) {
    if (part === null) continue;
    for (const token of part.toLocaleLowerCase("en-US").split(/\s+/u)) {
      if (token.length > 0) seen.add(token);
    }
  }
  return [...seen].join(" ");
}

/**
 * Keys two records are considered duplicates by, strongest first. A shared
 * email is conclusive; a shared phone nearly so; an identical display name is
 * only a suggestion, which is why the merge screen always asks before acting.
 */
export function duplicateKeys(record: {
  displayName: string;
  fields: readonly Pick<ContactFieldRecord, "kind" | "value">[];
}): string[] {
  const keys: string[] = [];
  for (const field of record.fields) {
    if (field.kind === "EMAIL") {
      const email = normalizeEmail(field.value);
      if (email) keys.push(`email:${email}`);
    }
    if (field.kind === "PHONE") {
      const phone = phoneDuplicateKey(field.value);
      if (phone) keys.push(`phone:${phone}`);
    }
  }
  const name = buildSortKey(record.displayName);
  if (name.length > 0) keys.push(`name:${name}`);
  return [...new Set(keys)];
}
