import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/config/env";
import { Prisma, type MailAccountKind } from "@/generated/prisma/client";
import {
  parseMailLabelColor,
  type MailLabelColor,
} from "@/lib/mail-label-color";
import { getOrCreateWebhookAccount } from "@/lib/services/mail-accounts";
import { emitWebhookEvent } from "@/lib/services/webhook-events";
import { persistIncomingMail } from "@/lib/services/mail-message-persistence";

// External webhook contract shape (src/lib/validation/webhooks.ts mailSchema):
// `sender`/`body` are mapped to the renamed `fromAddress`/`bodyText` columns
// internally.
export interface CreateMailInput {
  sender: string;
  subject: string;
  body: string;
  receivedAt?: string;
}

export interface ListMailParams {
  cursor?: string;
  pageSize?: number;
  from?: string;
  query?: string;
  sort?: "asc" | "desc";
  accountId?: string;
  folderId?: string;
  labelId?: string;
  unreadOnly?: boolean;
}

export class MailListResourceNotFoundError extends Error {
  readonly code = "RESOURCE_NOT_FOUND";

  constructor() {
    super("Resource not found.");
    this.name = "MailListResourceNotFoundError";
  }
}

// List projection: metadata only — bodies (`bodyText`/`bodyHtml`) never travel
// with list responses (plan §4); the reading pane fetches them via getById.
const LIST_SELECT = {
  id: true,
  fromAddress: true,
  fromName: true,
  subject: true,
  snippet: true,
  isRead: true,
  isAnswered: true,
  isFlagged: true,
  hasAttachments: true,
  receivedAt: true,
  accountId: true,
  folderId: true,
  labels: {
    select: {
      label: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ label: { position: "asc" } }, { labelId: "asc" }],
  },
} satisfies Prisma.MailItemSelect;

export type MailListItem = Prisma.MailItemGetPayload<{
  select: typeof LIST_SELECT;
}>;

export interface ListMailResult {
  items: MailListItem[];
  nextCursor: string | null;
}

interface Cursor {
  v: 1;
  w: string;
  f: string;
  t: string;
  id: string;
}

function filterFingerprint(
  workspaceId: string,
  params: ListMailParams,
  sort: "asc" | "desc",
): string {
  const canonicalFilters = {
    workspaceId,
    accountId: params.accountId ?? null,
    folderId: params.folderId ?? null,
    labelId: params.labelId ?? null,
    from: params.from ?? null,
    query: params.query ?? null,
    unreadOnly: params.unreadOnly === true,
    sort,
  };
  return createHash("sha256")
    .update(JSON.stringify(canonicalFilters))
    .digest("base64url");
}

function encodeCursor(
  workspaceId: string,
  fingerprint: string,
  entry: Pick<MailListItem, "receivedAt" | "id">,
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      w: workspaceId,
      f: fingerprint,
      t: entry.receivedAt.toISOString(),
      id: entry.id,
    }),
  ).toString("base64url");
}

function decodeCursor(cursor: string): Cursor | null {
  try {
    const p = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf-8"),
    ) as Partial<Cursor>;
    const timestamp = typeof p.t === "string" ? new Date(p.t) : null;
    return p.v === 1 &&
      typeof p.w === "string" &&
      typeof p.f === "string" &&
      typeof p.t === "string" &&
      typeof p.id === "string" &&
      p.id.length > 0 &&
      timestamp !== null &&
      !Number.isNaN(timestamp.getTime())
      ? { v: 1, w: p.w, f: p.f, t: p.t, id: p.id }
      : null;
  } catch {
    return null;
  }
}

// First 120 chars of the body with whitespace collapsed, for list rows.
function makeSnippet(body: string): string {
  return body.replace(/\s+/g, " ").trim().slice(0, 120);
}

export async function create(
  workspaceId: string,
  input: CreateMailInput,
): Promise<{ id: string }> {
  const { account, inboxFolder } = await getOrCreateWebhookAccount(workspaceId);
  const entry = await persistIncomingMail({
    workspaceId,
    accountId: account.id,
    folderId: inboxFolder.id,
    folderSpecialUse: "INBOX",
    fromAddress: input.sender,
    subject: input.subject,
    bodyText: input.body,
    snippet: makeSnippet(input.body),
    isRead: false,
    ...(input.receivedAt ? { receivedAt: new Date(input.receivedAt) } : {}),
  });
  await emitWebhookEvent(workspaceId, "MAIL_RECEIVED", {
    mailItemId: entry.id,
    fromAddress: input.sender,
    subject: input.subject,
    snippet: makeSnippet(input.body),
  });
  return { id: entry.id };
}

export async function list(
  workspaceId: string,
  params: ListMailParams,
): Promise<ListMailResult> {
  const pageSize = params.pageSize ?? env.LIST_PAGE_SIZE;
  const sort = params.sort ?? "desc";
  const fingerprint = filterFingerprint(workspaceId, params, sort);

  const [account, folder, label] = await Promise.all([
    params.accountId
      ? db.mailAccount.findFirst({
          where: { id: params.accountId, workspaceId },
          select: { id: true },
        })
      : null,
    params.folderId
      ? db.mailFolder.findFirst({
          where: { id: params.folderId, workspaceId },
          select: { id: true, accountId: true },
        })
      : null,
    params.labelId
      ? db.mailLabel.findFirst({
          where: { id: params.labelId, workspaceId },
          select: { id: true },
        })
      : null,
  ]);
  if (
    (params.accountId && !account) ||
    (params.folderId && !folder) ||
    (params.labelId && !label) ||
    (params.accountId && folder && folder.accountId !== params.accountId)
  ) {
    throw new MailListResourceNotFoundError();
  }

  const filters: Prisma.MailItemWhereInput[] = [{ workspaceId }];
  if (params.from) filters.push({ fromAddress: params.from });
  if (params.accountId) filters.push({ accountId: params.accountId });
  if (params.folderId) filters.push({ folderId: params.folderId });
  if (params.labelId) {
    filters.push({
      labels: { some: { workspaceId, labelId: params.labelId } },
    });
  }
  if (params.unreadOnly) filters.push({ isRead: false });
  if (params.query) {
    filters.push({
      OR: [
        { subject: { contains: params.query, mode: "insensitive" } },
        { fromAddress: { contains: params.query, mode: "insensitive" } },
        { fromName: { contains: params.query, mode: "insensitive" } },
      ],
    });
  }

  const decoded = params.cursor ? decodeCursor(params.cursor) : null;
  const cursor =
    decoded && decoded.w === workspaceId && decoded.f === fingerprint
      ? decoded
      : null;
  if (cursor) {
    const cursorDate = new Date(cursor.t);
    const cursorWhere =
      sort === "desc"
        ? [
            { receivedAt: { lt: cursorDate } },
            { receivedAt: cursorDate, id: { lt: cursor.id } },
          ]
        : [
            { receivedAt: { gt: cursorDate } },
            { receivedAt: cursorDate, id: { gt: cursor.id } },
          ];
    filters.push({ OR: cursorWhere });
  }

  const where: Prisma.MailItemWhereInput = { AND: filters };

  const rows = await db.mailItem.findMany({
    where,
    select: LIST_SELECT,
    orderBy: [{ receivedAt: sort }, { id: sort }],
    take: pageSize + 1,
  });

  const hasMore = rows.length > pageSize;
  const items = hasMore ? rows.slice(0, pageSize) : rows;
  const nextCursor = hasMore
    ? encodeCursor(workspaceId, fingerprint, items[items.length - 1])
    : null;

  return { items, nextCursor };
}

// Detail row: full bodies + attachment metadata (never `content` bytes) +
// account kind, so the UI can distinguish webhook and IMAP mailboxes.
const DETAIL_INCLUDE = {
  attachments: {
    select: {
      id: true,
      filename: true,
      contentType: true,
      sizeBytes: true,
      isInline: true,
    },
    orderBy: { createdAt: "asc" },
  },
  account: { select: { kind: true } },
  labels: {
    select: {
      label: { select: { id: true, name: true, color: true } },
    },
    orderBy: [{ label: { position: "asc" } }, { labelId: "asc" }],
  },
} satisfies Prisma.MailItemInclude;

export type MailDetailItem = Prisma.MailItemGetPayload<{
  include: typeof DETAIL_INCLUDE;
}>;

export async function getById(
  id: string,
  workspaceId: string,
): Promise<MailDetailItem | null> {
  return db.mailItem.findFirst({
    where: { id, workspaceId },
    include: DETAIL_INCLUDE,
  });
}

// Wire shapes for the /api/mail routes (plan §4). BigInt columns (`uid`) are
// deliberately never part of a DTO — they must not reach JSON.stringify.
export interface MailAddressDto {
  name: string | null;
  address: string;
}

export interface MailListItemDto {
  id: string;
  from: string;
  fromName: string | null;
  subject: string;
  snippet: string | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  receivedAt: Date;
  accountId: string;
  folderId: string;
  labels: MailLabelDto[];
}

export interface MailLabelDto {
  id: string;
  name: string;
  color: MailLabelColor;
}

export function toMailListItemDto(item: MailListItem): MailListItemDto {
  return {
    id: item.id,
    from: item.fromAddress,
    fromName: item.fromName,
    subject: item.subject,
    snippet: item.snippet,
    isRead: item.isRead,
    isAnswered: item.isAnswered,
    isFlagged: item.isFlagged,
    hasAttachments: item.hasAttachments,
    receivedAt: item.receivedAt,
    accountId: item.accountId,
    folderId: item.folderId,
    labels: item.labels.map(({ label }) => ({
      ...label,
      color: parseMailLabelColor(label.color),
    })),
  };
}

export interface MailAttachmentDto {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  isInline: boolean;
}

export interface MailDetailDto {
  id: string;
  accountId: string;
  folderId: string;
  accountKind: MailAccountKind;
  from: string;
  fromName: string | null;
  to: MailAddressDto[];
  cc: MailAddressDto[];
  bcc: MailAddressDto[];
  subject: string;
  snippet: string | null;
  bodyText: string;
  bodyHtml: string | null;
  draftReplyToId: string | null;
  draftForwardOfId: string | null;
  isRead: boolean;
  isAnswered: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  receivedAt: Date;
  attachments: MailAttachmentDto[];
  labels: MailLabelDto[];
}

// Recipients are stored as Json `{ name: string | null, address: string }[]`
// (mail-sync.ts toJsonAddresses); parse defensively so a malformed row never
// breaks the detail response.
function parseAddresses(value: Prisma.JsonValue | null): MailAddressDto[] {
  if (!Array.isArray(value)) return [];
  const addresses: MailAddressDto[] = [];
  for (const entry of value) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record.address !== "string") continue;
    addresses.push({
      name: typeof record.name === "string" ? record.name : null,
      address: record.address,
    });
  }
  return addresses;
}

export function toMailDetailDto(item: MailDetailItem): MailDetailDto {
  return {
    id: item.id,
    accountId: item.accountId,
    folderId: item.folderId,
    accountKind: item.account.kind,
    from: item.fromAddress,
    fromName: item.fromName,
    to: parseAddresses(item.toRecipients),
    cc: parseAddresses(item.ccRecipients),
    bcc: parseAddresses(item.bccRecipients),
    subject: item.subject,
    snippet: item.snippet,
    bodyText: item.bodyText,
    bodyHtml: item.bodyHtml,
    draftReplyToId: item.draftReplyToId,
    draftForwardOfId: item.draftForwardOfId,
    isRead: item.isRead,
    isAnswered: item.isAnswered,
    isFlagged: item.isFlagged,
    hasAttachments: item.hasAttachments,
    receivedAt: item.receivedAt,
    attachments: item.attachments.map((attachment) => ({
      id: attachment.id,
      filename: attachment.filename,
      contentType: attachment.contentType,
      sizeBytes: attachment.sizeBytes,
      isInline: attachment.isInline,
    })),
    labels: item.labels.map(({ label }) => ({
      ...label,
      color: parseMailLabelColor(label.color),
    })),
  };
}
