import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateMailAccountSchema } from "@/lib/validation/mail";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import { EncryptionNotConfiguredError } from "@/lib/services/credentials";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import { MailTransportError } from "@/lib/mail";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateMailAccountSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const account = await mailAccountsService.updateAccount(
      workspace.id,
      operator.id,
      id,
      parsed.data,
    );
    return jsonResponse(account);
  } catch (error) {
    if (error instanceof WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof EncryptionNotConfiguredError) {
      return jsonResponse({ error: error.message }, { status: 503 });
    }
    if (error instanceof mailAccountsService.WebhookAccountProtectedError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if (error instanceof mailAccountsService.MailAccountNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    if (error instanceof MailTransportError) {
      return jsonResponse({ error: error.message }, { status: 502 });
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
    await mailAccountsService.deleteAccount(workspace.id, operator.id, id);
    return emptyResponse();
  } catch (error) {
    if (error instanceof WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof mailAccountsService.WebhookAccountProtectedError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if (error instanceof mailAccountsService.MailAccountNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
