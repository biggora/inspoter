import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import type { Operator, Workspace } from "@/generated/prisma/client";
import * as workspacesService from "@/lib/services/workspaces";
import { updateSectionVisibilitySchema } from "@/lib/validation/workspaces";

// Section visibility (workspace-section-visibility): owner-gated per-workspace
// setting. Mirrors the two-operator harness in
// tests/unit/integration/workspace-isolation.test.ts against the real test DB.

const RUN_ID = randomUUID();

let ownerOp: Operator;
let memberOp: Operator;
let workspace: Workspace;

beforeAll(async () => {
  ownerOp = await db.operator.create({
    data: { username: `sv-owner-${RUN_ID}`, passwordHash: "x" },
  });
  workspace = await workspacesService.createWorkspace(ownerOp.id, {
    name: `Section visibility WS ${RUN_ID}`,
  });
  // A MEMBER (non-owner) of the same workspace, created via the service so
  // the membership row exists with role MEMBER.
  const member = await workspacesService.addMember(
    workspace.id,
    { username: `sv-member-${RUN_ID}`, password: "member-password" },
    ownerOp.id,
  );
  memberOp = await db.operator.findUniqueOrThrow({
    where: { id: member.operatorId },
  });
});

afterAll(async () => {
  await db.workspace.delete({ where: { id: workspace.id } }).catch(() => {});
  await db.operator.delete({ where: { id: ownerOp.id } }).catch(() => {});
  await db.operator.delete({ where: { id: memberOp.id } }).catch(() => {});
});

describe("workspacesService.setHiddenSections", () => {
  it("owner persists the hidden-section keys", async () => {
    const updated = await workspacesService.setHiddenSections(
      workspace.id,
      ownerOp.id,
      ["logs", "mail"],
    );
    expect(updated.hiddenSections.sort()).toEqual(["logs", "mail"]);
  });

  it("owner can clear all hidden sections with an empty array", async () => {
    await workspacesService.setHiddenSections(workspace.id, ownerOp.id, [
      "logs",
    ]);
    const cleared = await workspacesService.setHiddenSections(
      workspace.id,
      ownerOp.id,
      [],
    );
    expect(cleared.hiddenSections).toEqual([]);
  });

  it("rejects a non-owner member", async () => {
    await expect(
      workspacesService.setHiddenSections(workspace.id, memberOp.id, ["logs"]),
    ).rejects.toBeInstanceOf(workspacesService.WorkspaceAuthorizationError);
  });
});

describe("updateSectionVisibilitySchema", () => {
  it("drops unknown keys and de-duplicates", () => {
    const parsed = updateSectionVisibilitySchema.parse({
      hiddenSections: ["logs", "logs", "not-a-section", "settings", "mail"],
    });
    expect(parsed.hiddenSections.sort()).toEqual(["logs", "mail"]);
  });

  it("accepts an empty array", () => {
    const parsed = updateSectionVisibilitySchema.parse({ hiddenSections: [] });
    expect(parsed.hiddenSections).toEqual([]);
  });
});
