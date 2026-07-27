import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateCredentialAutoRefreshSchema } from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Per-credential automatic-refresh toggle for the provider listing cache.
// Separate from the PUT on ../route.ts — that one demands the full secret
// payload, and flipping a switch must not require re-entering an API token.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateCredentialAutoRefreshSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const credential = await credentialsService.setAutoRefreshEnabled(
      id,
      workspace.id,
      parsed.data.enabled,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "credential",
      entityId: id,
      entityLabel: credential.label,
      details: parsed.data.enabled
        ? "auto refresh enabled"
        : "auto refresh disabled",
    });
    return jsonResponse(credential);
  } catch (error) {
    if (error instanceof credentialsService.CredentialNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
