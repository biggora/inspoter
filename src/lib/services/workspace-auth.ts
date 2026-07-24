import { db } from "@/lib/db";

// Shared role gates for workspace-scoped operations that need stronger
// service-layer authorization than the active-workspace request context.

export class WorkspaceOwnerRequiredError extends Error {
  constructor() {
    super("Only the workspace owner can perform this action");
    this.name = "WorkspaceOwnerRequiredError";
  }
}

export class WorkspaceMemberRequiredError extends Error {
  constructor() {
    super("Active workspace membership is required");
    this.name = "WorkspaceMemberRequiredError";
  }
}

export async function requireWorkspaceMember(
  workspaceId: string,
  operatorId: string,
): Promise<void> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
    select: { operatorId: true },
  });
  if (!membership) {
    throw new WorkspaceMemberRequiredError();
  }
}

export async function requireWorkspaceOwner(
  workspaceId: string,
  operatorId: string,
): Promise<void> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new WorkspaceOwnerRequiredError();
  }
}
