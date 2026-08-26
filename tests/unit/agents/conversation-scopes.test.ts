import { describe, expect, it } from "vitest";
import { findMissingHistoricalScopes } from "@/lib/agents/conversation-scopes";

describe("findMissingHistoricalScopes", () => {
  it("returns only historical scopes absent from the replacement agent", () => {
    expect(
      findMissingHistoricalScopes(
        ["notes:read", "bookmarks:read", "bookmarks:write"],
        ["notes:read", "bookmarks:read"],
      ),
    ).toEqual(["bookmarks:write"]);
  });

  it("does not require acknowledgement when every historical scope remains", () => {
    expect(
      findMissingHistoricalScopes(
        ["notes:read"],
        ["notes:read", "notes:write"],
      ),
    ).toEqual([]);
  });
});
