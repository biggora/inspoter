import { z } from "zod";
import * as contactsService from "@/lib/services/contacts";
import * as contactLabelsService from "@/lib/services/contact-labels";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import {
  CONTACT_FIELD_KINDS,
  CONTACT_PHOTO_CONTENT_TYPES,
} from "@/lib/contacts/model";
import {
  CONTACT_EXPORT_FORMATS,
  CONTACT_IMPORT_FORMATS,
} from "@/lib/contacts/formats";
import {
  contactLabelSchema,
  contactLabelUpdateSchema,
} from "@/lib/validation/contacts";
import { idempotencyKeySchema } from "@/lib/validation/webhookTokens";

// The MCP surface takes contacts and photos as text rather than as uploads, so
// the HTTP import byte ceiling does not apply; row and per-photo caps still do.
const IMPORT_LIMITS = { maxContacts: 10_000, maxPhotoBytes: 2_097_152 };
const CREATE_MANY_LIMIT = 500;

// The Contacts half of the agent surface: an assistant can look someone up,
// keep a record current, and load an address book that arrived as a vCard.
// Deleting is here — unlike Messages, where a channel takes its whole history
// with it, a contact is a single record and removing the wrong one is
// recoverable from the file it came from.
//
// The service takes an operator id for the workspace-membership check; a token
// has no operator behind it, so these calls pass null and the token's own
// workspace scope is the authority (see requireWriteAccess in the service).

const contactId = z.string().describe("Contact id from contacts_list");

const fieldSchema = z.object({
  kind: z.enum(CONTACT_FIELD_KINDS),
  label: z
    .string()
    .nullish()
    .describe('Free-form: "home", "work", "mobile", or the operator\'s own'),
  value: z.string().min(1),
  isPrimary: z.boolean().optional(),
});

const addressSchema = z.object({
  label: z.string().nullish(),
  street: z.string().nullish(),
  extended: z.string().nullish(),
  poBox: z.string().nullish(),
  city: z.string().nullish(),
  region: z.string().nullish(),
  postalCode: z.string().nullish(),
  country: z.string().nullish(),
});

const contactShape = {
  prefix: z.string().nullish(),
  firstName: z.string().nullish(),
  middleName: z.string().nullish(),
  lastName: z.string().nullish(),
  suffix: z.string().nullish(),
  nickname: z.string().nullish(),
  organization: z.string().nullish(),
  jobTitle: z.string().nullish(),
  department: z.string().nullish(),
  birthday: z
    .string()
    .nullish()
    .describe('ISO date, or "--MM-DD" when the year is unknown'),
  notes: z.string().nullish(),
  starred: z.boolean().optional(),
  fields: z.array(fieldSchema).optional(),
  addresses: z.array(addressSchema).optional(),
  labelIds: z.array(z.string()).optional(),
};

const base64PhotoSchema = z
  .string()
  .min(1)
  .max(Math.ceil(IMPORT_LIMITS.maxPhotoBytes / 3) * 4)
  .regex(
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u,
    "Photo data must be standard base64.",
  );

async function requireContact(
  workspaceId: string,
  id: string,
): Promise<contactsService.ContactDetail> {
  const contact = await contactsService.getContact(workspaceId, id);
  if (!contact) throw new McpResourceNotFoundError("Contact", id);
  return contact;
}

export const contactTools: McpToolDefinition[] = [
  defineTool({
    name: "contacts_list",
    scope: "contacts:read",
    title: "Search the address book",
    description:
      "List contacts, newest search first. `query` matches names, organization, email and phone (a phone number matches with or without its formatting). Ids from here are the contactId every other contacts tool takes.",
    inputSchema: z.object({
      query: z.string().optional(),
      labelId: z.string().optional(),
      starred: z.boolean().optional(),
      page: z.number().int().min(1).optional(),
      pageSize: z.number().int().min(1).max(200).optional(),
    }),
    readOnly: true,
    handler: (args, ctx) => contactsService.list(ctx.workspaceId, args),
  }),

  defineTool({
    name: "contacts_get",
    scope: "contacts:read",
    title: "Read one contact",
    description:
      "Read a single contact with every email, phone, address, label and note it carries.",
    inputSchema: z.object({ contactId }),
    readOnly: true,
    handler: (args, ctx) => requireContact(ctx.workspaceId, args.contactId),
  }),

  defineTool({
    name: "contact_labels_list",
    scope: "contacts:read",
    title: "List contact labels",
    description:
      "List the workspace's contact labels with how many contacts carry each. Ids from here are the labelId contacts_create and contacts_update take.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) => contactLabelsService.listLabels(ctx.workspaceId),
  }),

  defineTool({
    name: "contacts_duplicates",
    scope: "contacts:read",
    title: "Find duplicate contacts",
    description:
      "Group contacts that share an email, a phone number or a display name. Feed a group's ids straight into contacts_merge.",
    inputSchema: z.object({}),
    readOnly: true,
    handler: (_args, ctx) =>
      contactsService.findDuplicateGroups(ctx.workspaceId),
  }),

  defineTool({
    name: "contacts_suggest",
    scope: "contacts:read",
    title: "Suggest mail recipients",
    description:
      "Look up email addresses by name or by address. Matches the address itself and the contact's searchable text, so a person's name finds their address.",
    inputSchema: z.object({
      query: z.string().min(1),
      limit: z.number().int().min(1).max(50).optional(),
    }),
    readOnly: true,
    handler: (args, ctx) =>
      contactsService.suggestRecipients(
        ctx.workspaceId,
        args.query,
        args.limit,
      ),
  }),

  defineTool({
    name: "contacts_export",
    scope: "contacts:read",
    title: "Export the address book",
    description:
      "Serialize contacts to vCard, Google CSV, Outlook CSV or LDIF and return the file's text. Select either explicit `contactIds` or the same filters contacts_list takes.",
    inputSchema: z.object({
      format: z.enum(CONTACT_EXPORT_FORMATS),
      contactIds: z.array(z.string()).max(10_000).optional(),
      labelId: z.string().optional(),
      query: z.string().optional(),
      starred: z.boolean().optional(),
    }),
    readOnly: true,
    handler: (args, ctx) =>
      contactsService.exportContacts(ctx.workspaceId, {
        ...args,
        // Only vCard can carry a photo, so only vCard pays for reading them.
        includePhotos: args.format.startsWith("vcard"),
      }),
  }),

  defineTool({
    name: "contacts_create",
    scope: "contacts:write",
    title: "Create a contact",
    description:
      "Create a contact. At least one of the name parts, the organization, or one entry in `fields` is required.",
    inputSchema: z.object({
      ...contactShape,
      idempotencyKey: idempotencyKeySchema.optional(),
    }),
    readOnly: false,
    handler: async ({ idempotencyKey, ...args }, ctx) => {
      const input = toInput(args);
      if (idempotencyKey === undefined) {
        return contactsService.createContact(ctx.workspaceId, null, input);
      }
      const result = await contactsService.createContactsIdempotent(
        ctx.workspaceId,
        null,
        ctx.tokenId,
        idempotencyKey,
        [input],
      );
      return requireContact(ctx.workspaceId, result.contacts[0].id);
    },
  }),

  defineTool({
    name: "contacts_create_many",
    scope: "contacts:write",
    title: "Create many contacts",
    description:
      "Atomically create up to 500 JSON contacts without duplicate matching. idempotencyKey makes retries return the original contact ids instead of creating duplicates. Unknown label ids reject the whole batch.",
    inputSchema: z.object({
      idempotencyKey: idempotencyKeySchema,
      contacts: z.array(z.object(contactShape)).min(1).max(CREATE_MANY_LIMIT),
    }),
    readOnly: false,
    idempotent: true,
    handler: ({ idempotencyKey, contacts }, ctx) =>
      contactsService.createContactsIdempotent(
        ctx.workspaceId,
        null,
        ctx.tokenId,
        idempotencyKey,
        contacts.map(toInput),
      ),
  }),

  defineTool({
    name: "contact_photo_set",
    scope: "contacts:write",
    title: "Set a contact photo",
    description:
      "Set one contact's JPEG, PNG, GIF or WebP photo from standard base64 data. The photo may be at most 2 MiB.",
    inputSchema: z.object({
      contactId,
      contentType: z.enum(CONTACT_PHOTO_CONTENT_TYPES),
      dataBase64: base64PhotoSchema,
    }),
    readOnly: false,
    idempotent: true,
    handler: async ({ contactId: id, contentType, dataBase64 }, ctx) => {
      await requireContact(ctx.workspaceId, id);
      await contactsService.setPhoto(
        ctx.workspaceId,
        null,
        id,
        {
          contentType,
          data: new Uint8Array(Buffer.from(dataBase64, "base64")),
        },
        IMPORT_LIMITS.maxPhotoBytes,
      );
      return { updated: id };
    },
  }),

  defineTool({
    name: "contacts_update",
    scope: "contacts:write",
    title: "Update a contact",
    description:
      "Replace a contact's details. `fields`, `addresses` and `labelIds` are written wholesale: send the full list you want the contact to end up with, not just the additions. Read it with contacts_get first.",
    inputSchema: z.object({ contactId, ...contactShape }),
    readOnly: false,
    handler: async ({ contactId: id, ...rest }, ctx) => {
      await requireContact(ctx.workspaceId, id);
      return contactsService.updateContact(
        ctx.workspaceId,
        null,
        id,
        toInput(rest),
      );
    },
  }),

  defineTool({
    name: "contacts_delete",
    scope: "contacts:write",
    title: "Delete a contact",
    description: "Delete one contact and everything attached to it.",
    inputSchema: z.object({ contactId }),
    readOnly: false,
    handler: async (args, ctx) => {
      await requireContact(ctx.workspaceId, args.contactId);
      await contactsService.deleteContact(
        ctx.workspaceId,
        null,
        args.contactId,
      );
      return { deleted: args.contactId };
    },
  }),

  defineTool({
    name: "contacts_bulk",
    scope: "contacts:write",
    title: "Act on many contacts at once",
    description:
      "Star, unstar, label, unlabel or delete up to 1000 contacts in one call. Ids outside the token's workspace are ignored rather than rejected; the answer says how many rows were actually touched.",
    inputSchema: z.object({
      contactIds: z.array(z.string()).min(1).max(1000),
      action: z.discriminatedUnion("type", [
        z.object({ type: z.literal("delete") }),
        z.object({ type: z.literal("star"), starred: z.boolean() }),
        z.object({ type: z.literal("addLabel"), labelId: z.string() }),
        z.object({ type: z.literal("removeLabel"), labelId: z.string() }),
      ]),
    }),
    readOnly: false,
    handler: async (args, ctx) => ({
      updated: await contactsService.bulkUpdate(
        ctx.workspaceId,
        null,
        args.contactIds,
        args.action,
      ),
    }),
  }),

  defineTool({
    name: "contacts_merge",
    scope: "contacts:write",
    title: "Merge duplicate contacts",
    description:
      "Fold every contact in `otherIds` into `primaryId` and delete them. The primary's own values win; anything the others knew that it lacked is appended. This cannot be undone.",
    inputSchema: z.object({
      primaryId: z.string(),
      otherIds: z.array(z.string()).min(1).max(50),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      contactsService.mergeContacts(
        ctx.workspaceId,
        null,
        args.primaryId,
        args.otherIds,
      ),
  }),

  defineTool({
    name: "contact_label_create",
    scope: "contacts:write",
    title: "Create a contact label",
    description:
      "Create a workspace contact label. Names are unique regardless of case.",
    inputSchema: z.object({
      name: z.string().min(1).max(60),
      color: z
        .string()
        .describe(
          "A preset name (SLATE, RED, AMBER, GREEN, BLUE, VIOLET) or a hex value such as #616367.",
        ),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      contactLabelsService.createLabel(
        ctx.workspaceId,
        null,
        contactLabelSchema.parse(args),
      ),
  }),

  defineTool({
    name: "contact_label_update",
    scope: "contacts:write",
    title: "Update a contact label",
    description: "Rename or recolor one contact label.",
    inputSchema: z.object({
      id: z.string(),
      name: z.string().min(1).max(60).optional(),
      color: z.string().optional(),
    }),
    readOnly: false,
    handler: ({ id, ...input }, ctx) =>
      contactLabelsService.updateLabel(
        ctx.workspaceId,
        null,
        id,
        contactLabelUpdateSchema.parse(input),
      ),
  }),

  defineTool({
    name: "contact_label_delete",
    scope: "contacts:write",
    title: "Delete a contact label",
    description:
      "Delete one contact label. The contacts carrying it keep their other labels.",
    inputSchema: z.object({ id: z.string() }),
    readOnly: false,
    handler: async (args, ctx) => {
      await contactLabelsService.deleteLabel(ctx.workspaceId, null, args.id);
      return { deleted: args.id };
    },
  }),

  defineTool({
    name: "contacts_import",
    scope: "contacts:write",
    title: "Import an address book",
    description:
      "Import contacts from the text of a vCard (2.1, 3.0, 4.0), Google CSV, Outlook CSV or LDIF file. The format is detected from the content. Returns how many contacts were created, updated and skipped.",
    inputSchema: z.object({
      content: z.string().min(1).describe("The file's text content"),
      format: z
        .enum(CONTACT_IMPORT_FORMATS)
        .optional()
        .describe(
          "Override the detected format when the content is ambiguous.",
        ),
      duplicateStrategy: z
        .enum(["skip", "update", "create"])
        .optional()
        .describe(
          "What to do when a contact with the same email, phone or name already exists. Defaults to skip.",
        ),
    }),
    readOnly: false,
    handler: (args, ctx) =>
      contactsService.importContacts(
        ctx.workspaceId,
        null,
        new TextEncoder().encode(args.content),
        {
          format: args.format,
          duplicateStrategy: args.duplicateStrategy ?? "skip",
          maxContacts: IMPORT_LIMITS.maxContacts,
          maxPhotoBytes: IMPORT_LIMITS.maxPhotoBytes,
        },
      ),
  }),
];

type ContactArgs = {
  [K in keyof typeof contactShape]?: unknown;
};

/** Zod's `nullish()` yields `T | null | undefined`; the service wants `T | null`. */
function toInput(args: ContactArgs): contactsService.ContactInput {
  const scalar = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  return {
    prefix: scalar(args.prefix),
    firstName: scalar(args.firstName),
    middleName: scalar(args.middleName),
    lastName: scalar(args.lastName),
    suffix: scalar(args.suffix),
    nickname: scalar(args.nickname),
    organization: scalar(args.organization),
    jobTitle: scalar(args.jobTitle),
    department: scalar(args.department),
    birthday: scalar(args.birthday),
    notes: scalar(args.notes),
    starred: args.starred === true,
    fields: ((args.fields ?? []) as z.output<typeof fieldSchema>[]).map(
      (field) => ({
        kind: field.kind,
        label: scalar(field.label),
        value: field.value,
        isPrimary: field.isPrimary ?? false,
      }),
    ),
    addresses: ((args.addresses ?? []) as z.output<typeof addressSchema>[]).map(
      (address) => ({
        label: scalar(address.label),
        street: scalar(address.street),
        extended: scalar(address.extended),
        poBox: scalar(address.poBox),
        city: scalar(address.city),
        region: scalar(address.region),
        postalCode: scalar(address.postalCode),
        country: scalar(address.country),
        formatted: null,
      }),
    ),
    labelIds: (args.labelIds ?? []) as string[],
  };
}
