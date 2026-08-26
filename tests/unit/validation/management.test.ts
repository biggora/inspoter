import { describe, expect, it } from "vitest";
import {
  decisionTransitionSchema,
  managementActionSchema,
  updateDecisionSchema,
} from "@/lib/validation/management";

describe("management action validation", () => {
  it.each([
    {
      type: "CREATE_KANBAN_CARD",
      payload: { columnId: "column-1", title: "Create a card" },
    },
    {
      type: "CREATE_REMINDER",
      payload: { title: "Follow up", dueAt: "2026-08-27T08:00:00.000Z" },
    },
    {
      type: "CREATE_NOTE",
      payload: { title: "Decision record", content: "Approved." },
    },
    {
      type: "CREATE_MAIL_DRAFT",
      payload: {
        accountId: "account-1",
        to: ["owner@example.test"],
        subject: "Follow-up",
        bodyText: "Draft only.",
      },
    },
  ])("accepts the bounded $type contract", (action) => {
    expect(managementActionSchema.safeParse(action).success).toBe(true);
  });

  it("rejects unknown action types and unknown fields", () => {
    expect(
      managementActionSchema.safeParse({
        type: "SEND_MAIL",
        payload: { accountId: "account-1" },
      }).success,
    ).toBe(false);
    expect(
      managementActionSchema.safeParse({
        type: "CREATE_NOTE",
        payload: { title: "Note", content: "", executeMcp: true },
      }).success,
    ).toBe(false);
  });

  it("rejects Reminder links that would require provider or network reads", () => {
    expect(
      managementActionSchema.safeParse({
        type: "CREATE_REMINDER",
        payload: {
          title: "Follow up",
          dueAt: "2026-08-27T08:00:00.000Z",
          links: [
            {
              targetType: "HOSTING_ACCOUNT",
              targetId: "remote-account",
              targetLabel: "Remote account",
            },
          ],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects mail recipients beyond the aggregate safety cap", () => {
    const recipients = Array.from(
      { length: 20 },
      (_, index) => `person-${index}@example.test`,
    );
    expect(
      managementActionSchema.safeParse({
        type: "CREATE_MAIL_DRAFT",
        payload: {
          accountId: "account-1",
          to: recipients,
          cc: recipients,
          bcc: ["extra@example.test"],
          subject: "Draft",
          bodyText: "",
        },
      }).success,
    ).toBe(false);
  });
});

describe("management concurrency and transitions", () => {
  it("requires an optimistic version on mutations", () => {
    expect(updateDecisionSchema.safeParse({ title: "Changed" }).success).toBe(
      false,
    );
  });

  it("requires a concrete future timestamp shape for defer", () => {
    expect(
      decisionTransitionSchema.safeParse({
        transition: "DEFER",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      decisionTransitionSchema.safeParse({
        transition: "DEFER",
        expectedVersion: 1,
        deferredUntil: "2026-08-27T08:00:00.000Z",
      }).success,
    ).toBe(true);
  });
});
