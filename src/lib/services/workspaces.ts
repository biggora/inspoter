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

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function uniqueSlug(base: string): Promise<string> {
  let slug = slugify(base);
  let suffix = 0;
  while (await db.workspace.findUnique({ where: { slug } })) {
    suffix++;
    slug = `${slugify(base)}-${suffix}`;
  }
  return slug;
}

export async function createWorkspace(
  operatorId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const slug = await uniqueSlug(input.name);
  return db.workspace.create({
    data: {
      name: input.name,
      slug,
      members: {
        create: { operatorId, role: "owner" },
      },
    },
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
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  return db.workspace.update({
    where: { id },
    data: { name: input.name },
  });
}

export async function deleteWorkspace(id: string): Promise<void> {
  await db.workspace.delete({ where: { id } });
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
): Promise<WorkspaceMember> {
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
    throw new Error("User not found and no password provided to create one");
  }

  return db.workspaceMember.create({
    data: { workspaceId, operatorId: operator.id, role: "member" },
  });
}

export async function removeMember(
  workspaceId: string,
  memberId: string,
): Promise<void> {
  await db.workspaceMember.delete({ where: { id: memberId, workspaceId } });
}
