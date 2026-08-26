import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  mailFolderFindMany: vi.fn(),
  mailItemCount: vi.fn(),
  alertCount: vi.fn(),
  messageCount: vi.fn(),
  reminderOccurrenceCount: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: {
    mailFolder: { findMany: mocks.mailFolderFindMany },
    mailItem: { count: mocks.mailItemCount },
    alert: { count: mocks.alertCount },
    message: { count: mocks.messageCount },
    reminderOccurrence: { count: mocks.reminderOccurrenceCount },
  },
}));

import { getUnreadCounts } from "@/lib/services/notification-counts";

const WORKSPACE_ID = "workspace-1";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.mailFolderFindMany.mockResolvedValue([
    { id: "inbox-a" },
    { id: "inbox-b" },
  ]);
  mocks.mailItemCount.mockResolvedValue(4);
  mocks.alertCount.mockResolvedValue(2);
  mocks.messageCount.mockResolvedValue(7);
  mocks.reminderOccurrenceCount.mockResolvedValue(3);
});

describe("getUnreadCounts", () => {
  it("returns one unread total per topbar indicator", async () => {
    await expect(getUnreadCounts(WORKSPACE_ID)).resolves.toEqual({
      mail: 4,
      alerts: 2,
      messages: 7,
      calendar: 3,
    });
  });

  it("counts mail only in the workspace's INBOX folders", async () => {
    await getUnreadCounts(WORKSPACE_ID);

    expect(mocks.mailFolderFindMany).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, specialUse: "INBOX" },
      select: { id: true },
    });
    // Filtered by folderId rather than the folder relation, so the
    // [workspaceId, accountId, folderId, isRead] index can serve the count.
    expect(mocks.mailItemCount).toHaveBeenCalledWith({
      where: {
        workspaceId: WORKSPACE_ID,
        isRead: false,
        folderId: { in: ["inbox-a", "inbox-b"] },
      },
    });
  });

  it("reports zero mail without querying items when there is no INBOX", async () => {
    mocks.mailFolderFindMany.mockResolvedValue([]);

    const counts = await getUnreadCounts(WORKSPACE_ID);

    expect(counts.mail).toBe(0);
    expect(mocks.mailItemCount).not.toHaveBeenCalled();
  });

  it("scopes alert and message counts to unread rows of the workspace", async () => {
    await getUnreadCounts(WORKSPACE_ID);

    expect(mocks.alertCount).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, isRead: false },
    });
    expect(mocks.messageCount).toHaveBeenCalledWith({
      where: { workspaceId: WORKSPACE_ID, isRead: false },
    });
  });
});
