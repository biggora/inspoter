import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailAiService from "@/lib/services/mail-ai";
import { proposeMailFilterRuleSchema } from "@/lib/validation/mail-ai";
import { llmResultResponse } from "@/lib/api/llm-result";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Propose a filter rule from one message (specs/ai-integration.md
// scenario 3). The proposal only pre-fills the rule form — the rule is
// created by the operator's submit, and the deterministic engine runs it
// exactly as if it had been typed by hand.
//
// POST rather than GET even though nothing is mutated: the call is not
// idempotent, it costs tokens, and it counts against LLM_CALL_RATE_LIMIT. A
// GET is something the browser and Next are entitled to prefetch, which would
// bill the operator for a hover.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = proposeMailFilterRuleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await mailAiService.proposeMailFilterRule(
      workspace.id,
      id,
      {
        operatorId: operator.id,
        operatorName: operator.username,
      },
      parsed.data,
    );
    return llmResultResponse(result, workspace.id, "mail-ai-filter-rule");
  } catch (error) {
    return mailActionErrorResponse(error, workspace.id);
  }
}
