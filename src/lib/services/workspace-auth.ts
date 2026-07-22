import { db } from "@/lib/db";

// Shared owner gate for workspace-scoped mutating routes. Extracted from
// src/lib/services/credentials.ts (mail accounts plan §4) so both the
// provider-credential and mail-account services use one implementation.
// Authorization is intentionally kept out of service CRUD functions (they
// take only workspaceId, matching the API route's already-verified
// workspace context) — mutating callers invoke requireWorkspaceOwner() first.

export class WorkspaceOwnerRequiredError extends Error {
  constructor() {
    super("Only the workspace owner can perform this action");
    this.name = "WorkspaceOwnerRequiredError";
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

export async function canManageWorkspace(
  workspaceId: string,
  operatorId: string,
): Promise<boolean> {
  const membership = await db.workspaceMember.findUnique({
    where: { workspaceId_operatorId: { workspaceId, operatorId } },
    select: { role: true },
  });
  return membership?.role === "OWNER";
}
