import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateMailAccountSchema } from "@/lib/validation/mail";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import { EncryptionNotConfiguredError } from "@/lib/services/credentials";
import { MailTransportError } from "@/lib/mail";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

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
      id,
      parsed.data,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "mail_account",
      entityId: id,
    });
    return jsonResponse(account);
  } catch (error) {
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
    await mailAccountsService.deleteAccount(workspace.id, id);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "mail_account",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    if (error instanceof mailAccountsService.WebhookAccountProtectedError) {
      return jsonResponse({ error: error.message }, { status: 400 });
    }
    if (error instanceof mailAccountsService.MailAccountNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
