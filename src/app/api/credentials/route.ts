import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  upsertCredentialSchema,
  toCredentialData,
} from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const credentials = await credentialsService.listCredentials(workspace.id);
  return jsonResponse(credentials);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = upsertCredentialSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const credential = await credentialsService.createCredential(
      workspace.id,
      parsed.data.provider,
      parsed.data.label,
      toCredentialData(parsed.data),
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "credential",
      entityId: credential.id,
      entityLabel: parsed.data.label,
    });
    return jsonResponse(credential, { status: 201 });
  } catch (error) {
    if (error instanceof credentialsService.EncryptionNotConfiguredError) {
      return jsonResponse({ error: error.message }, { status: 503 });
    }
    return toErrorResponse(error);
  }
}
