import { Prisma, type ContactFieldKind } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  parseContactsFile,
  serializeContacts,
  type ContactExportFormat,
  type ContactImportFormat,
  type SerializedContactsFile,
} from "@/lib/contacts/formats";
import { mergeContactRecords } from "@/lib/contacts/merge";
import {
  createEmptyContactRecord,
  type ContactAddressRecord,
  type ContactFieldRecord,
  type ContactPhotoRecord,
  type ContactRecord,
} from "@/lib/contacts/model";
import {
  buildDisplayName,
  buildSearchText,
  buildSortKey,
  duplicateKeys,
  normalizeFieldValue,
} from "@/lib/contacts/normalize";
import { resolveLabelIds } from "@/lib/services/contact-labels";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";

// The only module that knows both the format-neutral ContactRecord
// (src/lib/contacts) and the Prisma rows. Everything above it — routes, MCP
// tools, the UI — speaks in the types declared here.

/**
 * Write gate for both callers. A session caller passes the operator id and
 * must be a member of the workspace; an API-token caller passes null, because
 * the token itself is the workspace-scoped authority (resolved in
 * src/lib/api/token-auth.ts) and there is no operator behind it.
 */
async function requireWriteAccess(
  workspaceId: string,
  operatorId: string | null,
): Promise<void> {
  if (operatorId !== null)
    await requireWorkspaceMember(workspaceId, operatorId);
}

export class ContactNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "ContactNotFoundError";
  }
}

export class ContactImportTooLargeError extends Error {
  readonly code = "CONTACT_IMPORT_TOO_LARGE";

  constructor(readonly limit: number) {
    super(`The file holds more than ${limit} contacts.`);
    this.name = "ContactImportTooLargeError";
  }
}

export class ContactPhotoTooLargeError extends Error {
  readonly code = "CONTACT_PHOTO_TOO_LARGE";

  constructor(readonly limit: number) {
    super(`The photo is larger than ${limit} bytes.`);
    this.name = "ContactPhotoTooLargeError";
  }
}

export class ContactMergeValidationError extends Error {
  readonly code = "CONTACT_MERGE_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "ContactMergeValidationError";
  }
}

// --- Shapes -----------------------------------------------------------------

export interface ContactLabelRef {
  id: string;
  name: string;
  color: string;
}

export interface ContactListItem {
  id: string;
  displayName: string;
  organization: string | null;
  jobTitle: string | null;
  starred: boolean;
  hasPhoto: boolean;
  primaryEmail: string | null;
  primaryPhone: string | null;
  labels: ContactLabelRef[];
}

export interface ContactDetail extends ContactListItem {
  prefix: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  suffix: string | null;
  phoneticFirst: string | null;
  phoneticMiddle: string | null;
  phoneticLast: string | null;
  nickname: string | null;
  fileAs: string | null;
  department: string | null;
  birthday: string | null;
  notes: string | null;
  fields: (ContactFieldRecord & { id: string })[];
  addresses: (ContactAddressRecord & { id: string })[];
  updatedAt: Date;
}

export interface ContactFieldInput {
  kind: ContactFieldKind;
  label?: string | null;
  value: string;
  isPrimary?: boolean;
}

export type ContactAddressInput = Partial<ContactAddressRecord>;

export interface ContactInput {
  prefix?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  phoneticFirst?: string | null;
  phoneticMiddle?: string | null;
  phoneticLast?: string | null;
  nickname?: string | null;
  fileAs?: string | null;
  organization?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  birthday?: string | null;
  notes?: string | null;
  starred?: boolean;
  fields?: ContactFieldInput[];
  addresses?: ContactAddressInput[];
  labelIds?: string[];
}

export interface ListContactsOptions {
  query?: string;
  labelId?: string;
  starred?: boolean;
  page?: number;
  pageSize?: number;
}

export interface ContactListResult {
  contacts: ContactListItem[];
  total: number;
  page: number;
  pageSize: number;
}

export const DEFAULT_CONTACT_PAGE_SIZE = 50;
export const MAX_CONTACT_PAGE_SIZE = 200;

// --- Row selection ----------------------------------------------------------

const LIST_SELECT = {
  id: true,
  displayName: true,
  organization: true,
  jobTitle: true,
  starred: true,
  photoContentType: true,
  fields: {
    where: { kind: { in: ["EMAIL", "PHONE"] as ContactFieldKind[] } },
    select: { kind: true, value: true, isPrimary: true, position: true },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  },
  labels: {
    select: { label: { select: { id: true, name: true, color: true } } },
  },
} satisfies Prisma.ContactSelect;

const DETAIL_SELECT = {
  ...LIST_SELECT,
  prefix: true,
  firstName: true,
  middleName: true,
  lastName: true,
  suffix: true,
  phoneticFirst: true,
  phoneticMiddle: true,
  phoneticLast: true,
  nickname: true,
  fileAs: true,
  department: true,
  birthday: true,
  notes: true,
  updatedAt: true,
  fields: {
    select: {
      id: true,
      kind: true,
      label: true,
      value: true,
      isPrimary: true,
      position: true,
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  },
  addresses: {
    select: {
      id: true,
      label: true,
      poBox: true,
      extended: true,
      street: true,
      city: true,
      region: true,
      postalCode: true,
      country: true,
      formatted: true,
      position: true,
    },
    orderBy: [{ position: "asc" }, { id: "asc" }],
  },
} satisfies Prisma.ContactSelect;

type ListRow = Prisma.ContactGetPayload<{ select: typeof LIST_SELECT }>;
type DetailRow = Prisma.ContactGetPayload<{ select: typeof DETAIL_SELECT }>;

function firstValue(
  fields: readonly {
    kind: ContactFieldKind;
    value: string;
    isPrimary: boolean;
  }[],
  kind: ContactFieldKind,
): string | null {
  const matching = fields.filter((field) => field.kind === kind);
  return (
    matching.find((field) => field.isPrimary)?.value ??
    matching[0]?.value ??
    null
  );
}

function toListItem(row: ListRow): ContactListItem {
  return {
    id: row.id,
    displayName: row.displayName,
    organization: row.organization,
    jobTitle: row.jobTitle,
    starred: row.starred,
    hasPhoto: row.photoContentType !== null,
    primaryEmail: firstValue(row.fields, "EMAIL"),
    primaryPhone: firstValue(row.fields, "PHONE"),
    labels: row.labels.map((assignment) => assignment.label),
  };
}

function toDetail(row: DetailRow): ContactDetail {
  return {
    ...toListItem(row as ListRow),
    prefix: row.prefix,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    suffix: row.suffix,
    phoneticFirst: row.phoneticFirst,
    phoneticMiddle: row.phoneticMiddle,
    phoneticLast: row.phoneticLast,
    nickname: row.nickname,
    fileAs: row.fileAs,
    department: row.department,
    birthday: row.birthday,
    notes: row.notes,
    updatedAt: row.updatedAt,
    fields: row.fields.map((field) => ({
      id: field.id,
      kind: field.kind,
      label: field.label,
      value: field.value,
      isPrimary: field.isPrimary,
    })),
    addresses: row.addresses.map((address) => ({
      id: address.id,
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
  };
}

/** Prisma row -> the format-neutral record the exporters and merge take. */
function toRecord(
  row: DetailRow,
  photo: ContactPhotoRecord | null,
): ContactRecord {
  return {
    prefix: row.prefix,
    firstName: row.firstName,
    middleName: row.middleName,
    lastName: row.lastName,
    suffix: row.suffix,
    phoneticFirst: row.phoneticFirst,
    phoneticMiddle: row.phoneticMiddle,
    phoneticLast: row.phoneticLast,
    nickname: row.nickname,
    fileAs: row.fileAs,
    organization: row.organization,
    jobTitle: row.jobTitle,
    department: row.department,
    birthday: row.birthday,
    notes: row.notes,
    starred: row.starred,
    fields: row.fields.map((field) => ({
      kind: field.kind,
      label: field.label,
      value: field.value,
      isPrimary: field.isPrimary,
    })),
    addresses: row.addresses.map((address) => ({
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
    labels: row.labels.map((assignment) => assignment.label.name),
    photo,
  };
}

function inputToRecord(
  input: ContactInput,
  labelNames: readonly string[],
): ContactRecord {
  return {
    ...createEmptyContactRecord(),
    prefix: input.prefix ?? null,
    firstName: input.firstName ?? null,
    middleName: input.middleName ?? null,
    lastName: input.lastName ?? null,
    suffix: input.suffix ?? null,
    phoneticFirst: input.phoneticFirst ?? null,
    phoneticMiddle: input.phoneticMiddle ?? null,
    phoneticLast: input.phoneticLast ?? null,
    nickname: input.nickname ?? null,
    fileAs: input.fileAs ?? null,
    organization: input.organization ?? null,
    jobTitle: input.jobTitle ?? null,
    department: input.department ?? null,
    birthday: input.birthday ?? null,
    notes: input.notes ?? null,
    starred: input.starred ?? false,
    fields: (input.fields ?? []).map((field) => ({
      kind: field.kind,
      label: field.label ?? null,
      value: field.value,
      isPrimary: field.isPrimary ?? false,
    })),
    addresses: (input.addresses ?? []).map((address) => ({
      label: address.label ?? null,
      poBox: address.poBox ?? null,
      extended: address.extended ?? null,
      street: address.street ?? null,
      city: address.city ?? null,
      region: address.region ?? null,
      postalCode: address.postalCode ?? null,
      country: address.country ?? null,
      formatted: address.formatted ?? null,
    })),
    labels: [...labelNames],
  };
}

// --- Writes -----------------------------------------------------------------

/**
 * Writes a record's scalars, fields, addresses and label assignments. Children
 * are replaced wholesale rather than diffed: a contact holds a handful of rows,
 * and "the list you sent is the list that exists" is far easier to reason about
 * than a three-way merge with client-held ids.
 *
 * `photo` undefined leaves the stored photo alone; null clears it.
 */
async function persistContact(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  contactId: string | null,
  record: ContactRecord,
  labelIds: readonly string[],
  photo?: ContactPhotoRecord | null,
): Promise<string> {
  const displayName = buildDisplayName(record);
  const scalars = {
    prefix: record.prefix,
    firstName: record.firstName,
    middleName: record.middleName,
    lastName: record.lastName,
    suffix: record.suffix,
    phoneticFirst: record.phoneticFirst,
    phoneticMiddle: record.phoneticMiddle,
    phoneticLast: record.phoneticLast,
    nickname: record.nickname,
    fileAs: record.fileAs,
    organization: record.organization,
    jobTitle: record.jobTitle,
    department: record.department,
    birthday: record.birthday,
    notes: record.notes,
    starred: record.starred,
    displayName,
    sortKey: buildSortKey(displayName),
    searchText: buildSearchText(record),
    ...(photo === undefined
      ? {}
      : photo === null
        ? { photo: null, photoContentType: null }
        : {
            photo: Buffer.from(photo.data),
            photoContentType: photo.contentType,
          }),
  };

  const id =
    contactId === null
      ? (
          await tx.contact.create({
            data: { workspaceId, ...scalars },
            select: { id: true },
          })
        ).id
      : (
          await tx.contact.update({
            where: { id_workspaceId: { id: contactId, workspaceId } },
            data: scalars,
            select: { id: true },
          })
        ).id;

  if (contactId !== null) {
    await tx.contactField.deleteMany({ where: { workspaceId, contactId: id } });
    await tx.contactAddress.deleteMany({
      where: { workspaceId, contactId: id },
    });
    await tx.contactLabelAssignment.deleteMany({
      where: { workspaceId, contactId: id },
    });
  }

  if (record.fields.length > 0) {
    await tx.contactField.createMany({
      data: record.fields.map((field, position) => ({
        workspaceId,
        contactId: id,
        contactWorkspaceId: workspaceId,
        kind: field.kind,
        label: field.label,
        value: field.value,
        normalizedValue: normalizeFieldValue(field),
        isPrimary: field.isPrimary,
        position,
      })),
    });
  }
  if (record.addresses.length > 0) {
    await tx.contactAddress.createMany({
      data: record.addresses.map((address, position) => ({
        workspaceId,
        contactId: id,
        contactWorkspaceId: workspaceId,
        ...address,
        position,
      })),
    });
  }
  const uniqueLabelIds = [...new Set(labelIds)];
  if (uniqueLabelIds.length > 0) {
    await tx.contactLabelAssignment.createMany({
      data: uniqueLabelIds.map((labelId) => ({
        workspaceId,
        contactId: id,
        contactWorkspaceId: workspaceId,
        labelId,
        labelWorkspaceId: workspaceId,
      })),
      skipDuplicates: true,
    });
  }

  return id;
}

async function labelNamesFor(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  labelIds: readonly string[],
): Promise<string[]> {
  if (labelIds.length === 0) return [];
  const labels = await tx.contactLabel.findMany({
    where: { workspaceId, id: { in: [...labelIds] } },
    select: { id: true, name: true },
  });
  // Ids that do not resolve are dropped rather than rejected: a label deleted
  // while a form was open should not fail the save.
  return labels.map((label) => label.name);
}

export async function createContact(
  workspaceId: string,
  operatorId: string | null,
  input: ContactInput,
): Promise<ContactDetail> {
  await requireWriteAccess(workspaceId, operatorId);
  const id = await db.$transaction(async (tx) => {
    const labelIds = await existingLabelIds(tx, workspaceId, input.labelIds);
    const record = inputToRecord(
      input,
      await labelNamesFor(tx, workspaceId, labelIds),
    );
    return persistContact(tx, workspaceId, null, record, labelIds);
  });
  return (await getContact(workspaceId, id))!;
}

export async function updateContact(
  workspaceId: string,
  operatorId: string | null,
  id: string,
  input: ContactInput,
): Promise<ContactDetail> {
  await requireContactInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  await db.$transaction(async (tx) => {
    const labelIds = await existingLabelIds(tx, workspaceId, input.labelIds);
    const record = inputToRecord(
      input,
      await labelNamesFor(tx, workspaceId, labelIds),
    );
    await persistContact(tx, workspaceId, id, record, labelIds);
  });
  return (await getContact(workspaceId, id))!;
}

async function existingLabelIds(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  labelIds: readonly string[] | undefined,
): Promise<string[]> {
  if (!labelIds || labelIds.length === 0) return [];
  const labels = await tx.contactLabel.findMany({
    where: { workspaceId, id: { in: [...labelIds] } },
    select: { id: true },
  });
  return labels.map((label) => label.id);
}

export async function deleteContact(
  workspaceId: string,
  operatorId: string | null,
  id: string,
): Promise<void> {
  await requireContactInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  await db.contact.delete({ where: { id_workspaceId: { id, workspaceId } } });
}

async function requireContactInWorkspace(
  workspaceId: string,
  id: string,
): Promise<void> {
  const contact = await db.contact.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!contact) throw new ContactNotFoundError();
}

// --- Reads ------------------------------------------------------------------

/**
 * Turns a search box into a set of conditions. Every token must appear, so
 * "anna riga" narrows rather than widens; a token that looks like part of a
 * phone number is also tried with its formatting stripped, because nobody
 * types the spaces the same way twice.
 */
function searchConditions(query: string): Prisma.ContactWhereInput[] {
  return query
    .trim()
    .toLocaleLowerCase("en-US")
    .split(/\s+/u)
    .filter((token) => token.length > 0)
    .map((token) => {
      const digits = token.replace(/[^\d+]/gu, "");
      const variants =
        digits.length >= 3 && digits !== token ? [token, digits] : [token];
      return {
        OR: variants.map((variant) => ({
          searchText: { contains: variant },
        })),
      };
    });
}

function listWhere(
  workspaceId: string,
  options: ListContactsOptions,
): Prisma.ContactWhereInput {
  return {
    workspaceId,
    ...(options.starred === true ? { starred: true } : {}),
    ...(options.labelId
      ? { labels: { some: { workspaceId, labelId: options.labelId } } }
      : {}),
    ...(options.query && options.query.trim().length > 0
      ? { AND: searchConditions(options.query) }
      : {}),
  };
}

export async function list(
  workspaceId: string,
  options: ListContactsOptions = {},
): Promise<ContactListResult> {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? DEFAULT_CONTACT_PAGE_SIZE, 1),
    MAX_CONTACT_PAGE_SIZE,
  );
  const page = Math.max(options.page ?? 1, 1);
  const where = listWhere(workspaceId, options);

  const [rows, total] = await Promise.all([
    db.contact.findMany({
      where,
      select: LIST_SELECT,
      orderBy: [{ sortKey: "asc" }, { id: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    db.contact.count({ where }),
  ]);

  return { contacts: rows.map(toListItem), total, page, pageSize };
}

export async function getContact(
  workspaceId: string,
  id: string,
): Promise<ContactDetail | null> {
  const row = await db.contact.findFirst({
    where: { id, workspaceId },
    select: DETAIL_SELECT,
  });
  return row === null ? null : toDetail(row);
}

export interface ContactPhoto {
  data: Buffer;
  contentType: string;
  updatedAt: Date;
}

export async function getPhoto(
  workspaceId: string,
  id: string,
): Promise<ContactPhoto | null> {
  const row = await db.contact.findFirst({
    where: { id, workspaceId },
    select: { photo: true, photoContentType: true, updatedAt: true },
  });
  if (!row || row.photo === null || row.photoContentType === null) return null;
  return {
    data: Buffer.from(row.photo),
    contentType: row.photoContentType,
    updatedAt: row.updatedAt,
  };
}

export async function setPhoto(
  workspaceId: string,
  operatorId: string | null,
  id: string,
  photo: ContactPhotoRecord,
  maxBytes: number,
): Promise<void> {
  await requireContactInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  if (photo.data.byteLength > maxBytes) {
    throw new ContactPhotoTooLargeError(maxBytes);
  }
  await db.contact.update({
    where: { id_workspaceId: { id, workspaceId } },
    data: {
      photo: Buffer.from(photo.data),
      photoContentType: photo.contentType,
    },
  });
}

export async function clearPhoto(
  workspaceId: string,
  operatorId: string | null,
  id: string,
): Promise<void> {
  await requireContactInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  await db.contact.update({
    where: { id_workspaceId: { id, workspaceId } },
    data: { photo: null, photoContentType: null },
  });
}

export interface RecipientSuggestion {
  contactId: string;
  displayName: string;
  email: string;
}

/**
 * Feeds the mail compose autocomplete. Matches the address itself and the
 * contact's search text, so typing a person's name finds their address.
 */
export async function suggestRecipients(
  workspaceId: string,
  query: string,
  limit = 8,
): Promise<RecipientSuggestion[]> {
  const trimmed = query.trim().toLocaleLowerCase("en-US");
  if (trimmed.length === 0) return [];

  const rows = await db.contactField.findMany({
    where: {
      workspaceId,
      kind: "EMAIL",
      OR: [
        { normalizedValue: { contains: trimmed } },
        { contact: { is: { workspaceId, searchText: { contains: trimmed } } } },
      ],
    },
    select: {
      value: true,
      contactId: true,
      contact: { select: { displayName: true, sortKey: true } },
    },
    orderBy: [{ contact: { sortKey: "asc" } }, { position: "asc" }],
    take: Math.min(Math.max(limit, 1), 25),
  });

  return rows.map((row) => ({
    contactId: row.contactId,
    displayName: row.contact.displayName,
    email: row.value,
  }));
}

// --- Bulk actions -----------------------------------------------------------

export type ContactBulkAction =
  | { type: "delete" }
  | { type: "star"; starred: boolean }
  | { type: "addLabel"; labelId: string }
  | { type: "removeLabel"; labelId: string };

export async function bulkUpdate(
  workspaceId: string,
  operatorId: string | null,
  contactIds: readonly string[],
  action: ContactBulkAction,
): Promise<number> {
  await requireWriteAccess(workspaceId, operatorId);
  // Scope the ids to the workspace once; every branch below then operates on
  // rows that are known to belong here.
  const owned = await db.contact.findMany({
    where: { workspaceId, id: { in: [...contactIds] } },
    select: { id: true },
  });
  const ids = owned.map((contact) => contact.id);
  if (ids.length === 0) return 0;

  switch (action.type) {
    case "delete":
      await db.contact.deleteMany({ where: { workspaceId, id: { in: ids } } });
      return ids.length;
    case "star":
      await db.contact.updateMany({
        where: { workspaceId, id: { in: ids } },
        data: { starred: action.starred },
      });
      return ids.length;
    case "addLabel":
      await db.contactLabelAssignment.createMany({
        data: ids.map((contactId) => ({
          workspaceId,
          contactId,
          contactWorkspaceId: workspaceId,
          labelId: action.labelId,
          labelWorkspaceId: workspaceId,
        })),
        skipDuplicates: true,
      });
      await refreshSearchText(workspaceId, ids);
      return ids.length;
    case "removeLabel":
      await db.contactLabelAssignment.deleteMany({
        where: { workspaceId, contactId: { in: ids }, labelId: action.labelId },
      });
      await refreshSearchText(workspaceId, ids);
      return ids.length;
  }
}

/**
 * Label names live in searchText, so a label added or removed outside
 * persistContact has to rebuild it or the list search would go stale.
 */
async function refreshSearchText(
  workspaceId: string,
  contactIds: readonly string[],
): Promise<void> {
  const rows = await db.contact.findMany({
    where: { workspaceId, id: { in: [...contactIds] } },
    select: DETAIL_SELECT,
  });
  await db.$transaction(
    rows.map((row) =>
      db.contact.update({
        where: { id_workspaceId: { id: row.id, workspaceId } },
        data: { searchText: buildSearchText(toRecord(row, null)) },
      }),
    ),
  );
}

// --- Duplicates and merge ---------------------------------------------------

export interface DuplicateGroup {
  contacts: ContactListItem[];
}

/**
 * Groups contacts that share an email, a phone number or a display name.
 * Contacts linked through different keys end up in the same group (A shares an
 * email with B, B shares a phone with C), so the merge screen never offers two
 * overlapping suggestions for the same person.
 */
export async function findDuplicateGroups(
  workspaceId: string,
): Promise<DuplicateGroup[]> {
  const rows = await db.contact.findMany({
    where: { workspaceId },
    select: LIST_SELECT,
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
  });

  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    return root;
  };
  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const firstByKey = new Map<string, string>();
  for (const row of rows) {
    parent.set(row.id, row.id);
    for (const key of duplicateKeys({
      displayName: row.displayName,
      fields: row.fields,
    })) {
      const owner = firstByKey.get(key);
      if (owner === undefined) firstByKey.set(key, row.id);
      else union(owner, row.id);
    }
  }

  const groups = new Map<string, ContactListItem[]>();
  for (const row of rows) {
    const root = find(row.id);
    const members = groups.get(root) ?? [];
    members.push(toListItem(row));
    groups.set(root, members);
  }

  return [...groups.values()]
    .filter((members) => members.length > 1)
    .map((contacts) => ({ contacts }));
}

/**
 * Folds `otherIds` into `primaryId` and deletes them. The primary's own values
 * win; everything the others knew that the primary lacked is appended.
 */
export async function mergeContacts(
  workspaceId: string,
  operatorId: string | null,
  primaryId: string,
  otherIds: readonly string[],
): Promise<ContactDetail> {
  await requireContactInWorkspace(workspaceId, primaryId);
  await requireWriteAccess(workspaceId, operatorId);

  const ids = [...new Set(otherIds)].filter((id) => id !== primaryId);
  if (ids.length === 0) {
    throw new ContactMergeValidationError(
      "A merge needs at least one other contact.",
    );
  }

  await db.$transaction(async (tx) => {
    const rows = await tx.contact.findMany({
      where: { workspaceId, id: { in: [primaryId, ...ids] } },
      select: DETAIL_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const primary = byId.get(primaryId);
    if (primary === undefined) throw new ContactNotFoundError();
    const others = ids
      .map((id) => byId.get(id))
      .filter((row): row is DetailRow => row !== undefined);
    if (others.length === 0) {
      throw new ContactMergeValidationError(
        "None of the other contacts exist in this workspace.",
      );
    }

    const merged = mergeContactRecords([
      toRecord(primary, null),
      ...others.map((row) => toRecord(row, null)),
    ]);
    // The photo bytes are fetched only when the primary has none to keep — a
    // merge of two contacts should not read two images to throw one away.
    const photo =
      primary.photoContentType !== null
        ? undefined
        : await inheritPhoto(tx, workspaceId, others);

    const labelIds = await resolveLabelIds(tx, workspaceId, merged.labels);
    await persistContact(tx, workspaceId, primaryId, merged, labelIds, photo);
    await tx.contact.deleteMany({
      where: { workspaceId, id: { in: others.map((row) => row.id) } },
    });
  });

  return (await getContact(workspaceId, primaryId))!;
}

/** The first photo among the merged-away contacts, if any of them had one. */
async function inheritPhoto(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  candidates: readonly DetailRow[],
): Promise<ContactPhotoRecord | undefined> {
  const source = candidates.find((row) => row.photoContentType !== null);
  if (source === undefined) return undefined;
  const row = await tx.contact.findFirst({
    where: { workspaceId, id: source.id },
    select: { photo: true, photoContentType: true },
  });
  if (!row || row.photo === null || row.photoContentType === null) {
    return undefined;
  }
  return {
    contentType: row.photoContentType,
    data: new Uint8Array(row.photo),
  };
}

// --- Import and export ------------------------------------------------------

export type ContactDuplicateStrategy = "skip" | "update" | "create";

export interface ImportContactsOptions {
  format?: ContactImportFormat;
  duplicateStrategy: ContactDuplicateStrategy;
  maxContacts: number;
  maxPhotoBytes: number;
}

export interface ImportContactsSummary {
  format: ContactImportFormat;
  parsed: number;
  created: number;
  updated: number;
  skipped: number;
}

// Chunked so one oversized address book cannot hold a single transaction (and
// its locks) open for the whole import.
const IMPORT_CHUNK_SIZE = 50;

export async function importContacts(
  workspaceId: string,
  operatorId: string | null,
  file: Uint8Array,
  options: ImportContactsOptions,
): Promise<ImportContactsSummary> {
  await requireWriteAccess(workspaceId, operatorId);
  const { format, contacts } = parseContactsFile(file, options.format);
  if (contacts.length > options.maxContacts) {
    throw new ContactImportTooLargeError(options.maxContacts);
  }

  const summary: ImportContactsSummary = {
    format,
    parsed: contacts.length,
    created: 0,
    updated: 0,
    skipped: 0,
  };

  for (let offset = 0; offset < contacts.length; offset += IMPORT_CHUNK_SIZE) {
    const chunk = contacts.slice(offset, offset + IMPORT_CHUNK_SIZE);
    await db.$transaction(async (tx) => {
      for (const incoming of chunk) {
        const existingId = await findMatchingContact(tx, workspaceId, incoming);

        if (existingId !== null && options.duplicateStrategy === "skip") {
          summary.skipped += 1;
          continue;
        }

        const photo =
          incoming.photo !== null &&
          incoming.photo.data.byteLength <= options.maxPhotoBytes
            ? incoming.photo
            : null;

        if (existingId !== null && options.duplicateStrategy === "update") {
          const existing = await tx.contact.findFirst({
            where: { workspaceId, id: existingId },
            select: DETAIL_SELECT,
          });
          // The file leads: an import is the operator saying "this is current".
          const merged = mergeContactRecords([
            incoming,
            ...(existing ? [toRecord(existing, null)] : []),
          ]);
          const labelIds = await resolveLabelIds(
            tx,
            workspaceId,
            merged.labels,
          );
          await persistContact(
            tx,
            workspaceId,
            existingId,
            merged,
            labelIds,
            photo ?? undefined,
          );
          summary.updated += 1;
          continue;
        }

        const labelIds = await resolveLabelIds(
          tx,
          workspaceId,
          incoming.labels,
        );
        await persistContact(
          tx,
          workspaceId,
          null,
          incoming,
          labelIds,
          photo ?? undefined,
        );
        summary.created += 1;
      }
    });
  }

  return summary;
}

/**
 * Finds the contact an incoming record should update, strongest signal first:
 * a shared email address, then a phone number, then an identical display name.
 */
async function findMatchingContact(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  record: ContactRecord,
): Promise<string | null> {
  const emails = record.fields
    .filter((field) => field.kind === "EMAIL")
    .map((field) => normalizeFieldValue(field))
    .filter((value): value is string => value !== null);
  if (emails.length > 0) {
    const match = await tx.contactField.findFirst({
      where: { workspaceId, kind: "EMAIL", normalizedValue: { in: emails } },
      select: { contactId: true },
    });
    if (match) return match.contactId;
  }

  const phones = record.fields
    .filter((field) => field.kind === "PHONE")
    .map((field) => normalizeFieldValue(field))
    .filter((value): value is string => value !== null);
  if (phones.length > 0) {
    const match = await tx.contactField.findFirst({
      where: { workspaceId, kind: "PHONE", normalizedValue: { in: phones } },
      select: { contactId: true },
    });
    if (match) return match.contactId;
  }

  const sortKey = buildSortKey(buildDisplayName(record));
  if (sortKey.length === 0) return null;
  const byName = await tx.contact.findFirst({
    where: { workspaceId, sortKey },
    select: { id: true },
  });
  return byName?.id ?? null;
}

export interface ExportContactsOptions {
  format: ContactExportFormat;
  contactIds?: readonly string[];
  labelId?: string;
  query?: string;
  starred?: boolean;
  includePhotos?: boolean;
}

export async function exportContacts(
  workspaceId: string,
  options: ExportContactsOptions,
): Promise<SerializedContactsFile & { count: number }> {
  const where: Prisma.ContactWhereInput =
    options.contactIds && options.contactIds.length > 0
      ? { workspaceId, id: { in: [...options.contactIds] } }
      : listWhere(workspaceId, {
          labelId: options.labelId,
          query: options.query,
          starred: options.starred,
        });

  const rows = await db.contact.findMany({
    where,
    select: {
      ...DETAIL_SELECT,
      // Photos only travel in vCard, and only when asked for: pulling every
      // contact's bytes to write a CSV that cannot carry them is pure waste.
      ...(options.includePhotos ? { photo: true } : {}),
    },
    orderBy: [{ sortKey: "asc" }, { id: "asc" }],
  });

  const records = rows.map((row) => {
    const photo =
      options.includePhotos &&
      "photo" in row &&
      row.photo !== null &&
      row.photoContentType !== null
        ? {
            contentType: row.photoContentType,
            data: new Uint8Array(row.photo as Uint8Array),
          }
        : null;
    return toRecord(row, photo);
  });

  return {
    ...serializeContacts(records, options.format),
    count: records.length,
  };
}
