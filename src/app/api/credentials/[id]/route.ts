import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { upsertCredentialSchema, toCredentialData } from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = upsertCredentialSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await credentialsService.requireWorkspaceOwner(workspace.id, operator.id);
    const credential = await credentialsService.updateCredential(
      id,
      workspace.id,
      parsed.data.label,
      toCredentialData(parsed.data),
    );
    return jsonResponse(credential);
  } catch (error) {
    if (error instanceof credentialsService.WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof credentialsService.EncryptionNotConfiguredError) {
      return jsonResponse({ error: error.message }, { status: 503 });
    }
    if (error instanceof credentialsService.CredentialNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  try {
    await credentialsService.requireWorkspaceOwner(workspace.id, operator.id);
    await credentialsService.deleteCredential(id, workspace.id);
    return emptyResponse();
  } catch (error) {
    if (error instanceof credentialsService.WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof credentialsService.CredentialNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
