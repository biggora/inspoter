// Google Contacts CSV, both directions.
//
// Google has shipped two layouts. The current one names its repeating groups
// "E-mail 1 - Label" / "E-mail 1 - Value"; the layout that was current until
// 2021 (and that every "export my contacts" blog post still shows) used
// "Given Name"/"Family Name", "- Type" instead of "- Label", and
// "Group Membership" instead of "Labels". Import accepts both, because a file
// sitting in someone's Downloads folder can be either. Export writes the
// current one.

import { parseCsv, writeCsv } from "./rfc4180";
import {
  cleanMultilineValue,
  cleanValue,
  createEmptyContactRecord,
  isAddressEmpty,
  isContactRecordEmpty,
  type ContactAddressRecord,
  type ContactFieldKind,
  type ContactRecord,
} from "../model";
import { buildDisplayName } from "../normalize";

// Google packs several values for one labeled slot into a single cell.
const MULTI_VALUE_SEPARATOR = ":::";

// A "* myContacts" system membership is not a label an operator chose.
const SYSTEM_LABEL = /^\*\s/u;

interface HeaderIndex {
  /** Exact column name (lower-cased) to its position. */
  columns: Map<string, number>;
}

function buildHeaderIndex(header: readonly string[]): HeaderIndex {
  const columns = new Map<string, number>();
  header.forEach((name, index) => {
    const key = name.trim().toLowerCase();
    if (key.length > 0 && !columns.has(key)) columns.set(key, index);
  });
  return { columns };
}

function cell(
  index: HeaderIndex,
  row: readonly string[],
  ...names: string[]
): string | null {
  for (const name of names) {
    const position = index.columns.get(name.toLowerCase());
    if (position === undefined) continue;
    const value = cleanValue(row[position]);
    if (value !== null) return value;
  }
  return null;
}

function multilineCell(
  index: HeaderIndex,
  row: readonly string[],
  ...names: string[]
): string | null {
  for (const name of names) {
    const position = index.columns.get(name.toLowerCase());
    if (position === undefined) continue;
    const value = cleanMultilineValue(row[position]);
    if (value !== null) return value;
  }
  return null;
}

function splitMultiValue(value: string): string[] {
  return value
    .split(MULTI_VALUE_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * Google's own label spellings mapped onto ours. Anything unrecognized (a
 * label the operator typed) is passed through as-is.
 */
function normalizeGoogleLabel(value: string | null): string | null {
  if (value === null) return null;
  const stripped = value.replace(/^\*\s*/u, "").trim();
  switch (stripped.toLowerCase()) {
    case "home":
      return "home";
    case "work":
      return "work";
    case "mobile":
    case "cell":
      return "mobile";
    case "main":
      return "main";
    case "pager":
      return "pager";
    case "work fax":
      return "workFax";
    case "home fax":
      return "homeFax";
    case "fax":
      return "fax";
    case "other":
      return "other";
    default:
      return stripped.length > 0 ? stripped : null;
  }
}

/** Reads the `<Prefix> {n} - <Suffix>` repeating groups until one comes up empty. */
function readGroup(
  index: HeaderIndex,
  row: readonly string[],
  prefix: string,
  suffixes: readonly string[],
): Record<string, string | null>[] {
  const entries: Record<string, string | null>[] = [];
  for (let slot = 1; slot <= 32; slot += 1) {
    const entry: Record<string, string | null> = {};
    let present = false;
    let any = false;
    for (const suffix of suffixes) {
      const name = `${prefix} ${slot} - ${suffix}`;
      if (index.columns.has(name.toLowerCase())) present = true;
      const value = cell(index, row, name);
      entry[suffix] = value;
      if (value !== null) any = true;
    }
    if (!present) break;
    if (any) entries.push(entry);
  }
  return entries;
}

function pushLabeledValues(
  record: ContactRecord,
  kind: ContactFieldKind,
  entries: readonly Record<string, string | null>[],
  valueKey: string,
  labelKeys: readonly string[],
): void {
  for (const entry of entries) {
    const raw = entry[valueKey];
    if (raw === null || raw === undefined) continue;
    const label = normalizeGoogleLabel(
      labelKeys.map((key) => entry[key]).find((value) => value != null) ?? null,
    );
    for (const value of splitMultiValue(raw)) {
      record.fields.push({ kind, label, value, isPrimary: false });
    }
  }
}

function readAddresses(
  index: HeaderIndex,
  row: readonly string[],
): ContactAddressRecord[] {
  const entries = readGroup(index, row, "Address", [
    "Label",
    "Type",
    "Formatted",
    "Street",
    "City",
    "PO Box",
    "Region",
    "Postal Code",
    "Country",
    "Extended Address",
  ]);
  return entries
    .map((entry) => ({
      label: normalizeGoogleLabel(entry.Label ?? entry.Type ?? null),
      poBox: entry["PO Box"] ?? null,
      extended: entry["Extended Address"] ?? null,
      street: entry.Street ?? null,
      city: entry.City ?? null,
      region: entry.Region ?? null,
      postalCode: entry["Postal Code"] ?? null,
      country: entry.Country ?? null,
      formatted: entry.Formatted ?? null,
    }))
    .filter((address) => !isAddressEmpty(address));
}

function readLabels(index: HeaderIndex, row: readonly string[]): string[] {
  const raw = cell(index, row, "Labels", "Group Membership");
  if (raw === null) return [];
  return [
    ...new Set(
      raw
        .split(MULTI_VALUE_SEPARATOR)
        .flatMap((part) => part.split(" ::: "))
        .map((part) => part.trim())
        .filter((part) => part.length > 0 && !SYSTEM_LABEL.test(part)),
    ),
  ];
}

/** True when the header looks like a Google Contacts export. */
export function isGoogleCsvHeader(header: readonly string[]): boolean {
  const names = new Set(header.map((name) => name.trim().toLowerCase()));
  return (
    names.has("e-mail 1 - value") ||
    names.has("given name") ||
    names.has("group membership") ||
    (names.has("labels") && names.has("first name"))
  );
}

export function parseGoogleCsv(text: string): ContactRecord[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const index = buildHeaderIndex(rows[0]);

  return rows
    .slice(1)
    .map((row) => {
      const record = createEmptyContactRecord();
      record.firstName = cell(index, row, "First Name", "Given Name");
      record.middleName = cell(index, row, "Middle Name", "Additional Name");
      record.lastName = cell(index, row, "Last Name", "Family Name");
      record.prefix = cell(index, row, "Name Prefix");
      record.suffix = cell(index, row, "Name Suffix");
      record.phoneticFirst = cell(
        index,
        row,
        "Phonetic First Name",
        "Given Name Yomi",
      );
      record.phoneticMiddle = cell(
        index,
        row,
        "Phonetic Middle Name",
        "Additional Name Yomi",
      );
      record.phoneticLast = cell(
        index,
        row,
        "Phonetic Last Name",
        "Family Name Yomi",
      );
      record.nickname = cell(index, row, "Nickname");
      record.fileAs = cell(index, row, "File As");
      record.organization = cell(
        index,
        row,
        "Organization Name",
        "Organization 1 - Name",
      );
      record.jobTitle = cell(
        index,
        row,
        "Organization Title",
        "Organization 1 - Title",
      );
      record.department = cell(
        index,
        row,
        "Organization Department",
        "Organization 1 - Department",
      );
      record.birthday = cell(index, row, "Birthday");
      record.notes = multilineCell(index, row, "Notes");
      record.labels = readLabels(index, row);
      record.addresses = readAddresses(index, row);

      pushLabeledValues(
        record,
        "EMAIL",
        readGroup(index, row, "E-mail", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );
      pushLabeledValues(
        record,
        "PHONE",
        readGroup(index, row, "Phone", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );
      pushLabeledValues(
        record,
        "URL",
        readGroup(index, row, "Website", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );
      pushLabeledValues(
        record,
        "IM",
        readGroup(index, row, "IM", ["Label", "Type", "Service", "Value"]),
        "Value",
        ["Service", "Label", "Type"],
      );
      pushLabeledValues(
        record,
        "EVENT",
        readGroup(index, row, "Event", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );
      pushLabeledValues(
        record,
        "RELATION",
        readGroup(index, row, "Relation", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );
      pushLabeledValues(
        record,
        "CUSTOM",
        readGroup(index, row, "Custom Field", ["Label", "Type", "Value"]),
        "Value",
        ["Label", "Type"],
      );

      // The legacy layout leads with a single "Name" column; use it as the
      // display override when the structured parts came up empty.
      if (record.firstName === null && record.lastName === null) {
        record.fileAs ??= cell(index, row, "Name");
      }

      return record;
    })
    .filter((record) => !isContactRecordEmpty(record));
}

// --- Export ---------------------------------------------------------------

const SCALAR_COLUMNS: readonly [string, (record: ContactRecord) => string][] = [
  ["First Name", (record) => record.firstName ?? ""],
  ["Middle Name", (record) => record.middleName ?? ""],
  ["Last Name", (record) => record.lastName ?? ""],
  ["Phonetic First Name", (record) => record.phoneticFirst ?? ""],
  ["Phonetic Middle Name", (record) => record.phoneticMiddle ?? ""],
  ["Phonetic Last Name", (record) => record.phoneticLast ?? ""],
  ["Name Prefix", (record) => record.prefix ?? ""],
  ["Name Suffix", (record) => record.suffix ?? ""],
  ["Nickname", (record) => record.nickname ?? ""],
  ["File As", (record) => record.fileAs ?? buildDisplayName(record)],
  ["Organization Name", (record) => record.organization ?? ""],
  ["Organization Title", (record) => record.jobTitle ?? ""],
  ["Organization Department", (record) => record.department ?? ""],
  ["Birthday", (record) => record.birthday ?? ""],
  ["Notes", (record) => record.notes ?? ""],
  ["Labels", (record) => record.labels.join(MULTI_VALUE_SEPARATOR)],
];

const FIELD_GROUPS: readonly {
  prefix: string;
  kind: ContactFieldKind;
}[] = [
  { prefix: "E-mail", kind: "EMAIL" },
  { prefix: "Phone", kind: "PHONE" },
  { prefix: "Website", kind: "URL" },
  { prefix: "IM", kind: "IM" },
  { prefix: "Event", kind: "EVENT" },
  { prefix: "Relation", kind: "RELATION" },
  { prefix: "Custom Field", kind: "CUSTOM" },
];

const ADDRESS_SUFFIXES = [
  "Label",
  "Formatted",
  "Street",
  "City",
  "PO Box",
  "Region",
  "Postal Code",
  "Country",
  "Extended Address",
] as const;

function fieldsOf(
  record: ContactRecord,
  kind: ContactFieldKind,
): ContactRecord["fields"] {
  return record.fields.filter((field) => field.kind === kind);
}

function addressColumn(
  address: ContactAddressRecord | undefined,
  suffix: (typeof ADDRESS_SUFFIXES)[number],
): string {
  if (address === undefined) return "";
  switch (suffix) {
    case "Label":
      return address.label ?? "";
    case "Formatted":
      return address.formatted ?? "";
    case "Street":
      return address.street ?? "";
    case "City":
      return address.city ?? "";
    case "PO Box":
      return address.poBox ?? "";
    case "Region":
      return address.region ?? "";
    case "Postal Code":
      return address.postalCode ?? "";
    case "Country":
      return address.country ?? "";
    case "Extended Address":
      return address.extended ?? "";
  }
}

export function serializeGoogleCsv(records: readonly ContactRecord[]): string {
  // Column count is driven by the busiest contact in the set, exactly as
  // Google's own export does.
  const groupCounts = new Map<string, number>(
    FIELD_GROUPS.map(({ prefix, kind }) => [
      prefix,
      Math.max(0, ...records.map((record) => fieldsOf(record, kind).length)),
    ]),
  );
  const addressCount = Math.max(
    0,
    ...records.map((record) => record.addresses.length),
  );

  const header: string[] = [...SCALAR_COLUMNS.map(([name]) => name)];
  for (const { prefix } of FIELD_GROUPS) {
    for (let slot = 1; slot <= (groupCounts.get(prefix) ?? 0); slot += 1) {
      header.push(`${prefix} ${slot} - Label`, `${prefix} ${slot} - Value`);
    }
  }
  for (let slot = 1; slot <= addressCount; slot += 1) {
    for (const suffix of ADDRESS_SUFFIXES) {
      header.push(`Address ${slot} - ${suffix}`);
    }
  }

  const rows = records.map((record) => {
    const row = SCALAR_COLUMNS.map(([, read]) => read(record));
    for (const { prefix, kind } of FIELD_GROUPS) {
      const fields = fieldsOf(record, kind);
      for (let slot = 0; slot < (groupCounts.get(prefix) ?? 0); slot += 1) {
        const field = fields[slot];
        row.push(field?.label ?? "", field?.value ?? "");
      }
    }
    for (let slot = 0; slot < addressCount; slot += 1) {
      for (const suffix of ADDRESS_SUFFIXES) {
        row.push(addressColumn(record.addresses[slot], suffix));
      }
    }
    return row;
  });

  return writeCsv([header, ...rows]);
}
