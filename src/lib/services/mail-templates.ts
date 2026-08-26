import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  parseMailLabelColor,
  type MailLabelColor,
} from "@/lib/mail-label-color";
import {
  extractMailTemplateVariables,
  MailTemplateVariableError,
} from "@/lib/mail-template-variables";
import {
  normalizeMailLabelDisplayName,
  normalizeMailLabelName,
} from "@/lib/mail-label-normalization";
import { sanitizeOutgoingMailHtml } from "@/lib/mail-message-content";
import { acquireMailAdvisoryLock } from "@/lib/services/mail-locks";
import { requireWorkspaceMember } from "@/lib/services/workspace-auth";
import type {
  CreateMailTemplateInput,
  CreateMailTemplateTagInput,
  ListMailTemplatesQuery,
  UpdateMailTemplateInput,
  UpdateMailTemplateTagInput,
} from "@/lib/validation/mail";

export const MAIL_TEMPLATE_LIMIT = 500;
export const MAIL_TEMPLATE_TAG_LIMIT = 100;

async function requireWriteAccess(
  workspaceId: string,
  operatorId: string | null,
): Promise<void> {
  if (operatorId !== null) {
    await requireWorkspaceMember(workspaceId, operatorId);
  }
}

class MailTemplateServiceError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class MailTemplateNotFoundError extends MailTemplateServiceError {
  constructor() {
    super("TEMPLATE_NOT_FOUND", "Mail template not found.");
  }
}

export class MailTemplateTagNotFoundError extends MailTemplateServiceError {
  constructor() {
    super("TEMPLATE_TAG_NOT_FOUND", "Mail template tag not found.");
  }
}

export class MailTemplateNameConflictError extends MailTemplateServiceError {
  constructor() {
    super(
      "TEMPLATE_NAME_CONFLICT",
      "A template with this name already exists.",
    );
  }
}

export class MailTemplateTagNameConflictError extends MailTemplateServiceError {
  constructor() {
    super(
      "TEMPLATE_TAG_NAME_CONFLICT",
      "A template tag with this name already exists.",
    );
  }
}

export class MailTemplateLimitReachedError extends MailTemplateServiceError {
  constructor() {
    super("TEMPLATE_LIMIT_REACHED", "Workspace template limit reached.");
  }
}

export class MailTemplateTagLimitReachedError extends MailTemplateServiceError {
  constructor() {
    super(
      "TEMPLATE_TAG_LIMIT_REACHED",
      "Workspace template tag limit reached.",
    );
  }
}

export class MailTemplateContentError extends MailTemplateServiceError {
  constructor(code: string, message: string) {
    super(code, message);
  }
}

const TAG_SELECT = {
  id: true,
  name: true,
  color: true,
} satisfies Prisma.MailTemplateTagSelect;

const TEMPLATE_SELECT = {
  id: true,
  name: true,
  subject: true,
  bodyText: true,
  bodyHtml: true,
  starred: true,
  createdAt: true,
  updatedAt: true,
  tags: { select: { tag: { select: TAG_SELECT } } },
} satisfies Prisma.MailTemplateSelect;

type TemplateRow = Prisma.MailTemplateGetPayload<{
  select: typeof TEMPLATE_SELECT;
}>;

export interface MailTemplateTagDto {
  id: string;
  name: string;
  color: MailLabelColor;
}

export interface MailTemplateSummaryDto {
  id: string;
  name: string;
  subject: string;
  bodyText: string;
  starred: boolean;
  createdAt: Date;
  updatedAt: Date;
  tags: MailTemplateTagDto[];
}

export interface MailTemplateDetailDto extends MailTemplateSummaryDto {
  bodyHtml: string;
  variables: string[];
}

export interface MailTemplateListResult {
  items: MailTemplateSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MailTemplateTagSummaryDto extends MailTemplateTagDto {
  templateCount: number;
}

function sortedTags(row: TemplateRow): MailTemplateTagDto[] {
  return row.tags
    .map((link) => ({
      ...link.tag,
      color: parseMailLabelColor(link.tag.color),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function toSummary(row: TemplateRow): MailTemplateSummaryDto {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    bodyText: row.bodyText,
    starred: row.starred,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    tags: sortedTags(row),
  };
}

function toDetail(row: TemplateRow): MailTemplateDetailDto {
  return {
    ...toSummary(row),
    bodyHtml: row.bodyHtml,
    variables: extractMailTemplateVariables(
      row.subject,
      row.bodyText,
      row.bodyHtml,
    ),
  };
}

function mapVariableError(error: unknown): never {
  if (error instanceof MailTemplateVariableError) {
    throw new MailTemplateContentError(error.code, error.message);
  }
  throw error;
}

function validateTemplateContent(
  subject: string,
  bodyText: string,
  bodyHtml: string,
): void {
  if (subject.trim().length === 0 && bodyText.trim().length === 0) {
    throw new MailTemplateContentError(
      "TEMPLATE_CONTENT_REQUIRED",
      "A template subject or body is required.",
    );
  }
  try {
    extractMailTemplateVariables(subject, bodyText, bodyHtml);
  } catch (error) {
    mapVariableError(error);
  }
}

async function requireTemplateInWorkspace(
  workspaceId: string,
  id: string,
): Promise<TemplateRow> {
  const template = await db.mailTemplate.findFirst({
    where: { id, workspaceId },
    select: TEMPLATE_SELECT,
  });
  if (!template) throw new MailTemplateNotFoundError();
  return template;
}

async function assertTagsInWorkspace(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  tagIds: readonly string[],
): Promise<void> {
  if (tagIds.length === 0) return;
  const count = await tx.mailTemplateTag.count({
    where: { workspaceId, id: { in: [...tagIds] } },
  });
  if (count !== tagIds.length) throw new MailTemplateTagNotFoundError();
}

async function replaceTemplateTags(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  templateId: string,
  tagIds: readonly string[],
): Promise<void> {
  await assertTagsInWorkspace(tx, workspaceId, tagIds);
  await tx.mailTemplateTagLink.deleteMany({
    where: { workspaceId, templateId },
  });
  if (tagIds.length > 0) {
    await tx.mailTemplateTagLink.createMany({
      data: tagIds.map((tagId) => ({
        workspaceId,
        templateId,
        templateWorkspaceId: workspaceId,
        tagId,
        tagWorkspaceId: workspaceId,
      })),
    });
  }
}

export async function listMailTemplates(
  workspaceId: string,
  options: ListMailTemplatesQuery,
): Promise<MailTemplateListResult> {
  const query = options.query?.trim();
  const where: Prisma.MailTemplateWhereInput = {
    workspaceId,
    ...(options.starred === true ? { starred: true } : {}),
    ...(options.tagId
      ? { tags: { some: { workspaceId, tagId: options.tagId } } }
      : {}),
    ...(query
      ? {
          OR: [
            { name: { contains: query, mode: "insensitive" } },
            { subject: { contains: query, mode: "insensitive" } },
            { bodyText: { contains: query, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.mailTemplate.findMany({
      where,
      select: TEMPLATE_SELECT,
      orderBy: [{ starred: "desc" }, { updatedAt: "desc" }, { id: "asc" }],
      skip: (options.page - 1) * options.pageSize,
      take: options.pageSize,
    }),
    db.mailTemplate.count({ where }),
  ]);

  return {
    items: rows.map(toSummary),
    total,
    page: options.page,
    pageSize: options.pageSize,
  };
}

export async function getMailTemplate(
  workspaceId: string,
  id: string,
): Promise<MailTemplateDetailDto> {
  return toDetail(await requireTemplateInWorkspace(workspaceId, id));
}

export async function createMailTemplate(
  workspaceId: string,
  operatorId: string | null,
  input: CreateMailTemplateInput,
): Promise<MailTemplateDetailDto> {
  await requireWriteAccess(workspaceId, operatorId);
  validateTemplateContent(input.subject, input.bodyText, input.bodyHtml);
  const name = normalizeMailLabelDisplayName(input.name);
  const normalizedName = normalizeMailLabelName(input.name);
  const bodyHtml = sanitizeOutgoingMailHtml(input.bodyHtml);

  try {
    const id = await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(
        tx,
        "workspace-mail-templates",
        workspaceId,
      );
      if (
        (await tx.mailTemplate.count({ where: { workspaceId } })) >=
        MAIL_TEMPLATE_LIMIT
      ) {
        throw new MailTemplateLimitReachedError();
      }
      await assertTagsInWorkspace(tx, workspaceId, input.tagIds);
      const template = await tx.mailTemplate.create({
        data: {
          workspaceId,
          name,
          normalizedName,
          subject: input.subject,
          bodyText: input.bodyText,
          bodyHtml,
          starred: input.starred,
        },
        select: { id: true },
      });
      await replaceTemplateTags(tx, workspaceId, template.id, input.tagIds);
      return template.id;
    });
    return getMailTemplate(workspaceId, id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailTemplateNameConflictError();
    }
    throw error;
  }
}

export async function updateMailTemplate(
  workspaceId: string,
  operatorId: string | null,
  id: string,
  input: UpdateMailTemplateInput,
): Promise<MailTemplateDetailDto> {
  const current = await requireTemplateInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  const subject = input.subject ?? current.subject;
  const bodyText = input.bodyText ?? current.bodyText;
  const bodyHtml = input.bodyHtml ?? current.bodyHtml;
  validateTemplateContent(subject, bodyText, bodyHtml);

  try {
    await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(
        tx,
        "workspace-mail-templates",
        workspaceId,
      );
      const updated = await tx.mailTemplate.updateMany({
        where: { id, workspaceId },
        data: {
          ...(input.name !== undefined
            ? {
                name: normalizeMailLabelDisplayName(input.name),
                normalizedName: normalizeMailLabelName(input.name),
              }
            : {}),
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.bodyText !== undefined ? { bodyText: input.bodyText } : {}),
          ...(input.bodyHtml !== undefined
            ? { bodyHtml: sanitizeOutgoingMailHtml(input.bodyHtml) }
            : {}),
          ...(input.starred !== undefined ? { starred: input.starred } : {}),
        },
      });
      if (updated.count === 0) throw new MailTemplateNotFoundError();
      if (input.tagIds !== undefined) {
        await replaceTemplateTags(tx, workspaceId, id, input.tagIds);
      }
    });
    return getMailTemplate(workspaceId, id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailTemplateNameConflictError();
    }
    throw error;
  }
}

export async function deleteMailTemplate(
  workspaceId: string,
  operatorId: string | null,
  id: string,
): Promise<void> {
  await requireTemplateInWorkspace(workspaceId, id);
  await requireWriteAccess(workspaceId, operatorId);
  const deleted = await db.mailTemplate.deleteMany({
    where: { id, workspaceId },
  });
  if (deleted.count === 0) throw new MailTemplateNotFoundError();
}

export async function listMailTemplateTags(
  workspaceId: string,
): Promise<MailTemplateTagSummaryDto[]> {
  const tags = await db.mailTemplateTag.findMany({
    where: { workspaceId },
    select: {
      ...TAG_SELECT,
      _count: { select: { templates: true } },
    },
    orderBy: [{ normalizedName: "asc" }, { id: "asc" }],
  });
  return tags.map((tag) => ({
    id: tag.id,
    name: tag.name,
    color: parseMailLabelColor(tag.color),
    templateCount: tag._count.templates,
  }));
}

export async function getMailTemplateTag(
  workspaceId: string,
  id: string,
): Promise<MailTemplateTagSummaryDto> {
  const tag = await db.mailTemplateTag.findFirst({
    where: { id, workspaceId },
    select: {
      ...TAG_SELECT,
      _count: { select: { templates: true } },
    },
  });
  if (!tag) throw new MailTemplateTagNotFoundError();
  return {
    id: tag.id,
    name: tag.name,
    color: parseMailLabelColor(tag.color),
    templateCount: tag._count.templates,
  };
}

export async function createMailTemplateTag(
  workspaceId: string,
  operatorId: string | null,
  input: CreateMailTemplateTagInput,
): Promise<MailTemplateTagSummaryDto> {
  await requireWriteAccess(workspaceId, operatorId);
  const name = normalizeMailLabelDisplayName(input.name);
  const normalizedName = normalizeMailLabelName(input.name);
  const color = parseMailLabelColor(input.color);
  try {
    return await db.$transaction(async (tx) => {
      await acquireMailAdvisoryLock(
        tx,
        "workspace-mail-template-tags",
        workspaceId,
      );
      if (
        (await tx.mailTemplateTag.count({ where: { workspaceId } })) >=
        MAIL_TEMPLATE_TAG_LIMIT
      ) {
        throw new MailTemplateTagLimitReachedError();
      }
      const tag = await tx.mailTemplateTag.create({
        data: { workspaceId, name, normalizedName, color },
        select: TAG_SELECT,
      });
      return {
        ...tag,
        color: parseMailLabelColor(tag.color),
        templateCount: 0,
      };
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailTemplateTagNameConflictError();
    }
    throw error;
  }
}

export async function updateMailTemplateTag(
  workspaceId: string,
  operatorId: string | null,
  id: string,
  input: UpdateMailTemplateTagInput,
): Promise<MailTemplateTagSummaryDto> {
  const current = await db.mailTemplateTag.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!current) throw new MailTemplateTagNotFoundError();
  await requireWriteAccess(workspaceId, operatorId);
  try {
    await db.mailTemplateTag.update({
      where: { id_workspaceId: { id, workspaceId } },
      data: {
        ...(input.name !== undefined
          ? {
              name: normalizeMailLabelDisplayName(input.name),
              normalizedName: normalizeMailLabelName(input.name),
            }
          : {}),
        ...(input.color !== undefined
          ? { color: parseMailLabelColor(input.color) }
          : {}),
      },
    });
    return getMailTemplateTag(workspaceId, id);
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new MailTemplateTagNameConflictError();
    }
    throw error;
  }
}

export async function deleteMailTemplateTag(
  workspaceId: string,
  operatorId: string | null,
  id: string,
): Promise<void> {
  const current = await db.mailTemplateTag.findFirst({
    where: { id, workspaceId },
    select: { id: true },
  });
  if (!current) throw new MailTemplateTagNotFoundError();
  await requireWriteAccess(workspaceId, operatorId);
  const deleted = await db.mailTemplateTag.deleteMany({
    where: { id, workspaceId },
  });
  if (deleted.count === 0) throw new MailTemplateTagNotFoundError();
}
