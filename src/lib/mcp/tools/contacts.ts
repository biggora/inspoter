import { z } from "zod";
import * as contactsService from "@/lib/services/contacts";
import * as contactLabelsService from "@/lib/services/contact-labels";
import { defineTool, type McpToolDefinition } from "@/lib/mcp/tool";
import { McpResourceNotFoundError } from "@/lib/mcp/errors";
import { CONTACT_FIELD_KINDS } from "@/lib/contacts/model";

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
    name: "contacts_create",
    scope: "contacts:write",
    title: "Create a contact",
    description:
      "Create a contact. At least one of the name parts, the organization, or one entry in `fields` is required.",
    inputSchema: z.object(contactShape),
    readOnly: false,
    handler: (args, ctx) =>
      contactsService.createContact(ctx.workspaceId, null, toInput(args)),
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
    name: "contacts_import",
    scope: "contacts:write",
    title: "Import an address book",
    description:
      "Import contacts from the text of a vCard (2.1, 3.0, 4.0), Google CSV, Outlook CSV or LDIF file. The format is detected from the content. Returns how many contacts were created, updated and skipped.",
    inputSchema: z.object({
      content: z.string().min(1).describe("The file's text content"),
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
          duplicateStrategy: args.duplicateStrategy ?? "skip",
          maxContacts: IMPORT_LIMITS.maxContacts,
          maxPhotoBytes: IMPORT_LIMITS.maxPhotoBytes,
        },
      ),
  }),
];

// The MCP surface takes contacts as text rather than as an upload, so the
// byte-size ceiling the HTTP route enforces does not apply; the row and photo
// caps still do.
const IMPORT_LIMITS = { maxContacts: 10_000, maxPhotoBytes: 2_097_152 };

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
