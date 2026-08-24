import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailAiService from "@/lib/services/mail-ai";
import { summarizeMailSchema } from "@/lib/validation/mail-ai";
import { llmResultResponse } from "@/lib/api/llm-result";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Summarize one message for the reading pane (specs/ai-integration.md
// scenario 1). Read-only: nothing is stored, the answer lives in the
// operator's screen for as long as the message is open.
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
  const parsed = summarizeMailSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await mailAiService.summarizeMailMessage(
      workspace.id,
      id,
      {
        operatorId: operator.id,
        operatorName: operator.username,
      },
      parsed.data,
    );
    return llmResultResponse(result, workspace.id, "mail-ai-summary");
  } catch (error) {
    return mailActionErrorResponse(error, workspace.id);
  }
}
