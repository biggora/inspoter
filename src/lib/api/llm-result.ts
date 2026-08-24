import type { NextResponse } from "next/server";
import type { LlmErrorCategory, LlmResult } from "@/lib/llm/contract";
import { jsonResponse } from "@/lib/api/response";
import { logError } from "@/lib/services/logs";

// Maps an LlmResult<T> to an HTTP response — the LLM counterpart of
// src/lib/api/provider-result.ts.
//
// One deliberate difference from that helper: it puts result.message into the
// body, this one does not. A driver message can carry a truncated upstream
// body, and for a model that body is a restatement of the operator's own
// mail. What goes over the wire is a stable code the client turns into its own
// wording; the message goes to the Logs page, where it is already redacted.

const STATUS_BY_CATEGORY: Record<LlmErrorCategory, number> = {
  auth: 502,
  rate_limit: 429,
  timeout: 504,
  upstream: 502,
  invalid_response: 502,
};

const CODE_BY_CATEGORY: Record<LlmErrorCategory, string> = {
  auth: "AI_AUTH",
  rate_limit: "AI_RATE_LIMIT",
  timeout: "AI_TIMEOUT",
  upstream: "AI_UPSTREAM",
  invalid_response: "AI_INVALID_RESPONSE",
};

export function llmResultResponse<T>(
  result: LlmResult<T>,
  workspaceId: string,
  source: string,
): NextResponse {
  if (result.ok) return jsonResponse(result.data);

  if (result.kind === "unsupported") {
    // No credential, or a driver that cannot do this operation. Not a
    // breakage — it is the "no provider configured" state the Domains and
    // Hosting sections already have, so nothing is logged.
    return jsonResponse({ error: "AI_UNAVAILABLE" }, { status: 501 });
  }

  logError(workspaceId, source, result.message);
  return jsonResponse(
    { error: CODE_BY_CATEGORY[result.category] },
    { status: STATUS_BY_CATEGORY[result.category] },
  );
}
