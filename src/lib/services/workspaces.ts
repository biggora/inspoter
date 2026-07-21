import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import type {
  Operator,
  Workspace,
  WorkspaceMember,
} from "@/generated/prisma/client";

export interface CreateWorkspaceInput {
  name: string;
}

export interface UpdateWorkspaceInput {
  name: string;
}

export interface AddMemberInput {
  username: string;
  password?: string;
}

export type MemberWithOperator = WorkspaceMember & {
  operator: Pick<Operator, "id" | "username">;
};

export class WorkspaceNotFoundError extends Error {
  constructor(id: string) {
    super(`Workspace not found: ${id}`);
    this.name = "WorkspaceNotFoundError";
  }
}

export class WorkspaceAuthorizationError extends Error {
  constructor(message = "You are not authorized to perform this action") {
    super(message);
    this.name = "WorkspaceAuthorizationError";
  }
}

export class LastOwnerError extends Error {
  constructor(message = "Cannot remove the last owner of a workspace") {
    super(message);
    this.name = "LastOwnerError";
  }
}

export class LastMemberError extends Error {
  constructor(message = "Cannot remove the last member of a workspace") {
    super(message);
    this.name = "LastMemberError";
  }
}

export class LastWorkspaceError extends Error {
  constructor(message = "Cannot delete the only workspace you belong to") {
    super(message);
    this.name = "LastWorkspaceError";
  }
}

export class WorkspaceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceValidationError";
  }
}

const MAX_NAME_LENGTH = 100;
const MAX_SLUG_ATTEMPTS = 10;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new WorkspaceValidationError("Workspace name cannot be empty");
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new WorkspaceValidationError(
      `Workspace name cannot exceed ${MAX_NAME_LENGTH} characters`,
    );
  }
  return trimmed;
}

function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `workspace-${randomUUID().slice(0, 8)}`;
}

async function uniqueSlug(base: string): Promise<string> {
  const baseSlug = slugify(base);
  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
    const existing = await db.workspace.findUnique({
      where: { slug: candidate },
    });
    if (!existing) return candidate;
  }
  throw new WorkspaceValidationError(
    "Could not generate a unique workspace slug, please try a different name",
  );
}

async function findWorkspaceOrThrow(id: string): Promise<Workspace> {
  const workspace = await db.workspace.findUnique({ where: { id } });
  if (!workspace) throw new WorkspaceNotFoundError(id);
  return workspace;
}

async function findMembershipOrThrow(
  workspaceId: string,
  operatorId: string,
): Promise<WorkspaceMember> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
  });
  if (!membership) {
    throw new WorkspaceAuthorizationError("Not a member of this workspace");
  }
  return membership;
}

async function requireOwner(
  workspaceId: string,
  operatorId: string,
): Promise<WorkspaceMember> {
  const membership = await findMembershipOrThrow(workspaceId, operatorId);
  if (membership.role !== "OWNER") {
    throw new WorkspaceAuthorizationError(
      "Only the workspace owner can perform this action",
    );
  }
  return membership;
}

export async function assertMembership(
  workspaceId: string,
  operatorId: string,
): Promise<void> {
  await findWorkspaceOrThrow(workspaceId);
  await findMembershipOrThrow(workspaceId, operatorId);
}

export async function createWorkspace(
  operatorId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const name = validateName(input.name);
  const slug = await uniqueSlug(name);
  return db.workspace.create({
    data: {
      name,
      slug,
      members: {
        create: { operatorId, role: "OWNER" },
      },
    },
  });
}

export async function ensureDefaultWorkspace(
  operatorId: string,
  defaultName: string,
): Promise<Workspace> {
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${operatorId}))`;

    const membership = await tx.workspaceMember.findFirst({
      where: { operatorId },
    });
    if (membership) {
      return tx.workspace.findUniqueOrThrow({
        where: { id: membership.workspaceId },
      });
    }

    const name = validateName(defaultName);
    const baseSlug = slugify(name);
    let slug: string | undefined;
    for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt++) {
      const candidate = attempt === 0 ? baseSlug : `${baseSlug}-${attempt}`;
      const taken = await tx.workspace.findUnique({
        where: { slug: candidate },
      });
      if (!taken) {
        slug = candidate;
        break;
      }
    }
    if (!slug) {
      throw new WorkspaceValidationError(
        "Could not generate a unique workspace slug, please try a different name",
      );
    }

    return tx.workspace.create({
      data: {
        name,
        slug,
        members: { create: { operatorId, role: "OWNER" } },
      },
    });
  });
}

export async function listForOperator(
  operatorId: string,
): Promise<Workspace[]> {
  const memberships = await db.workspaceMember.findMany({
    where: { operatorId },
    include: { workspace: true },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => m.workspace);
}

export async function updateWorkspace(
  id: string,
  operatorId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  await findWorkspaceOrThrow(id);
  await requireOwner(id, operatorId);
  const name = validateName(input.name);
  return db.workspace.update({
    where: { id },
    data: { name },
  });
}

export async function setHiddenSections(
  id: string,
  operatorId: string,
  hiddenSections: string[],
): Promise<Workspace> {
  await findWorkspaceOrThrow(id);
  await requireOwner(id, operatorId);
  return db.workspace.update({
    where: { id },
    data: { hiddenSections },
  });
}

export async function deleteWorkspace(
  id: string,
  operatorId: string,
): Promise<void> {
  await findWorkspaceOrThrow(id);
  await requireOwner(id, operatorId);

  const otherMemberships = await db.workspaceMember.count({
    where: { operatorId, workspaceId: { not: id } },
  });
  if (otherMemberships === 0) {
    throw new LastWorkspaceError();
  }

  await db.$transaction(async (tx) => {
    await tx.localServer.deleteMany({ where: { workspaceId: id } });
    await tx.workspace.delete({ where: { id } });
  });
}

export async function listMembers(
  workspaceId: string,
): Promise<MemberWithOperator[]> {
  return db.workspaceMember.findMany({
    where: { workspaceId },
    include: { operator: { select: { id: true, username: true } } },
    orderBy: { joinedAt: "asc" },
  });
}

export async function addMember(
  workspaceId: string,
  input: AddMemberInput,
  requestingOperatorId: string,
): Promise<WorkspaceMember> {
  await findWorkspaceOrThrow(workspaceId);
  await requireOwner(workspaceId, requestingOperatorId);

  let operator = await db.operator.findUnique({
    where: { username: input.username },
  });

  if (!operator && input.password) {
    const passwordHash = await hashPassword(input.password);
    operator = await db.operator.create({
      data: { username: input.username, passwordHash },
    });
  }

  if (!operator) {
    throw new WorkspaceValidationError(
      "User not found and no password provided to create one",
    );
  }

  return db.workspaceMember.create({
    data: { workspaceId, operatorId: operator.id, role: "MEMBER" },
  });
}

export async function removeMember(
  workspaceId: string,
  memberId: string,
  requestingOperatorId: string,
): Promise<void> {
  await findWorkspaceOrThrow(workspaceId);
  await requireOwner(workspaceId, requestingOperatorId);

  const target = await db.workspaceMember.findUnique({
    where: { id: memberId },
  });
  if (!target || target.workspaceId !== workspaceId) {
    throw new WorkspaceNotFoundError(memberId);
  }

  const totalMembers = await db.workspaceMember.count({
    where: { workspaceId },
  });
  if (totalMembers <= 1) {
    throw new LastMemberError();
  }

  if (target.role === "OWNER") {
    const ownerCount = await db.workspaceMember.count({
      where: { workspaceId, role: "OWNER" },
    });
    if (ownerCount <= 1) {
      throw new LastOwnerError();
    }
  }

  await db.workspaceMember.delete({ where: { id: memberId } });
}
