import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { syncAccount } from "@/lib/services/mail-sync";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import { WebhookAccountHasNoTransportError } from "@/lib/mail";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Manual sync trigger (member access, plan §3/§4). The lease inside
// syncAccount makes overlap with the scheduler safe: busy → 409.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  try {
    const outcome = await syncAccount(id, workspace.id);
    if (outcome.status === "busy") {
      return jsonResponse({ error: "SYNC_IN_PROGRESS" }, { status: 409 });
    }
    if (outcome.status === "error") {
      return jsonResponse({ error: outcome.error }, { status: 502 });
    }
    return jsonResponse(outcome);
  } catch (error) {
    if (error instanceof WebhookAccountHasNoTransportError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if (error instanceof MailAccountNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
