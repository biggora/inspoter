import { describe, expect, it } from "vitest";

import {
  createKanbanLabelSchema,
  kanbanBoardSchema,
  kanbanCardMoveSchema,
  kanbanCardSchema,
  kanbanCardUpdateSchema,
  kanbanChecklistItemSchema,
  kanbanColumnSchema,
  kanbanColumnUpdateSchema,
  kanbanCommentSchema,
} from "@/lib/validation/kanban";

describe("kanbanBoardSchema", () => {
  it("trims the name and rejects an empty one", () => {
    expect(kanbanBoardSchema.parse({ name: "  Ops  " })).toEqual({
      name: "Ops",
    });
    expect(kanbanBoardSchema.safeParse({ name: "   " }).success).toBe(false);
  });

  it("rejects a name over 60 characters", () => {
    expect(kanbanBoardSchema.safeParse({ name: "x".repeat(61) }).success).toBe(
      false,
    );
  });

  it("rejects unknown keys", () => {
    expect(
      kanbanBoardSchema.safeParse({ name: "Ops", position: 3 }).success,
    ).toBe(false);
  });
});

describe("kanbanColumnSchema", () => {
  const base = { boardId: "b1", name: "Doing", color: "BLUE" };

  it("accepts a preset color and normalizes its case", () => {
    const parsed = kanbanColumnSchema.parse({ ...base, color: "blue" });
    expect(parsed.color).toBe("BLUE");
  });

  it("accepts a hex color", () => {
    expect(kanbanColumnSchema.parse({ ...base, color: "#a1b2c3" }).color).toBe(
      "#A1B2C3",
    );
  });

  it("rejects a color that is neither a preset nor a hex value", () => {
    expect(
      kanbanColumnSchema.safeParse({ ...base, color: "chartreuse" }).success,
    ).toBe(false);
  });

  it("treats the WIP limit as optional and bounded", () => {
    expect(kanbanColumnSchema.parse({ ...base }).wipLimit).toBeUndefined();
    expect(kanbanColumnSchema.parse({ ...base, wipLimit: null }).wipLimit).toBe(
      null,
    );
    expect(kanbanColumnSchema.safeParse({ ...base, wipLimit: 0 }).success).toBe(
      false,
    );
    expect(
      kanbanColumnSchema.safeParse({ ...base, wipLimit: 1000 }).success,
    ).toBe(false);
    expect(
      kanbanColumnSchema.safeParse({ ...base, wipLimit: 2.5 }).success,
    ).toBe(false);
  });
});

describe("kanbanColumnUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(kanbanColumnUpdateSchema.safeParse({}).success).toBe(false);
    expect(kanbanColumnUpdateSchema.safeParse({ isDone: true }).success).toBe(
      true,
    );
  });
});

describe("kanbanCardSchema", () => {
  const base = { columnId: "c1", title: "Renew the certificate" };

  it("defaults priority and due date to absent", () => {
    const parsed = kanbanCardSchema.parse(base);
    expect(parsed.priority).toBeUndefined();
    expect(parsed.dueDate).toBeUndefined();
  });

  it("parses an ISO due date into a Date", () => {
    const parsed = kanbanCardSchema.parse({
      ...base,
      dueDate: "2026-09-01T00:00:00.000Z",
    });
    expect(parsed.dueDate).toBeInstanceOf(Date);
    expect((parsed.dueDate as Date).toISOString()).toBe(
      "2026-09-01T00:00:00.000Z",
    );
  });

  it("rejects a due date that is not ISO-8601", () => {
    expect(
      kanbanCardSchema.safeParse({ ...base, dueDate: "01.09.2026" }).success,
    ).toBe(false);
  });

  it("rejects an unknown priority", () => {
    expect(
      kanbanCardSchema.safeParse({ ...base, priority: "BLOCKER" }).success,
    ).toBe(false);
  });

  // The DB enforces the same pairing with a CHECK; rejecting it here turns a
  // 500 into a field error.
  it("requires linkedType and linkedId to travel together", () => {
    expect(
      kanbanCardSchema.safeParse({ ...base, linkedType: "ALERT" }).success,
    ).toBe(false);
    expect(
      kanbanCardSchema.safeParse({ ...base, linkedId: "a1" }).success,
    ).toBe(false);
    expect(
      kanbanCardSchema.safeParse({
        ...base,
        linkedType: "ALERT",
        linkedId: "a1",
      }).success,
    ).toBe(true);
    // Both null is a complete pair too — that is "no link".
    expect(
      kanbanCardSchema.safeParse({
        ...base,
        linkedType: null,
        linkedId: null,
      }).success,
    ).toBe(true);
  });
});

describe("kanbanCardUpdateSchema", () => {
  it("requires at least one field", () => {
    expect(kanbanCardUpdateSchema.safeParse({}).success).toBe(false);
  });

  it("keeps the link pairing rule", () => {
    expect(
      kanbanCardUpdateSchema.safeParse({ linkedType: "SERVER" }).success,
    ).toBe(false);
  });
});

describe("kanbanCardMoveSchema", () => {
  const column = { columnId: "c1", cardIds: ["k1"] };

  it("accepts one or two columns", () => {
    expect(
      kanbanCardMoveSchema.safeParse({ boardId: "b1", columns: [column] })
        .success,
    ).toBe(true);
    expect(
      kanbanCardMoveSchema.safeParse({
        boardId: "b1",
        columns: [column, { columnId: "c2", cardIds: [] }],
      }).success,
    ).toBe(true);
  });

  // A drag touches the source and the destination and nothing else; a third
  // column in the payload means the client got the contract wrong.
  it("rejects three columns", () => {
    expect(
      kanbanCardMoveSchema.safeParse({
        boardId: "b1",
        columns: [
          column,
          { columnId: "c2", cardIds: [] },
          { columnId: "c3", cardIds: [] },
        ],
      }).success,
    ).toBe(false);
  });

  it("rejects an empty column list", () => {
    expect(
      kanbanCardMoveSchema.safeParse({ boardId: "b1", columns: [] }).success,
    ).toBe(false);
  });
});

describe("checklist and comment schemas", () => {
  it("trims and bounds checklist text", () => {
    expect(kanbanChecklistItemSchema.parse({ text: " Ping " }).text).toBe(
      "Ping",
    );
    expect(kanbanChecklistItemSchema.safeParse({ text: "  " }).success).toBe(
      false,
    );
    expect(
      kanbanChecklistItemSchema.safeParse({ text: "x".repeat(201) }).success,
    ).toBe(false);
  });

  it("rejects an empty comment", () => {
    expect(kanbanCommentSchema.safeParse({ body: "\n\t " }).success).toBe(
      false,
    );
    expect(kanbanCommentSchema.parse({ body: " ok " }).body).toBe("ok");
  });
});

describe("createKanbanLabelSchema", () => {
  // Machine-readable codes, so the label manager can phrase them per locale.
  it("emits codes rather than prose", () => {
    const result = createKanbanLabelSchema.safeParse({
      name: "",
      color: "BLUE",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].message).toBe("LABEL_NAME_REQUIRED");
  });

  it("normalizes whitespace in the display name", () => {
    expect(
      createKanbanLabelSchema.parse({ name: "  ops   team ", color: "RED" })
        .name,
    ).toBe("ops team");
  });
});
