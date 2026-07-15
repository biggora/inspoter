import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";

// Webhook token management service (FR-WH-002, AC-WH-008/009, NFR-SEC-002).

const NAME_PREFIX = `wht-${randomUUID()}`;
let workspaceId: string;
let otherWorkspaceId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;

  const otherWorkspace = await db.workspace.create({
    data: {
      name: "Other Workspace",
      slug: `test-other-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  otherWorkspaceId = otherWorkspace.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
  if (otherWorkspaceId) {
    await db.workspace
      .delete({ where: { id: otherWorkspaceId } })
      .catch(() => {});
  }
});

describe("AC-WH-008: create()", () => {
  it("returns an id, a raw secret, and a prefix derived from that secret", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-create`,
    );

    expect(created.id).toBeTruthy();
    expect(created.token).toBeTruthy();
    expect(created.prefix).toBe(created.token.slice(0, 12));
  });

  it("NFR-SEC-002: never persists the raw secret, only its sha256 hash", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-hash`,
    );

    const stored = await db.webhookToken.findUnique({
      where: { id: created.id },
    });
    expect(stored?.tokenPrefix).toBe(created.prefix);
    expect(stored?.tokenHash).not.toBe(created.token);
  });
});

describe("NFR-SEC-002: list()", () => {
  it("returns summaries that never include the raw secret or its hash", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-list`,
    );

    const list = await webhookTokensService.list(workspaceId);
    const found = list.find((t) => t.id === created.id);

    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("token");
    expect(found).not.toHaveProperty("tokenHash");
    expect(found?.name).toBe(`${NAME_PREFIX}-list`);
    expect(found?.tokenPrefix).toBe(created.prefix);
    expect(found?.revokedAt).toBeNull();
    expect(found?.lastUsedAt).toBeNull();
  });

  it("isolates tokens per workspace", async () => {
    const created = await webhookTokensService.create(
      otherWorkspaceId,
      `${NAME_PREFIX}-isolated`,
    );

    const listForWorkspace = await webhookTokensService.list(workspaceId);
    expect(listForWorkspace.some((t) => t.id === created.id)).toBe(false);

    const listForOther = await webhookTokensService.list(otherWorkspaceId);
    expect(listForOther.some((t) => t.id === created.id)).toBe(true);
  });
});

describe("AC-WH-009: revoke()", () => {
  it("sets revokedAt, marking the token revoked in list() and storage", async () => {
    const created = await webhookTokensService.create(
      workspaceId,
      `${NAME_PREFIX}-revoke`,
    );

    await webhookTokensService.revoke(created.id, workspaceId);

    const stored = await db.webhookToken.findUnique({
      where: { id: created.id },
    });
    expect(stored?.revokedAt).not.toBeNull();

    const list = await webhookTokensService.list(workspaceId);
    const found = list.find((t) => t.id === created.id);
    expect(found?.revokedAt).not.toBeNull();
  });
});
