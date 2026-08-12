import { z } from "zod";
import { CONTACT_FIELD_KINDS } from "@/lib/contacts/model";
import {
  CONTACT_EXPORT_FORMATS,
  CONTACT_IMPORT_FORMATS,
} from "@/lib/contacts/formats";
import {
  isLabelColor,
  normalizeLabelHexColor,
  type LabelColor,
} from "@/lib/label-color";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";

// Input validation for the Contacts routes. Field values are deliberately
// permissive — an address book holds whatever its owner typed, and rejecting a
// phone number because it has an extension in it would be worse than storing
// it. What is constrained is length (so one paste cannot fill a column) and
// the closed vocabularies: field kind, label color, import/export format.

const MAX_SHORT = 200;
const MAX_VALUE = 500;
const MAX_NOTES = 10_000;
const MAX_FIELDS = 100;
const MAX_ADDRESSES = 20;
const MAX_LABELS_PER_CONTACT = 50;

const shortText = z.string().trim().max(MAX_SHORT);
const nullableShortText = shortText.nullish().transform((v) => v ?? null);

export const contactFieldSchema = z.object({
  kind: z.enum(CONTACT_FIELD_KINDS),
  label: z
    .string()
    .trim()
    .max(MAX_SHORT)
    .nullish()
    .transform((value) => (value && value.length > 0 ? value : null)),
  value: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.contact.fieldValueRequired })
    .max(MAX_VALUE),
  isPrimary: z.boolean().optional().default(false),
});

export const contactAddressSchema = z.object({
  label: nullableShortText,
  poBox: nullableShortText,
  extended: nullableShortText,
  street: z
    .string()
    .trim()
    .max(MAX_VALUE)
    .nullish()
    .transform((v) => v ?? null),
  city: nullableShortText,
  region: nullableShortText,
  postalCode: nullableShortText,
  country: nullableShortText,
  formatted: z
    .string()
    .trim()
    .max(MAX_VALUE)
    .nullish()
    .transform((v) => v ?? null),
});

export const contactSchema = z.object({
  prefix: nullableShortText,
  firstName: nullableShortText,
  middleName: nullableShortText,
  lastName: nullableShortText,
  suffix: nullableShortText,
  phoneticFirst: nullableShortText,
  phoneticMiddle: nullableShortText,
  phoneticLast: nullableShortText,
  nickname: nullableShortText,
  fileAs: nullableShortText,
  organization: nullableShortText,
  jobTitle: nullableShortText,
  department: nullableShortText,
  // Free text on purpose: vCard allows "--04-12" and a source may carry a
  // date this product never has to compute with.
  birthday: nullableShortText,
  notes: z
    .string()
    .trim()
    .max(MAX_NOTES)
    .nullish()
    .transform((v) => v ?? null),
  starred: z.boolean().optional().default(false),
  fields: z.array(contactFieldSchema).max(MAX_FIELDS).optional().default([]),
  addresses: z
    .array(contactAddressSchema)
    .max(MAX_ADDRESSES)
    .optional()
    .default([]),
  labelIds: z
    .array(z.string().min(1))
    .max(MAX_LABELS_PER_CONTACT)
    .optional()
    .default([]),
});

// A contact with nothing in it would be an unnamed blank row in the list, so
// at least one identifying value is required — the same rule Google applies.
export const contactCreateSchema = contactSchema.refine(
  (value) =>
    [
      value.firstName,
      value.lastName,
      value.middleName,
      value.nickname,
      value.fileAs,
      value.organization,
    ].some((part) => part !== null && part.length > 0) ||
    value.fields.length > 0,
  { error: () => VALIDATION_MESSAGES.contact.emptyContact },
);

export const contactUpdateSchema = contactCreateSchema;

export const contactBulkSchema = z.object({
  contactIds: z.array(z.string().min(1)).min(1).max(1000),
  action: z.discriminatedUnion("type", [
    z.object({ type: z.literal("delete") }),
    z.object({ type: z.literal("star"), starred: z.boolean() }),
    z.object({ type: z.literal("addLabel"), labelId: z.string().min(1) }),
    z.object({ type: z.literal("removeLabel"), labelId: z.string().min(1) }),
  ]),
});

export const contactMergeSchema = z.object({
  primaryId: z.string().min(1),
  otherIds: z.array(z.string().min(1)).min(1).max(50),
});

export const contactImportFieldsSchema = z.object({
  format: z.enum(CONTACT_IMPORT_FORMATS).optional(),
  duplicateStrategy: z.enum(["skip", "update", "create"]).default("skip"),
});

export const contactExportQuerySchema = z.object({
  format: z.enum(CONTACT_EXPORT_FORMATS),
  contactIds: z.array(z.string().min(1)).max(10_000).optional(),
  labelId: z.string().min(1).optional(),
  query: z.string().max(MAX_SHORT).optional(),
  starred: z.boolean().optional(),
});

export const contactListQuerySchema = z.object({
  query: z.string().max(MAX_SHORT).optional(),
  labelId: z.string().min(1).optional(),
  starred: z.boolean().optional(),
  page: z.coerce.number().int().min(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(200).optional(),
});

// Same shape as mailLabelColorSchema: normalize first, then narrow to the
// LabelColor union so the service receives a value parseLabelColor accepts.
const labelColor = z
  .string()
  .transform(normalizeLabelHexColor)
  .refine(isLabelColor, {
    error: () => VALIDATION_MESSAGES.contact.labelColorInvalid,
  })
  .transform((value) => value as LabelColor);

export const contactLabelSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.contact.labelNameRequired })
    .max(60),
  color: labelColor,
});

export const contactLabelUpdateSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: labelColor.optional(),
});

export type ContactInputPayload = z.infer<typeof contactSchema>;
export type ContactBulkPayload = z.infer<typeof contactBulkSchema>;
export type ContactMergePayload = z.infer<typeof contactMergeSchema>;
export type ContactImportFieldsPayload = z.infer<
  typeof contactImportFieldsSchema
>;
export type ContactExportPayload = z.infer<typeof contactExportQuerySchema>;
export type ContactLabelPayload = z.infer<typeof contactLabelSchema>;
