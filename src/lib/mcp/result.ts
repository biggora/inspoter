import type { CallToolResult } from "@modelcontextprotocol/server";

// Tool results are plain JSON text blocks. Service DTOs carry `Date` values
// (serialized to ISO by JSON.stringify) and, on a few Prisma rows, `bigint`
// columns — MailFolder.uidValidity/lastSeenUid being the ones an MCP tool can
// actually reach. JSON.stringify throws on bigint, so it is stringified here
// rather than left to blow up mid-response.
function replacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function serializeToolPayload(payload: unknown): string {
  return JSON.stringify(payload ?? null, replacer, 2);
}

export function jsonToolResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: serializeToolPayload(payload) }],
  };
}
