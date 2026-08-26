import { describe, expect, it } from "vitest";
import { partitionTurnsForSummary } from "@/lib/agents/chat-context";

describe("partitionTurnsForSummary", () => {
  it("keeps the newest complete turns and reports the summarized boundary", () => {
    const result = partitionTurnsForSummary(
      [
        { sequence: 1, input: "first", answer: "answer one" },
        { sequence: 2, input: "second", answer: "answer two" },
        { sequence: 3, input: "third", answer: "answer three" },
      ],
      22,
    );

    expect(result.older.map((turn) => turn.sequence)).toEqual([1, 2]);
    expect(result.recent.map((turn) => turn.sequence)).toEqual([3]);
    expect(result.boundary).toBe(2);
  });
});
