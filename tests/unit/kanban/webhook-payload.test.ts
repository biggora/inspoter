import { describe, expect, it } from "vitest";

import { cardWebhookPayload } from "@/lib/kanban/webhook-payload";
import type { KanbanCardDetail } from "@/lib/services/kanban";

function card(overrides: Partial<KanbanCardDetail> = {}): KanbanCardDetail {
  return {
    id: "k1",
    boardId: "b1",
    columnId: "c1",
    title: "Renew the certificate",
    description: null,
    position: 0,
    priority: "HIGH",
    dueDate: new Date("2026-09-01T00:00:00.000Z"),
    isOverdue: false,
    assignee: { operatorId: "op-1", username: "alex" },
    linkedType: "ALERT",
    linkedId: "a-1",
    linkedLabel: "certificate expires in 3 days",
    completedAt: null,
    labels: [
      { id: "l1", name: "ops", color: "BLUE" },
      { id: "l2", name: "urgent", color: "RED" },
    ],
    checklistTotal: 3,
    checklistDone: 1,
    commentCount: 2,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("cardWebhookPayload", () => {
  it("serializes dates as ISO strings and labels as names", () => {
    const payload = cardWebhookPayload(card());
    expect(payload.dueDate).toBe("2026-09-01T00:00:00.000Z");
    expect(payload.labels).toEqual(["ops", "urgent"]);
    expect(payload.assignee).toBe("alex");
    expect(payload.completedAt).toBe(null);
  });

  it("emits nulls rather than omitting empty fields", () => {
    const payload = cardWebhookPayload(
      card({ dueDate: null, assignee: null, linkedType: null, linkedId: null }),
    );
    expect(payload.dueDate).toBe(null);
    expect(payload.assignee).toBe(null);
    expect(payload.linkedType).toBe(null);
    expect(payload.linkedId).toBe(null);
  });

  // The move route adds fromColumnId to the same shape rather than defining a
  // second payload type.
  it("accepts overrides", () => {
    const payload = cardWebhookPayload(card(), { fromColumnId: "c0" });
    expect(payload.fromColumnId).toBe("c0");
    expect(payload.columnId).toBe("c1");
  });

  it("carries the completion timestamp once the card is done", () => {
    const payload = cardWebhookPayload(
      card({ completedAt: new Date("2026-08-10T12:00:00.000Z") }),
    );
    expect(payload.completedAt).toBe("2026-08-10T12:00:00.000Z");
  });

  it("never leaks the card description", () => {
    const payload = cardWebhookPayload(
      card({ description: "<p>internal notes</p>" }),
    );
    expect(JSON.stringify(payload)).not.toContain("internal notes");
  });
});
