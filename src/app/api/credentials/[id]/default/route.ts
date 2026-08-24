import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateCredentialDefaultSchema } from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Marks the credential as the workspace's active one for its category — today
// only src/lib/llm reads the flag. Separate from the PUT on ../route.ts for
// the same reason as ../auto-refresh: choosing which model answers must not
// require re-entering the API key.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateCredentialDefaultSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const credential = await credentialsService.setDefaultCredential(
      id,
      workspace.id,
      parsed.data.isDefault,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "credential",
      entityId: id,
      entityLabel: credential.label,
      details: parsed.data.isDefault ? "set as default" : "unset as default",
    });
    return jsonResponse(credential);
  } catch (error) {
    if (error instanceof credentialsService.CredentialNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
