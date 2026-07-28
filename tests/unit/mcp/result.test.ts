import { describe, expect, it } from "vitest";
import { jsonToolResult, serializeToolPayload } from "@/lib/mcp/result";

describe("tool result serialization", () => {
  it("renders dates as ISO strings", () => {
    const text = serializeToolPayload({
      receivedAt: new Date("2026-07-20T12:00:00.000Z"),
    });

    expect(JSON.parse(text)).toEqual({
      receivedAt: "2026-07-20T12:00:00.000Z",
    });
  });

  it("renders bigint columns as strings instead of throwing", () => {
    const text = serializeToolPayload({
      folders: [{ id: "f1", uidValidity: 42n, lastSeenUid: 9007199254740993n }],
    });

    expect(JSON.parse(text)).toEqual({
      folders: [
        { id: "f1", uidValidity: "42", lastSeenUid: "9007199254740993" },
      ],
    });
  });

  it("serializes nested structures and null payloads", () => {
    expect(JSON.parse(serializeToolPayload({ a: { b: [1, null] } }))).toEqual({
      a: { b: [1, null] },
    });
    expect(serializeToolPayload(undefined)).toBe("null");
    expect(serializeToolPayload(null)).toBe("null");
  });

  it("wraps the payload in a single text content block", () => {
    const result = jsonToolResult({ items: [], nextCursor: null });

    expect(result.isError).toBeUndefined();
    expect(result.content).toHaveLength(1);
    expect(result.content[0]).toMatchObject({ type: "text" });
    expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual({
      items: [],
      nextCursor: null,
    });
  });
});
