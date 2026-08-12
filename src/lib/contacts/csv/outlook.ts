// Microsoft Outlook CSV, both directions.
//
// Unlike Google's, this layout has no repeating groups: every slot is a named
// column ("Home Phone 2", "Business Fax"), so the mapping is a table. Outlook
// itself matches columns by name on import, which is why extra columns are
// harmless and missing ones are simply absent from the record.

import { parseCsv, writeCsv } from "./rfc4180";
import {
  cleanMultilineValue,
  cleanValue,
  createEmptyContactRecord,
  isAddressEmpty,
  isContactRecordEmpty,
  type ContactAddressRecord,
  type ContactFieldRecord,
  type ContactRecord,
} from "../model";

/** column name → the canonical label an entry in it carries. */
const PHONE_COLUMNS: readonly [string, string][] = [
  ["Mobile Phone", "mobile"],
  ["Home Phone", "home"],
  ["Home Phone 2", "home"],
  ["Business Phone", "work"],
  ["Business Phone 2", "work"],
  ["Company Main Phone", "main"],
  ["Primary Phone", "main"],
  ["Business Fax", "workFax"],
  ["Home Fax", "homeFax"],
  ["Other Fax", "fax"],
  ["Pager", "pager"],
  ["Car Phone", "car"],
  ["Other Phone", "other"],
];

const EMAIL_COLUMNS: readonly [string, string | null][] = [
  ["E-mail Address", null],
  ["E-mail 2 Address", null],
  ["E-mail 3 Address", null],
];

const URL_COLUMNS: readonly [string, string | null][] = [
  ["Web Page", null],
  ["Personal Web Page", "home"],
  ["Business Web Page", "work"],
];

const ADDRESS_GROUPS: readonly {
  label: string;
  street: string;
  street2: string;
  city: string;
  region: string;
  postalCode: string;
  country: string;
  poBox: string;
}[] = [
  {
    label: "home",
    street: "Home Street",
    street2: "Home Street 2",
    city: "Home City",
    region: "Home State",
    postalCode: "Home Postal Code",
    country: "Home Country",
    poBox: "Home Address PO Box",
  },
  {
    label: "work",
    street: "Business Street",
    street2: "Business Street 2",
    city: "Business City",
    region: "Business State",
    postalCode: "Business Postal Code",
    country: "Business Country",
    poBox: "Business Address PO Box",
  },
  {
    label: "other",
    street: "Other Street",
    street2: "Other Street 2",
    city: "Other City",
    region: "Other State",
    postalCode: "Other Postal Code",
    country: "Other Country",
    poBox: "Other Address PO Box",
  },
];

function buildIndex(header: readonly string[]): Map<string, number> {
  const columns = new Map<string, number>();
  header.forEach((name, index) => {
    const key = name.trim().toLowerCase();
    if (key.length > 0 && !columns.has(key)) columns.set(key, index);
  });
  return columns;
}

function read(
  columns: Map<string, number>,
  row: readonly string[],
  name: string,
): string | null {
  const position = columns.get(name.toLowerCase());
  return position === undefined ? null : cleanValue(row[position]);
}

/** True when the header looks like an Outlook export. */
export function isOutlookCsvHeader(header: readonly string[]): boolean {
  const names = new Set(header.map((name) => name.trim().toLowerCase()));
  return (
    names.has("e-mail address") ||
    names.has("business phone") ||
    (names.has("first name") && names.has("home street"))
  );
}

export function parseOutlookCsv(text: string): ContactRecord[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const columns = buildIndex(rows[0]);

  return rows
    .slice(1)
    .map((row) => {
      const record = createEmptyContactRecord();
      record.firstName = read(columns, row, "First Name");
      record.middleName = read(columns, row, "Middle Name");
      record.lastName = read(columns, row, "Last Name");
      // Outlook's "Title" is the honorific; the position is "Job Title".
      record.prefix = read(columns, row, "Title");
      record.suffix = read(columns, row, "Suffix");
      record.nickname = read(columns, row, "Nickname");
      record.organization = read(columns, row, "Company");
      record.jobTitle = read(columns, row, "Job Title");
      record.department = read(columns, row, "Department");
      record.birthday = read(columns, row, "Birthday");

      const position = columns.get("notes");
      record.notes =
        position === undefined ? null : cleanMultilineValue(row[position]);

      const categories = read(columns, row, "Categories");
      if (categories !== null) {
        record.labels = [
          ...new Set(
            categories
              .split(";")
              .flatMap((part) => part.split(","))
              .map((part) => part.trim())
              .filter((part) => part.length > 0),
          ),
        ];
      }

      for (const [column, label] of EMAIL_COLUMNS) {
        pushField(record, "EMAIL", read(columns, row, column), label);
      }
      for (const [column, label] of PHONE_COLUMNS) {
        pushField(record, "PHONE", read(columns, row, column), label);
      }
      for (const [column, label] of URL_COLUMNS) {
        pushField(record, "URL", read(columns, row, column), label);
      }
      pushField(record, "IM", read(columns, row, "IMAddress"), null);
      pushField(
        record,
        "EVENT",
        read(columns, row, "Anniversary"),
        "anniversary",
      );
      pushField(record, "RELATION", read(columns, row, "Spouse"), "spouse");

      for (const group of ADDRESS_GROUPS) {
        const street = [
          read(columns, row, group.street),
          read(columns, row, group.street2),
        ]
          .filter((part): part is string => part !== null)
          .join("\n");
        const address: ContactAddressRecord = {
          label: group.label,
          poBox: read(columns, row, group.poBox),
          extended: null,
          street: street.length > 0 ? street : null,
          city: read(columns, row, group.city),
          region: read(columns, row, group.region),
          postalCode: read(columns, row, group.postalCode),
          country: read(columns, row, group.country),
          formatted: null,
        };
        if (!isAddressEmpty(address)) record.addresses.push(address);
      }

      return record;
    })
    .filter((record) => !isContactRecordEmpty(record));
}

function pushField(
  record: ContactRecord,
  kind: ContactFieldRecord["kind"],
  value: string | null,
  label: string | null,
): void {
  if (value === null) return;
  record.fields.push({ kind, label, value, isPrimary: false });
}

// --- Export ---------------------------------------------------------------

// The header Outlook (Windows) writes, in its order. Keeping the full set —
// including the columns Inspoter never fills — is what makes the file import
// cleanly back into Outlook without a field-mapping dialog.
const EXPORT_COLUMNS = [
  "Title",
  "First Name",
  "Middle Name",
  "Last Name",
  "Suffix",
  "Nickname",
  "Company",
  "Department",
  "Job Title",
  "Business Street",
  "Business City",
  "Business State",
  "Business Postal Code",
  "Business Country",
  "Home Street",
  "Home City",
  "Home State",
  "Home Postal Code",
  "Home Country",
  "Other Street",
  "Other City",
  "Other State",
  "Other Postal Code",
  "Other Country",
  "Business Fax",
  "Business Phone",
  "Business Phone 2",
  "Home Phone",
  "Home Phone 2",
  "Home Fax",
  "Mobile Phone",
  "Pager",
  "Company Main Phone",
  "Other Phone",
  "E-mail Address",
  "E-mail 2 Address",
  "E-mail 3 Address",
  "IMAddress",
  "Web Page",
  "Birthday",
  "Anniversary",
  "Spouse",
  "Categories",
  "Notes",
] as const;

type ExportColumn = (typeof EXPORT_COLUMNS)[number];

function addressOf(
  record: ContactRecord,
  label: string,
): ContactAddressRecord | undefined {
  return (
    record.addresses.find((address) => address.label === label) ??
    (label === "work" && record.addresses.length === 1
      ? record.addresses[0]
      : undefined)
  );
}

/** The nth phone whose label matches, so "Home Phone 2" gets the second one. */
function phoneAt(record: ContactRecord, label: string, offset: number): string {
  const matches = record.fields.filter(
    (field) => field.kind === "PHONE" && field.label === label,
  );
  return matches[offset]?.value ?? "";
}

function valuesOf(
  record: ContactRecord,
  kind: "EMAIL" | "URL" | "IM",
): string[] {
  return record.fields
    .filter((field) => field.kind === kind)
    .map((field) => field.value);
}

function columnValue(record: ContactRecord, column: ExportColumn): string {
  const home = addressOf(record, "home");
  const work = addressOf(record, "work");
  const other = addressOf(record, "other");
  const emails = valuesOf(record, "EMAIL");

  switch (column) {
    case "Title":
      return record.prefix ?? "";
    case "First Name":
      return record.firstName ?? "";
    case "Middle Name":
      return record.middleName ?? "";
    case "Last Name":
      return record.lastName ?? "";
    case "Suffix":
      return record.suffix ?? "";
    case "Nickname":
      return record.nickname ?? "";
    case "Company":
      return record.organization ?? "";
    case "Department":
      return record.department ?? "";
    case "Job Title":
      return record.jobTitle ?? "";
    case "Business Street":
      return work?.street ?? "";
    case "Business City":
      return work?.city ?? "";
    case "Business State":
      return work?.region ?? "";
    case "Business Postal Code":
      return work?.postalCode ?? "";
    case "Business Country":
      return work?.country ?? "";
    case "Home Street":
      return home?.street ?? "";
    case "Home City":
      return home?.city ?? "";
    case "Home State":
      return home?.region ?? "";
    case "Home Postal Code":
      return home?.postalCode ?? "";
    case "Home Country":
      return home?.country ?? "";
    case "Other Street":
      return other?.street ?? "";
    case "Other City":
      return other?.city ?? "";
    case "Other State":
      return other?.region ?? "";
    case "Other Postal Code":
      return other?.postalCode ?? "";
    case "Other Country":
      return other?.country ?? "";
    case "Business Fax":
      return phoneAt(record, "workFax", 0);
    case "Business Phone":
      return phoneAt(record, "work", 0);
    case "Business Phone 2":
      return phoneAt(record, "work", 1);
    case "Home Phone":
      return phoneAt(record, "home", 0);
    case "Home Phone 2":
      return phoneAt(record, "home", 1);
    case "Home Fax":
      return phoneAt(record, "homeFax", 0);
    case "Mobile Phone":
      return phoneAt(record, "mobile", 0);
    case "Pager":
      return phoneAt(record, "pager", 0);
    case "Company Main Phone":
      return phoneAt(record, "main", 0);
    case "Other Phone":
      return phoneAt(record, "other", 0);
    case "E-mail Address":
      return emails[0] ?? "";
    case "E-mail 2 Address":
      return emails[1] ?? "";
    case "E-mail 3 Address":
      return emails[2] ?? "";
    case "IMAddress":
      return valuesOf(record, "IM")[0] ?? "";
    case "Web Page":
      return valuesOf(record, "URL")[0] ?? "";
    case "Birthday":
      return record.birthday ?? "";
    case "Anniversary":
      return (
        record.fields.find(
          (field) => field.kind === "EVENT" && field.label === "anniversary",
        )?.value ?? ""
      );
    case "Spouse":
      return (
        record.fields.find(
          (field) => field.kind === "RELATION" && field.label === "spouse",
        )?.value ?? ""
      );
    case "Categories":
      return record.labels.join("; ");
    case "Notes":
      return record.notes ?? "";
  }
}

export function serializeOutlookCsv(records: readonly ContactRecord[]): string {
  return writeCsv([
    [...EXPORT_COLUMNS],
    ...records.map((record) =>
      EXPORT_COLUMNS.map((column) => columnValue(record, column)),
    ),
  ]);
}
