// vCard writer. 3.0 is what Google's "vCard (for iOS Contacts)" export
// produces and what every client on the planet reads; 4.0 is offered for
// anything that wants the current standard. The two differ in enough small
// ways (photo carriage, PREF, date syntax, ANNIVERSARY) that the version is
// threaded through rather than papered over.

import { isKnownLabel, typesFromLabel } from "../labels";
import { foldLine } from "../text";
import { buildDisplayName } from "../normalize";
import type {
  ContactAddressRecord,
  ContactFieldRecord,
  ContactRecord,
} from "../model";

export const VCARD_VERSIONS = ["3.0", "4.0"] as const;
export type VCardVersion = (typeof VCARD_VERSIONS)[number];

function escapeValue(value: string): string {
  return value
    .replace(/\\/gu, "\\\\")
    .replace(/;/gu, "\\;")
    .replace(/,/gu, "\\,")
    .replace(/\r\n|\r|\n/gu, "\\n");
}

function joinComponents(components: readonly (string | null)[]): string {
  return components.map((part) => escapeValue(part ?? "")).join(";");
}

interface PropertyOptions {
  params?: readonly string[];
  /** Already encoded — skips escaping (photos, structured values). */
  raw?: boolean;
}

function property(
  name: string,
  value: string,
  { params = [], raw = false }: PropertyOptions = {},
): string {
  const head = [name, ...params].join(";");
  return foldLine(`${head}:${raw ? value : escapeValue(value)}`);
}

function typeParams(label: string | null, version: VCardVersion): string[] {
  // A label outside the shared vocabulary is not expressible as a TYPE without
  // losing its casing (readers upper-case type tokens), so it travels as an
  // X-ABLabel group instead — see fieldProperties.
  if (label !== null && !isKnownLabel(label)) return [];
  const types = typesFromLabel(label);
  if (types.length === 0) return [];
  const value =
    version === "4.0" ? types.join(",").toLowerCase() : types.join(",");
  return [`TYPE=${value}`];
}

function preferenceParams(
  field: ContactFieldRecord,
  version: VCardVersion,
): string[] {
  if (!field.isPrimary) return [];
  return version === "4.0" ? ["PREF=1"] : ["TYPE=PREF"];
}

/** 4.0 wants `--0412` where 3.0 accepts the hyphenated form. */
function dateValue(value: string, version: VCardVersion): string {
  if (version !== "4.0") return value;
  return value.startsWith("--")
    ? value.replace(/-/gu, "").replace(/^/u, "--")
    : value;
}

function addressProperty(
  address: ContactAddressRecord,
  version: VCardVersion,
): string[] {
  const lines = [
    property(
      "ADR",
      joinComponents([
        address.poBox,
        address.extended,
        address.street,
        address.city,
        address.region,
        address.postalCode,
        address.country,
      ]),
      { params: typeParams(address.label, version), raw: true },
    ),
  ];
  // LABEL was removed in 4.0; there the rendering rides along as a parameter.
  if (address.formatted !== null && version === "3.0") {
    lines.push(
      property("LABEL", address.formatted, {
        params: typeParams(address.label, version),
      }),
    );
  }
  return lines;
}

function photoProperty(record: ContactRecord, version: VCardVersion): string[] {
  if (record.photo === null) return [];
  const base64 = Buffer.from(record.photo.data).toString("base64");
  if (version === "4.0") {
    return [
      property("PHOTO", `data:${record.photo.contentType};base64,${base64}`, {
        raw: true,
      }),
    ];
  }
  const subtype = record.photo.contentType.split("/")[1] ?? "jpeg";
  return [
    property("PHOTO", base64, {
      params: ["ENCODING=b", `TYPE=${subtype.toUpperCase()}`],
      raw: true,
    }),
  ];
}

function fieldProperties(
  record: ContactRecord,
  version: VCardVersion,
): string[] {
  const lines: string[] = [];
  // Grouped properties need unique group names within the card; Apple's
  // `itemN.` convention is what readers expect.
  let groupIndex = 0;
  const nextGroup = () => `item${(groupIndex += 1)}`;

  for (const field of record.fields) {
    const params = [
      ...typeParams(field.label, version),
      ...preferenceParams(field, version),
    ];
    // Custom labels ride in their own group so their exact text survives.
    const custom = field.label !== null && !isKnownLabel(field.label);
    const pushWithLabel = (name: string) => {
      const group = custom ? nextGroup() : null;
      lines.push(
        property(group === null ? name : `${group}.${name}`, field.value, {
          params,
        }),
      );
      if (group !== null && field.label !== null) {
        lines.push(property(`${group}.X-ABLabel`, field.label));
      }
    };

    switch (field.kind) {
      case "PHONE":
        pushWithLabel("TEL");
        break;
      case "EMAIL":
        pushWithLabel("EMAIL");
        break;
      case "URL":
        pushWithLabel("URL");
        break;
      case "IM":
        lines.push(
          property("IMPP", field.value, {
            params: field.label ? [`X-SERVICE-TYPE=${field.label}`] : [],
          }),
        );
        break;
      case "EVENT": {
        if (field.label === "anniversary" && version === "4.0") {
          lines.push(property("ANNIVERSARY", dateValue(field.value, version)));
          break;
        }
        const group = nextGroup();
        lines.push(
          property(`${group}.X-ABDATE`, dateValue(field.value, version)),
        );
        if (field.label) {
          lines.push(property(`${group}.X-ABLabel`, field.label));
        }
        break;
      }
      case "RELATION": {
        const group = nextGroup();
        lines.push(property(`${group}.X-ABRELATEDNAMES`, field.value));
        if (field.label) {
          lines.push(property(`${group}.X-ABLabel`, field.label));
        }
        break;
      }
      case "CUSTOM": {
        const group = nextGroup();
        lines.push(property(`${group}.X-INSPOTER-FIELD`, field.value));
        if (field.label) {
          lines.push(property(`${group}.X-ABLabel`, field.label));
        }
        break;
      }
    }
  }

  return lines;
}

/** Serializes one contact. */
export function serializeVCard(
  record: ContactRecord,
  version: VCardVersion = "3.0",
): string {
  const lines: string[] = ["BEGIN:VCARD", `VERSION:${version}`];

  lines.push(
    property(
      "N",
      joinComponents([
        record.lastName,
        record.firstName,
        record.middleName,
        record.prefix,
        record.suffix,
      ]),
      { raw: true },
    ),
  );
  // FN is mandatory in every version, so it always carries the display name
  // even when the contact has nothing but an email address.
  lines.push(property("FN", record.fileAs ?? buildDisplayName(record)));

  if (record.nickname) lines.push(property("NICKNAME", record.nickname));
  if (record.organization || record.department) {
    lines.push(
      property(
        "ORG",
        joinComponents([record.organization, record.department]),
        {
          raw: true,
        },
      ),
    );
  }
  if (record.jobTitle) lines.push(property("TITLE", record.jobTitle));

  lines.push(...fieldProperties(record, version));
  for (const address of record.addresses) {
    lines.push(...addressProperty(address, version));
  }

  if (record.birthday) {
    lines.push(property("BDAY", dateValue(record.birthday, version)));
  }
  if (record.phoneticFirst) {
    lines.push(property("X-PHONETIC-FIRST-NAME", record.phoneticFirst));
  }
  if (record.phoneticMiddle) {
    lines.push(property("X-PHONETIC-MIDDLE-NAME", record.phoneticMiddle));
  }
  if (record.phoneticLast) {
    lines.push(property("X-PHONETIC-LAST-NAME", record.phoneticLast));
  }
  if (record.notes) lines.push(property("NOTE", record.notes));
  if (record.labels.length > 0) {
    lines.push(
      property("CATEGORIES", record.labels.map(escapeValue).join(","), {
        raw: true,
      }),
    );
  }
  if (record.starred) lines.push(property("X-STARRED", "true"));
  lines.push(...photoProperty(record, version));

  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

/** Serializes a whole address book. */
export function serializeVCards(
  records: readonly ContactRecord[],
  version: VCardVersion = "3.0",
): string {
  return records.map((record) => serializeVCard(record, version)).join("");
}
