// LDIF (RFC 2849) as Mozilla Thunderbird writes it. Thunderbird is still the
// default address book on a lot of Linux desktops and its export is LDIF only,
// which is what earns this format a place next to vCard and the two CSVs.
//
// The attribute names are Mozilla's mozillaAbPersonAlpha object class; the
// standard inetOrgPerson names (cn, sn, givenName, mail, o, ou, title) are
// shared with plain LDAP exports, so those import too.

import {
  cleanMultilineValue,
  cleanValue,
  createEmptyContactRecord,
  isAddressEmpty,
  isContactRecordEmpty,
  type ContactAddressRecord,
  type ContactFieldRecord,
  type ContactRecord,
} from "./model";
import { buildDisplayName } from "./normalize";
import { splitLines, unfoldLines } from "./text";

interface LdifEntry {
  /** Lower-cased attribute name to every value it was given. */
  attributes: Map<string, string[]>;
}

function parseEntries(text: string): LdifEntry[] {
  const entries: LdifEntry[] = [];
  let current: LdifEntry | null = null;

  for (const line of unfoldLines(splitLines(text))) {
    if (line.trim().length === 0) {
      if (current !== null) entries.push(current);
      current = null;
      continue;
    }
    if (line.startsWith("#")) continue;

    const separator = line.indexOf(":");
    if (separator === -1) continue;

    const name = line.slice(0, separator).trim().toLowerCase();
    const isBase64 = line[separator + 1] === ":";
    const rawValue = line.slice(separator + (isBase64 ? 2 : 1)).trim();
    const value = isBase64
      ? Buffer.from(rawValue, "base64").toString("utf8")
      : rawValue;

    current ??= { attributes: new Map() };
    const values = current.attributes.get(name) ?? [];
    values.push(value);
    current.attributes.set(name, values);
  }

  if (current !== null) entries.push(current);
  return entries;
}

function first(entry: LdifEntry, ...names: string[]): string | null {
  for (const name of names) {
    const value = cleanValue(entry.attributes.get(name)?.[0]);
    if (value !== null) return value;
  }
  return null;
}

function all(entry: LdifEntry, ...names: string[]): string[] {
  return names
    .flatMap((name) => entry.attributes.get(name) ?? [])
    .map((value) => cleanValue(value))
    .filter((value): value is string => value !== null);
}

const PHONE_ATTRIBUTES: readonly [string, string][] = [
  ["mobile", "mobile"],
  ["cellphone", "mobile"],
  ["homephone", "home"],
  ["telephonenumber", "work"],
  ["workphone", "work"],
  ["facsimiletelephonenumber", "workFax"],
  ["fax", "fax"],
  ["pagerphone", "pager"],
  ["pager", "pager"],
];

function pushField(
  record: ContactRecord,
  kind: ContactFieldRecord["kind"],
  value: string | null,
  label: string | null,
): void {
  if (value === null) return;
  record.fields.push({ kind, label, value, isPrimary: false });
}

function readAddress(
  entry: LdifEntry,
  label: string,
  attributes: {
    street: string[];
    street2: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  },
): ContactAddressRecord {
  const street = [
    first(entry, ...attributes.street),
    first(entry, attributes.street2),
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
  return {
    label,
    poBox: null,
    extended: null,
    street: street.length > 0 ? street : null,
    city: first(entry, attributes.city),
    region: first(entry, attributes.region),
    postalCode: first(entry, attributes.postalCode),
    country: first(entry, attributes.country),
    formatted: null,
  };
}

/** Thunderbird splits a birthday across three attributes. */
function readBirthday(entry: LdifEntry): string | null {
  const year = first(entry, "birthyear");
  const month = first(entry, "birthmonth");
  const day = first(entry, "birthday");
  if (month === null || day === null) return null;
  const mm = month.padStart(2, "0");
  const dd = day.padStart(2, "0");
  return year === null ? `--${mm}-${dd}` : `${year}-${mm}-${dd}`;
}

export function isLdif(text: string): boolean {
  return /^dn\s*::?\s/mu.test(text) || /mozillaAbPersonAlpha/iu.test(text);
}

export function parseLdif(text: string): ContactRecord[] {
  return parseEntries(text)
    .map((entry) => {
      const record = createEmptyContactRecord();
      record.firstName = first(entry, "givenname");
      record.lastName = first(entry, "sn", "surname");
      record.nickname = first(
        entry,
        "mozillanickname",
        "nickname",
        "xmozillanickname",
      );
      record.organization = first(entry, "o", "organizationname", "company");
      record.department = first(entry, "ou", "department", "departmentnumber");
      record.jobTitle = first(entry, "title");
      record.notes = cleanMultilineValue(
        entry.attributes.get("description")?.[0] ??
          entry.attributes.get("mozillahomeurl2")?.[0],
      );
      record.birthday = readBirthday(entry);

      for (const [index, mail] of all(entry, "mail").entries()) {
        pushField(record, "EMAIL", mail, index === 0 ? null : "other");
      }
      for (const mail of all(entry, "mozillasecondemail")) {
        pushField(record, "EMAIL", mail, "other");
      }
      for (const [attribute, label] of PHONE_ATTRIBUTES) {
        for (const phone of all(entry, attribute)) {
          pushField(record, "PHONE", phone, label);
        }
      }
      pushField(record, "URL", first(entry, "mozillaworkurl"), "work");
      pushField(record, "URL", first(entry, "mozillahomeurl"), "home");
      pushField(record, "IM", first(entry, "nsaimid", "_aimscreenname"), "AIM");

      for (const address of [
        readAddress(entry, "home", {
          street: ["mozillahomestreet", "homestreet"],
          street2: "mozillahomestreet2",
          city: "mozillahomelocalityname",
          region: "mozillahomestate",
          postalCode: "mozillahomepostalcode",
          country: "mozillahomecountryname",
        }),
        readAddress(entry, "work", {
          street: ["street", "postaladdress"],
          street2: "mozillaworkstreet2",
          city: "l",
          region: "st",
          postalCode: "postalcode",
          country: "c",
        }),
      ]) {
        if (!isAddressEmpty(address)) record.addresses.push(address);
      }

      // `cn` is the display name; it only earns a File As when the structured
      // parts do not already produce it.
      const commonName = first(entry, "cn", "displayname");
      const derived = [record.firstName, record.lastName]
        .filter((part): part is string => part !== null)
        .join(" ");
      if (commonName !== null && commonName !== derived) {
        record.fileAs = commonName;
      }

      return record;
    })
    .filter((record) => !isContactRecordEmpty(record));
}

// --- Export ---------------------------------------------------------------

const SAFE_VALUE = /^[\x20-\x7E]*$/u;

function attribute(name: string, value: string | null): string[] {
  if (value === null || value.length === 0) return [];
  // RFC 2849: a value that is not safe ASCII, or that starts with a character
  // with special meaning, must be base64-encoded.
  if (!SAFE_VALUE.test(value) || /^[ :<]/u.test(value)) {
    return [`${name}:: ${Buffer.from(value, "utf8").toString("base64")}`];
  }
  return [`${name}: ${value}`];
}

function fieldValues(
  record: ContactRecord,
  kind: ContactFieldRecord["kind"],
  label?: string,
): string[] {
  return record.fields
    .filter(
      (field) =>
        field.kind === kind && (label === undefined || field.label === label),
    )
    .map((field) => field.value);
}

function addressAttributes(
  record: ContactRecord,
  label: string,
  names: {
    street: string;
    city: string;
    region: string;
    postalCode: string;
    country: string;
  },
): string[] {
  const address = record.addresses.find((entry) => entry.label === label);
  if (address === undefined) return [];
  return [
    ...attribute(names.street, address.street),
    ...attribute(names.city, address.city),
    ...attribute(names.region, address.region),
    ...attribute(names.postalCode, address.postalCode),
    ...attribute(names.country, address.country),
  ];
}

function birthdayAttributes(record: ContactRecord): string[] {
  if (record.birthday === null) return [];
  const match = /^(\d{4}|--)-?(\d{2})-(\d{2})$/u.exec(record.birthday);
  if (match === null) return [];
  return [
    ...(match[1] === "--" ? [] : attribute("birthyear", match[1])),
    ...attribute("birthmonth", String(Number(match[2]))),
    ...attribute("birthday", String(Number(match[3]))),
  ];
}

export function serializeLdif(records: readonly ContactRecord[]): string {
  const blocks = records.map((record) => {
    const displayName = record.fileAs ?? buildDisplayName(record);
    const emails = fieldValues(record, "EMAIL");
    const lines = [
      ...attribute(
        "dn",
        emails[0] ? `cn=${displayName},mail=${emails[0]}` : `cn=${displayName}`,
      ),
      "objectclass: top",
      "objectclass: person",
      "objectclass: organizationalPerson",
      "objectclass: inetOrgPerson",
      "objectclass: mozillaAbPersonAlpha",
      ...attribute("givenName", record.firstName),
      ...attribute("sn", record.lastName),
      ...attribute("cn", displayName),
      ...attribute("mozillaNickname", record.nickname),
      ...attribute("mail", emails[0] ?? null),
      ...emails
        .slice(1)
        .flatMap((mail) => attribute("mozillaSecondEmail", mail)),
      ...fieldValues(record, "PHONE", "work").flatMap((phone) =>
        attribute("telephoneNumber", phone),
      ),
      ...fieldValues(record, "PHONE", "home").flatMap((phone) =>
        attribute("homePhone", phone),
      ),
      ...fieldValues(record, "PHONE", "mobile").flatMap((phone) =>
        attribute("mobile", phone),
      ),
      ...fieldValues(record, "PHONE", "workFax").flatMap((phone) =>
        attribute("facsimileTelephoneNumber", phone),
      ),
      ...fieldValues(record, "PHONE", "pager").flatMap((phone) =>
        attribute("pagerPhone", phone),
      ),
      ...attribute("o", record.organization),
      ...attribute("ou", record.department),
      ...attribute("title", record.jobTitle),
      ...fieldValues(record, "URL", "work").flatMap((url) =>
        attribute("mozillaWorkUrl", url),
      ),
      ...fieldValues(record, "URL", "home").flatMap((url) =>
        attribute("mozillaHomeUrl", url),
      ),
      ...addressAttributes(record, "home", {
        street: "mozillaHomeStreet",
        city: "mozillaHomeLocalityName",
        region: "mozillaHomeState",
        postalCode: "mozillaHomePostalCode",
        country: "mozillaHomeCountryName",
      }),
      ...addressAttributes(record, "work", {
        street: "street",
        city: "l",
        region: "st",
        postalCode: "postalCode",
        country: "c",
      }),
      ...birthdayAttributes(record),
      ...attribute("description", record.notes),
    ];
    return lines.join("\n");
  });

  return blocks.join("\n\n") + (blocks.length > 0 ? "\n" : "");
}
