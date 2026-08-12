// Semantic layer of the vCard reader. Handles 2.1, 3.0 and 4.0 from the same
// code path: the differences that survive tokenization are the date syntax,
// how a photo carries its bytes, and 4.0's PREF=1 replacing 3.0's TYPE=PREF.

import { phoneLabelFromTypes, simpleLabelFromTypes } from "../labels";
import {
  cleanMultilineValue,
  cleanValue,
  createEmptyContactRecord,
  isAddressEmpty,
  isContactRecordEmpty,
  type ContactAddressRecord,
  type ContactFieldKind,
  type ContactPhotoRecord,
  type ContactRecord,
} from "../model";
import {
  splitComponents,
  splitValues,
  tokenizeVCards,
  unescapeValue,
  type VCardProperty,
} from "./tokenizer";

// The chat properties old clients wrote before IMPP existed, and the service
// each of them implied.
const IM_PROPERTIES: Record<string, string> = {
  "X-AIM": "AIM",
  "X-ICQ": "ICQ",
  "X-JABBER": "Jabber",
  "X-MSN": "MSN",
  "X-SKYPE": "Skype",
  "X-SKYPE-USERNAME": "Skype",
  "X-GOOGLE-TALK": "Google Talk",
  "X-GADUGADU": "Gadu-Gadu",
  "X-YAHOO": "Yahoo",
  "X-TWITTER": "Twitter",
  "X-QQ": "QQ",
};

function propertyText(property: VCardProperty): string | null {
  return cleanValue(unescapeValue(property.value));
}

function propertyMultilineText(property: VCardProperty): string | null {
  return cleanMultilineValue(unescapeValue(property.value));
}

function types(property: VCardProperty): string[] {
  return property.params.get("TYPE") ?? [];
}

function isPreferred(property: VCardProperty): boolean {
  if (property.params.get("PREF")?.[0] === "1") return true;
  return types(property).some((type) => type.toUpperCase() === "PREF");
}

/**
 * Normalizes the several date spellings in the wild onto ISO-8601, keeping the
 * year-less form vCard 4.0 writes as `--MMDD` (a birthday nobody knows the year
 * of is still a birthday).
 */
export function normalizeDate(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const yearless = /^--(\d{2})-?(\d{2})$/u.exec(trimmed);
  if (yearless) return `--${yearless[1]}-${yearless[2]}`;

  const full = /^(\d{4})-?(\d{2})-?(\d{2})/u.exec(trimmed);
  if (full) return `${full[1]}-${full[2]}-${full[3]}`;

  // Anything else (a free-text "spring 1980", a locale-specific date) is kept
  // as typed rather than thrown away.
  return trimmed;
}

function decodePhoto(property: VCardProperty): ContactPhotoRecord | null {
  const raw = property.value.trim();
  if (raw.length === 0) return null;

  const encoding = property.params.get("ENCODING")?.[0]?.toUpperCase();
  const declaredType = property.params.get("TYPE")?.[0];

  // vCard 4.0: PHOTO:data:image/jpeg;base64,<payload>
  const dataUri = /^data:([^;,]+)(;base64)?,(.*)$/su.exec(raw);
  if (dataUri) {
    if (!dataUri[2]) return null; // percent-encoded data URIs are not worth the code
    return {
      contentType: dataUri[1],
      data: new Uint8Array(Buffer.from(dataUri[3], "base64")),
    };
  }

  // vCard 2.1/3.0: PHOTO;ENCODING=BASE64;TYPE=JPEG:<payload>
  if (encoding === "BASE64" || encoding === "B") {
    const data = new Uint8Array(
      Buffer.from(raw.replace(/\s+/gu, ""), "base64"),
    );
    if (data.byteLength === 0) return null;
    return { contentType: contentTypeFor(declaredType), data };
  }

  // A bare URI value: nothing to store, and fetching it would be an outbound
  // request triggered by file content.
  return null;
}

function contentTypeFor(declaredType: string | undefined): string {
  const normalized = (declaredType ?? "JPEG").toUpperCase();
  if (normalized.includes("/")) return normalized.toLowerCase();
  if (normalized === "JPG" || normalized === "JPEG") return "image/jpeg";
  return `image/${normalized.toLowerCase()}`;
}

function parseAddress(property: VCardProperty): ContactAddressRecord {
  const [poBox, extended, street, city, region, postalCode, country] =
    splitComponents(property.value).map((component) =>
      cleanValue(unescapeValue(component)),
    );
  return {
    label: simpleLabelFromTypes(types(property)),
    poBox: poBox ?? null,
    extended: extended ?? null,
    street: street ?? null,
    city: city ?? null,
    region: region ?? null,
    postalCode: postalCode ?? null,
    country: country ?? null,
    formatted: null,
  };
}

interface CardContext {
  record: ContactRecord;
  /** FN as written, kept aside until the whole card is read. */
  formattedName: string | null;
  /** Group of the property being applied, so pushField can record it. */
  currentGroup: string | null;
  /** Parallel to record.fields: the group each field came from, if any. */
  fieldGroups: (string | null)[];
  /** `item1` → the X-ABLabel it declared, for Apple-style custom fields. */
  groupLabels: Map<string, string>;
  /** Properties deferred until their group's label is known. */
  pendingGrouped: { group: string; kind: ContactFieldKind; value: string }[];
}

function pushField(
  context: CardContext,
  kind: ContactFieldKind,
  value: string | null,
  label: string | null,
  isPrimary = false,
): void {
  if (value === null) return;
  context.record.fields.push({ kind, label, value, isPrimary });
  context.fieldGroups.push(context.currentGroup);
}

function applyProperty(context: CardContext, property: VCardProperty): void {
  const { record } = context;
  context.currentGroup = property.group;

  switch (property.name) {
    case "VERSION":
      return;

    case "N": {
      const [lastName, firstName, middleName, prefix, suffix] = splitComponents(
        property.value,
      ).map((component) => cleanValue(unescapeValue(component)));
      record.lastName = lastName ?? null;
      record.firstName = firstName ?? null;
      record.middleName = middleName ?? null;
      record.prefix = prefix ?? null;
      record.suffix = suffix ?? null;
      return;
    }

    case "FN":
      context.formattedName = propertyText(property);
      return;

    case "NICKNAME":
      record.nickname = cleanValue(
        splitValues(property.value).map(unescapeValue).join(", "),
      );
      return;

    case "ORG": {
      const [organization, department] = splitComponents(property.value).map(
        (component) => cleanValue(unescapeValue(component)),
      );
      record.organization = organization ?? null;
      record.department = department ?? null;
      return;
    }

    case "TITLE":
      record.jobTitle = propertyText(property);
      return;

    case "ROLE":
      record.jobTitle ??= propertyText(property);
      return;

    case "BDAY": {
      const value = propertyText(property);
      record.birthday = value === null ? null : normalizeDate(value);
      return;
    }

    case "ANNIVERSARY": {
      const value = propertyText(property);
      pushField(
        context,
        "EVENT",
        value === null ? null : normalizeDate(value),
        "anniversary",
      );
      return;
    }

    case "NOTE":
      record.notes = propertyMultilineText(property);
      return;

    case "TEL":
      pushField(
        context,
        "PHONE",
        propertyText(property),
        phoneLabelFromTypes(types(property)),
        isPreferred(property),
      );
      return;

    case "EMAIL":
      pushField(
        context,
        "EMAIL",
        propertyText(property),
        simpleLabelFromTypes(types(property)),
        isPreferred(property),
      );
      return;

    case "URL":
    case "X-URL":
      pushField(
        context,
        "URL",
        propertyText(property),
        simpleLabelFromTypes(types(property)),
      );
      return;

    case "IMPP": {
      const value = propertyText(property);
      const service =
        property.params.get("X-SERVICE-TYPE")?.[0] ??
        /^([a-z][\w+.-]*):/iu.exec(value ?? "")?.[1] ??
        null;
      pushField(context, "IM", value, service ? capitalize(service) : null);
      return;
    }

    case "ADR": {
      const address = parseAddress(property);
      if (!isAddressEmpty(address)) record.addresses.push(address);
      return;
    }

    case "LABEL": {
      // A standalone rendering of an address already parsed from ADR.
      const formatted = propertyMultilineText(property);
      if (formatted === null) return;
      const label = simpleLabelFromTypes(types(property));
      const target =
        record.addresses.find((address) => address.label === label) ??
        record.addresses[record.addresses.length - 1];
      if (target && target.formatted === null) target.formatted = formatted;
      return;
    }

    case "CATEGORIES":
      for (const category of splitValues(property.value)) {
        const name = cleanValue(unescapeValue(category));
        if (name !== null && !record.labels.includes(name)) {
          record.labels.push(name);
        }
      }
      return;

    case "PHOTO":
      record.photo ??= decodePhoto(property);
      return;

    case "RELATED":
    case "X-ABRELATEDNAMES":
      // Apple groups a relation with the X-ABLabel naming it ("Spouse"); an
      // ungrouped RELATED carries its role in TYPE instead.
      if (property.group !== null) {
        context.pendingGrouped.push({
          group: property.group,
          kind: "RELATION",
          value: property.value,
        });
        return;
      }
      pushField(
        context,
        "RELATION",
        propertyText(property),
        simpleLabelFromTypes(types(property)),
      );
      return;

    case "X-ABDATE":
      context.pendingGrouped.push({
        group: property.group ?? "",
        kind: "EVENT",
        value: property.value,
      });
      return;

    case "X-ABLABEL":
      if (property.group !== null) {
        const label = propertyText(property);
        // Apple writes its own labels as `_$!<Anniversary>!$_`.
        const unwrapped = label?.replace(/^_\$!<(.*)>!\$_$/u, "$1") ?? null;
        if (unwrapped !== null) {
          context.groupLabels.set(property.group, unwrapped);
        }
      }
      return;

    case "X-PHONETIC-FIRST-NAME":
      record.phoneticFirst = propertyText(property);
      return;

    case "X-PHONETIC-MIDDLE-NAME":
      record.phoneticMiddle = propertyText(property);
      return;

    case "X-PHONETIC-LAST-NAME":
      record.phoneticLast = propertyText(property);
      return;

    case "X-PHONETIC-ORG":
      return;

    case "X-GOOGLE-STARRED":
    case "X-STARRED":
      record.starred = /^(true|1|yes)$/iu.test(property.value.trim());
      return;

    default: {
      const service = IM_PROPERTIES[property.name];
      if (service !== undefined) {
        pushField(context, "IM", propertyText(property), service);
        return;
      }
      // A grouped X- property with a matching X-ABLabel is how Apple and
      // Google write a custom field; ungrouped vendor extensions are noise.
      if (property.group !== null && property.name.startsWith("X-")) {
        context.pendingGrouped.push({
          group: property.group,
          kind: "CUSTOM",
          value: property.value,
        });
      }
    }
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function finishCard(context: CardContext): ContactRecord {
  const { record } = context;

  // `item1.URL` + `item1.X-ABLabel:Blog` is how Apple and Google attach a
  // custom label to an otherwise ordinary property. The label can only be
  // applied once the whole card has been read, since it may follow.
  record.fields.forEach((field, index) => {
    if (field.label !== null) return;
    const group = context.fieldGroups[index];
    if (group === null || group === undefined) return;
    field.label = context.groupLabels.get(group) ?? null;
  });

  for (const pending of context.pendingGrouped) {
    const value = cleanValue(unescapeValue(pending.value));
    if (value === null) continue;
    const label = context.groupLabels.get(pending.group) ?? null;
    record.fields.push({
      kind: pending.kind,
      label,
      value: pending.kind === "EVENT" ? (normalizeDate(value) ?? value) : value,
      isPrimary: false,
    });
  }

  // FN is only worth storing when it says something N does not — otherwise
  // every imported contact would show a redundant "File as" line.
  const derived = [record.firstName, record.middleName, record.lastName]
    .filter((part): part is string => part !== null)
    .join(" ");
  if (
    context.formattedName !== null &&
    context.formattedName !== derived &&
    context.formattedName !== record.organization
  ) {
    record.fileAs = context.formattedName;
  }

  return record;
}

/** Parses a whole vCard file (any of 2.1, 3.0, 4.0, mixed) into records. */
export function parseVCard(source: string): ContactRecord[] {
  return tokenizeVCards(source)
    .map((properties) => {
      const context: CardContext = {
        record: createEmptyContactRecord(),
        formattedName: null,
        currentGroup: null,
        fieldGroups: [],
        groupLabels: new Map(),
        pendingGrouped: [],
      };
      // X-ABLabel can follow the property it labels, so labels are collected
      // first and the grouped properties resolved afterwards.
      for (const property of properties) applyProperty(context, property);
      return finishCard(context);
    })
    .filter((record) => !isContactRecordEmpty(record));
}
