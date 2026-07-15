import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import {
  upsertCredentialSchema,
  toCredentialData,
} from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

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
    await credentialsService.requireWorkspaceOwner(workspace.id, operator.id);
    const credential = await credentialsService.createCredential(
      workspace.id,
      parsed.data.provider,
      parsed.data.label,
      toCredentialData(parsed.data),
    );
    return jsonResponse(credential, { status: 201 });
  } catch (error) {
    if (error instanceof credentialsService.WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof credentialsService.EncryptionNotConfiguredError) {
      return jsonResponse({ error: error.message }, { status: 503 });
    }
    return toErrorResponse(error);
  }
}
