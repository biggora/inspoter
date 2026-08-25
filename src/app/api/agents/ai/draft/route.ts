import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as agentsAiService from "@/lib/services/agents-ai";
import { agentDraftRequestSchema } from "@/lib/validation/agents-ai";
import { llmResultResponse } from "@/lib/api/llm-result";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Drafts one field of an agent or a skill for the New/Edit dialog
// (architecture.md §7F.7). Read-only in the strongest sense: nothing is
// loaded, nothing is stored, and the answer lives in the operator's form
// until they press Create.
//
// The literal "ai" segment cannot be shadowed by an agent id for the reason
// runs/route.ts already records: Next resolves a static segment before its
// sibling [id], and Agent.id is a cuid.
//
// POST rather than GET even though nothing is mutated: the call is not
// idempotent, it costs tokens, and it counts against LLM_CALL_RATE_LIMIT — a
// GET is something the browser and Next are entitled to prefetch.
//
// One route for all four kind x field combinations, unlike the three mail AI
// routes. Those return three different DTOs to three different consumers; all
// four of these return the same { text, model, trimmed } and differ only in
// two enum values the request already carries, so four files would be four
// copies of one handler. No /api/v1 twin and no MCP tool, per §7F.6.

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = agentDraftRequestSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await agentsAiService.draftAgentText(
      workspace.id,
      { operatorId: operator.id, operatorName: operator.username },
      parsed.data,
    );
    return llmResultResponse(result, workspace.id, "agents-ai-draft");
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
