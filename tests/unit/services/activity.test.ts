import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  activityCreate: vi.fn(),
  activityFindMany: vi.fn(),
  mailAccountFindMany: vi.fn(),
  mailFilterRuleFindMany: vi.fn(),
  mailLabelFindMany: vi.fn(),
  workspaceFindMany: vi.fn(),
}));

vi.mock("@/lib/config/env", () => ({
  env: { LIST_PAGE_SIZE: 50 },
}));

vi.mock("@/lib/db", () => ({
  db: {
    activity: {
      create: mocks.activityCreate,
      findMany: mocks.activityFindMany,
    },
    mailAccount: { findMany: mocks.mailAccountFindMany },
    mailFilterRule: { findMany: mocks.mailFilterRuleFindMany },
    mailLabel: { findMany: mocks.mailLabelFindMany },
    workspace: { findMany: mocks.workspaceFindMany },
  },
}));

import { list, recordActivity } from "@/lib/services/activity";

const timestamp = new Date("2026-07-26T09:24:09.427Z");

function activity(
  id: string,
  entityType: string,
  entityId: string,
  entityLabel: string | null = null,
) {
  return {
    id,
    workspaceId: "workspace-1",
    operatorId: "operator-1",
    operatorName: "admin",
    action: "update",
    entityType,
    entityId,
    entityLabel,
    details: null,
    timestamp,
    createdAt: timestamp,
  };
}

describe("activity entity labels", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.activityCreate.mockResolvedValue(undefined);
    mocks.mailAccountFindMany.mockResolvedValue([]);
    mocks.mailFilterRuleFindMany.mockResolvedValue([]);
    mocks.mailLabelFindMany.mockResolvedValue([]);
    mocks.workspaceFindMany.mockResolvedValue([]);
  });

  it("recovers a missing label from activity history", async () => {
    const row = activity("activity-1", "credential", "credential-1");
    mocks.activityFindMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([
      {
        entityType: "credential",
        entityId: "credential-1",
        entityLabel: "Hostinger Inspot",
      },
    ]);

    const result = await list("workspace-1", {});

    expect(result.items[0].entityLabel).toBe("Hostinger Inspot");
  });

  it("searches the action and entity type shown in the activity table", async () => {
    mocks.activityFindMany.mockResolvedValue([]);

    await list("workspace-1", { query: "llm_chat" });

    expect(mocks.activityFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { action: { contains: "llm_chat", mode: "insensitive" } },
            { entityType: { contains: "llm_chat", mode: "insensitive" } },
          ]),
        }),
      }),
    );
  });

  it("resolves live workspace, mail label, and filter rule names", async () => {
    mocks.activityFindMany
      .mockResolvedValueOnce([
        activity("activity-1", "workspace", "workspace-1"),
        activity("activity-2", "mail_label", "label-1"),
        activity("activity-3", "mail_filter_rule", "rule-1"),
      ])
      .mockResolvedValueOnce([]);
    mocks.workspaceFindMany.mockResolvedValue([
      { id: "workspace-1", name: "Inspot Labs" },
    ]);
    mocks.mailLabelFindMany.mockResolvedValue([
      { id: "label-1", name: "Important" },
    ]);
    mocks.mailFilterRuleFindMany.mockResolvedValue([
      { id: "rule-1", name: "Receipts" },
    ]);

    const result = await list("workspace-1", {});

    expect(result.items.map((entry) => entry.entityLabel)).toEqual([
      "Inspot Labs",
      "Important",
      "Receipts",
    ]);
  });

  it("stores a resolved label on new activity entries", async () => {
    mocks.activityFindMany.mockResolvedValue([]);
    mocks.mailAccountFindMany.mockResolvedValue([
      { id: "account-1", name: "Inspot Labs Gmail" },
    ]);

    await recordActivity("workspace-1", {
      operatorId: "operator-1",
      operatorName: "admin",
      action: "sync",
      entityType: "mail_account",
      entityId: "account-1",
    });

    expect(mocks.activityCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        entityId: "account-1",
        entityLabel: "Inspot Labs Gmail",
      }),
    });
  });
});
