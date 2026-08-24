import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { ContactFieldKind } from "@/lib/contacts/model";
import type { ContactLabelSummary } from "@/lib/services/contact-labels";
import type {
  ContactBulkAction,
  ContactDetail,
  ContactListItem,
  ContactListResult,
  DuplicateGroup,
  RecipientSuggestion,
} from "@/lib/services/contacts";
import type { ContactListQuery, ContactPayload } from "./api";

// WebMCP tools for Contacts. Names mirror the server-side catalog in
// src/lib/mcp/tools/contacts.ts one-for-one (including its plural-for-single
// -record quirk, `contacts_create`/`contacts_update`/`contacts_delete`), so an
// agent that knows one surface knows the other. The two registries are
// independent, so the shared names never collide.
//
// Everything is addressed by id: no free-text resolution here, unlike the
// kanban tools. `contacts_list` is the entry point that hands out the ids the
// rest of the domain takes.
//
// Every api call arrives through `deps` rather than being imported, so the
// suite can exercise the tools with `vi.fn()` stand-ins and no React.

export interface ContactsToolDeps {
  /** Bound contactsApi.list. */
  list: (query?: ContactListQuery) => Promise<ContactListResult>;
  /** Bound contactsApi.get. */
  get: (id: string) => Promise<ContactDetail>;
  /** Bound contactsApi.duplicates. */
  duplicates: () => Promise<{ groups: DuplicateGroup[] }>;
  /** Bound contactsApi.suggest. */
  suggest: (query: string) => Promise<{ suggestions: RecipientSuggestion[] }>;
  /** Bound contactsApi.create. */
  create: (payload: ContactPayload) => Promise<ContactDetail>;
  /** Bound contactsApi.update — a FULL replace, see `mergeWrite`. */
  update: (id: string, payload: ContactPayload) => Promise<ContactDetail>;
  /** Bound contactsApi.remove. */
  remove: (id: string) => Promise<void>;
  /** Bound contactsApi.bulk. */
  bulk: (
    contactIds: string[],
    action: ContactBulkAction,
  ) => Promise<{ affected: number }>;
  /** Bound contactsApi.merge. */
  merge: (primaryId: string, otherIds: string[]) => Promise<ContactDetail>;
  /** Bound contactLabelsApi.list. */
  listLabels: () => Promise<ContactLabelSummary[]>;
  /** Bound contactLabelsApi.create. */
  createLabel: (name: string, color: string) => Promise<ContactLabelSummary>;
  /** Bound contactLabelsApi.update. */
  updateLabel: (
    id: string,
    input: { name?: string; color?: string },
  ) => Promise<ContactLabelSummary>;
  /** Bound contactLabelsApi.remove. */
  removeLabel: (id: string) => Promise<void>;
  /** Re-runs the server fetch so any visible contacts UI reflects a mutation. */
  refresh: () => void;
}

// --- payload plumbing -------------------------------------------------------

// Typed against the real union rather than written as bare strings, so an
// invalid kind fails the build instead of the request.
const EMAIL_KIND: ContactFieldKind = "EMAIL";
const PHONE_KIND: ContactFieldKind = "PHONE";

/** The natural subset of a contact these tools let an agent write. */
interface ContactWriteInput {
  firstName?: string;
  lastName?: string;
  organization?: string;
  jobTitle?: string;
  email?: string;
  phone?: string;
  notes?: string;
  starred?: boolean;
  labelIds?: string[];
}

function emptyPayload(): ContactPayload {
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
    labelIds: [],
  };
}

/** The existing record, flattened back into the full-replace payload shape. */
function toPayload(contact: ContactDetail): ContactPayload {
  return {
    prefix: contact.prefix,
    firstName: contact.firstName,
    middleName: contact.middleName,
    lastName: contact.lastName,
    suffix: contact.suffix,
    phoneticFirst: contact.phoneticFirst,
    phoneticMiddle: contact.phoneticMiddle,
    phoneticLast: contact.phoneticLast,
    nickname: contact.nickname,
    fileAs: contact.fileAs,
    organization: contact.organization,
    jobTitle: contact.jobTitle,
    department: contact.department,
    birthday: contact.birthday,
    notes: contact.notes,
    starred: contact.starred,
    fields: contact.fields.map((field) => ({
      kind: field.kind,
      label: field.label,
      value: field.value,
      isPrimary: field.isPrimary,
    })),
    addresses: contact.addresses.map((address) => ({
      label: address.label,
      poBox: address.poBox,
      extended: address.extended,
      street: address.street,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      formatted: address.formatted,
    })),
    labelIds: contact.labels.map((label) => label.id),
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Writes `value` onto the first field of `kind`, or appends a new primary one.
 * Fields of other kinds are left alone, which is what keeps a URL or a second
 * phone number alive through an update that only touches the email.
 */
function setField(
  fields: ContactPayload["fields"],
  kind: ContactFieldKind,
  value: string,
): ContactPayload["fields"] {
  const index = fields.findIndex((field) => field.kind === kind);
  if (index === -1) {
    return [...fields, { kind, label: null, value, isPrimary: true }];
  }
  return fields.map((field, position) =>
    position === index ? { ...field, value } : field,
  );
}

/**
 * Lays the caller's changes over `base`. Everything the caller left out keeps
 * whatever `base` held — the reason `contacts_update` reads the contact first
 * instead of handing the api a payload built from the arguments alone.
 */
function mergeWrite(
  base: ContactPayload,
  input: ContactWriteInput,
): ContactPayload {
  const next: ContactPayload = { ...base };

  if (input.firstName !== undefined) next.firstName = orNull(input.firstName);
  if (input.lastName !== undefined) next.lastName = orNull(input.lastName);
  if (input.organization !== undefined) {
    next.organization = orNull(input.organization);
  }
  if (input.jobTitle !== undefined) next.jobTitle = orNull(input.jobTitle);
  if (input.notes !== undefined) next.notes = orNull(input.notes);
  if (input.starred !== undefined) next.starred = input.starred;
  if (input.labelIds !== undefined) next.labelIds = [...input.labelIds];
  if (input.email !== undefined) {
    next.fields = setField(next.fields, EMAIL_KIND, input.email);
  }
  if (input.phone !== undefined) {
    next.fields = setField(next.fields, PHONE_KIND, input.phone);
  }

  return next;
}

/** A contact with no name and no organization is not a contact. */
function requireIdentity(payload: ContactPayload): void {
  if (payload.firstName ?? payload.lastName ?? payload.organization) return;
  throw new Error(
    "A contact needs at least one of firstName, lastName or organization.",
  );
}

// --- result projections -----------------------------------------------------

/** Identifying fields only — contacts_get is where the whole record lives. */
function toRow(contact: ContactListItem) {
  return {
    id: contact.id,
    name: contact.displayName,
    organization: contact.organization,
    email: contact.primaryEmail,
    phone: contact.primaryPhone,
  };
}

// --- shared input pieces ----------------------------------------------------

const contactId = z
  .string()
  .min(1)
  .describe("Contact id from contacts_list or contacts_get");

const labelId = z
  .string()
  .min(1)
  .describe("Contact label id from contact_labels_list");

const contactWriteShape = {
  firstName: z.string().max(100).optional().describe("Given name"),
  lastName: z.string().max(100).optional().describe("Family name"),
  organization: z
    .string()
    .max(200)
    .optional()
    .describe("Company or organization the contact belongs to"),
  jobTitle: z
    .string()
    .max(200)
    .optional()
    .describe("Role the contact holds at the organization"),
  email: z.email().optional().describe("Primary email address"),
  phone: z
    .string()
    .min(1)
    .max(50)
    .optional()
    .describe("Primary phone number, in whatever formatting the user gave"),
  notes: z
    .string()
    .max(5000)
    .optional()
    .describe("Free-text note kept on the contact"),
  starred: z.boolean().optional().describe("Whether the contact is starred"),
  labelIds: z
    .array(labelId)
    .max(50)
    .optional()
    .describe("Label ids from contact_labels_list; replaces the whole set"),
};

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

// --- reads ------------------------------------------------------------------

function createListTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_list",
    title: "List contacts",
    description:
      "Lists contacts in the workspace, optionally narrowed by a search query, a label or the starred flag. Returns one compact row per contact — id, display name, organization and primary email and phone. Ids from here are the contactId every other contacts tool takes. Use contacts_get for a contact's full record.",
    inputSchema: z
      .object({
        query: z
          .string()
          .min(1)
          .max(200)
          .optional()
          .describe("Matches names, organization, email and phone"),
        labelId: labelId.optional(),
        starred: z
          .boolean()
          .optional()
          .describe("Set true to list only starred contacts"),
        page: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("1-based page number"),
        pageSize: z
          .number()
          .int()
          .min(1)
          .max(MAX_PAGE_SIZE)
          .default(DEFAULT_PAGE_SIZE)
          .describe("Contacts per page"),
      })
      .strict(),
    readOnly: true,
    // Names, organizations and the rest are operator-authored free text.
    untrustedOutput: true,
    async handler(input) {
      const result = await deps.list(input);
      return {
        total: result.total,
        page: result.page,
        pageSize: result.pageSize,
        contacts: result.contacts.map(toRow),
      };
    },
  });
}

function createGetTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_get",
    title: "Read one contact",
    description:
      "Reads a single contact in full: every name part, the organization, all emails, phones and other fields, all postal addresses, the labels and the notes.",
    inputSchema: z.object({ contactId }).strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler({ contactId: id }) {
      const contact = await deps.get(id);
      return {
        id: contact.id,
        name: contact.displayName,
        prefix: contact.prefix,
        firstName: contact.firstName,
        middleName: contact.middleName,
        lastName: contact.lastName,
        suffix: contact.suffix,
        nickname: contact.nickname,
        organization: contact.organization,
        jobTitle: contact.jobTitle,
        department: contact.department,
        birthday: contact.birthday,
        notes: contact.notes,
        starred: contact.starred,
        fields: contact.fields.map((field) => ({
          kind: field.kind,
          label: field.label,
          value: field.value,
          isPrimary: field.isPrimary,
        })),
        addresses: contact.addresses.map((address) => ({
          label: address.label,
          street: address.street,
          city: address.city,
          region: address.region,
          postalCode: address.postalCode,
          country: address.country,
        })),
        labels: contact.labels.map((label) => ({
          id: label.id,
          name: label.name,
        })),
      };
    },
  });
}

function createLabelsListTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contact_labels_list",
    title: "List contact labels",
    description:
      "Lists the workspace's contact labels with how many contacts carry each. Ids from here are the labelId contacts_list, contacts_create, contacts_update and contacts_bulk take.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    // Label names are operator-authored.
    untrustedOutput: true,
    async handler() {
      const labels = await deps.listLabels();
      return {
        labels: labels.map((label) => ({
          id: label.id,
          name: label.name,
          contactCount: label.contactCount,
        })),
      };
    },
  });
}

function createSuggestTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_suggest",
    title: "Suggest mail recipients",
    description:
      "Looks up email addresses by a person's name or by part of the address itself. Use this to turn a name into an address when composing mail.",
    inputSchema: z
      .object({
        query: z
          .string()
          .min(1)
          .max(200)
          .describe("Part of a name or of an email address"),
      })
      .strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler({ query }) {
      const result = await deps.suggest(query);
      return {
        suggestions: result.suggestions.map((suggestion) => ({
          contactId: suggestion.contactId,
          name: suggestion.displayName,
          email: suggestion.email,
        })),
      };
    },
  });
}

function createDuplicatesTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_duplicates",
    title: "Find duplicate contacts",
    description:
      "Groups contacts that share an email, a phone number or a display name. Feed one group's ids straight into contacts_merge.",
    inputSchema: z.object({}).strict(),
    readOnly: true,
    untrustedOutput: true,
    async handler() {
      const result = await deps.duplicates();
      return {
        groups: result.groups.map((group: DuplicateGroup) => ({
          contacts: group.contacts.map(toRow),
        })),
      };
    },
  });
}

// --- writes -----------------------------------------------------------------

function createCreateTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_create",
    title: "Create a contact",
    description:
      "Creates a contact. At least one of firstName, lastName or organization is required. email and phone are stored as the contact's primary address and number; everything not given is left empty.",
    inputSchema: z.object(contactWriteShape).strict(),
    readOnly: false,
    untrustedOutput: true,
    async handler(input) {
      const payload = mergeWrite(emptyPayload(), input);
      requireIdentity(payload);

      const created = await deps.create(payload);
      deps.refresh();
      return { contactId: created.id, name: created.displayName };
    },
  });
}

function createUpdateTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_update",
    title: "Update a contact",
    description:
      "Updates a contact. Reads the contact first and lays the given values over it, so anything omitted keeps its current value — addresses, extra fields and unmentioned names all survive. Pass an empty string to clear a text field. labelIds, when given, replaces the whole label set.",
    inputSchema: z.object({ contactId, ...contactWriteShape }).strict(),
    readOnly: false,
    untrustedOutput: true,
    async handler({ contactId: id, ...input }) {
      // The api's update is a full replace, so a payload built from the
      // arguments alone would silently wipe everything the caller omitted.
      const existing = await deps.get(id);
      const payload = mergeWrite(toPayload(existing), input);
      requireIdentity(payload);

      const updated = await deps.update(id, payload);
      deps.refresh();
      return { contactId: updated.id, name: updated.displayName };
    },
  });
}

function createDeleteTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_delete",
    title: "Delete a contact",
    description:
      "Deletes one contact and everything attached to it — fields, addresses and label assignments. This cannot be undone.",
    inputSchema: z.object({ contactId }).strict(),
    readOnly: false,
    async handler({ contactId: id }) {
      await deps.remove(id);
      deps.refresh();
      return { deleted: id };
    },
  });
}

function createBulkTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_bulk",
    title: "Act on many contacts",
    description:
      "Stars, unstars, labels, unlabels or deletes many contacts in one call. Ids come from contacts_list; the answer says how many rows were actually touched.",
    inputSchema: z
      .object({
        contactIds: z
          .array(contactId)
          .min(1)
          .max(200)
          .describe("Contact ids from contacts_list"),
        action: z
          .discriminatedUnion("type", [
            z.object({ type: z.literal("delete") }),
            z.object({ type: z.literal("star"), starred: z.boolean() }),
            z.object({ type: z.literal("addLabel"), labelId }),
            z.object({ type: z.literal("removeLabel"), labelId }),
          ])
          .describe(
            'What to do: {"type":"delete"}, {"type":"star","starred":true}, or {"type":"addLabel","labelId":"..."}',
          ),
      })
      .strict(),
    readOnly: false,
    async handler({ contactIds, action }) {
      const result = await deps.bulk(contactIds, action);
      deps.refresh();
      return { affected: result.affected };
    },
  });
}

function createMergeTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contacts_merge",
    title: "Merge duplicate contacts",
    description:
      "Folds every contact in otherIds into primaryId and deletes them. The primary's own values win; anything the others knew that it lacked is appended. Use contacts_duplicates to find candidates. This cannot be undone.",
    inputSchema: z
      .object({
        primaryId: z
          .string()
          .min(1)
          .describe("Contact id from contacts_list that survives the merge"),
        otherIds: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("Contact ids from contacts_list that are folded in"),
      })
      .strict(),
    readOnly: false,
    untrustedOutput: true,
    async handler({ primaryId, otherIds }) {
      const merged = await deps.merge(primaryId, otherIds);
      deps.refresh();
      return {
        contactId: merged.id,
        name: merged.displayName,
        mergedCount: otherIds.length,
      };
    },
  });
}

function createLabelCreateTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contact_label_create",
    title: "Create a contact label",
    description:
      "Creates a workspace contact label. Names are unique regardless of case.",
    inputSchema: z
      .object({
        name: z.string().min(1).max(60).describe("Label name"),
        color: z
          .string()
          .min(1)
          .describe(
            "A preset (SLATE, RED, AMBER, GREEN, BLUE, VIOLET) or a hex value such as #616367",
          ),
      })
      .strict(),
    readOnly: false,
    untrustedOutput: true,
    async handler({ name, color }) {
      const label = await deps.createLabel(name, color);
      deps.refresh();
      return { labelId: label.id, name: label.name, color: label.color };
    },
  });
}

function createLabelUpdateTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contact_label_update",
    title: "Update a contact label",
    description:
      "Renames or recolors one contact label. Anything omitted keeps its current value.",
    inputSchema: z
      .object({
        labelId,
        name: z.string().min(1).max(60).optional().describe("New label name"),
        color: z
          .string()
          .min(1)
          .optional()
          .describe("A preset name or a hex value such as #616367"),
      })
      .strict(),
    readOnly: false,
    untrustedOutput: true,
    async handler({ labelId: id, name, color }) {
      const label = await deps.updateLabel(id, { name, color });
      deps.refresh();
      return { labelId: label.id, name: label.name, color: label.color };
    },
  });
}

function createLabelDeleteTool(deps: ContactsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "contact_label_delete",
    title: "Delete a contact label",
    description:
      "Deletes one contact label. The contacts carrying it keep their other labels and are not themselves deleted.",
    inputSchema: z.object({ labelId }).strict(),
    readOnly: false,
    async handler({ labelId: id }) {
      await deps.removeLabel(id);
      deps.refresh();
      return { deleted: id };
    },
  });
}

/** Every Contacts WebMCP tool, in catalog order: reads first, then writes. */
export function createContactsTools(deps: ContactsToolDeps): WebMcpTool[] {
  return [
    createListTool(deps),
    createGetTool(deps),
    createLabelsListTool(deps),
    createSuggestTool(deps),
    createDuplicatesTool(deps),
    createCreateTool(deps),
    createUpdateTool(deps),
    createDeleteTool(deps),
    createBulkTool(deps),
    createMergeTool(deps),
    createLabelCreateTool(deps),
    createLabelUpdateTool(deps),
    createLabelDeleteTool(deps),
  ];
}
