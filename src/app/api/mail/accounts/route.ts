import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { createMailAccountSchema } from "@/lib/validation/mail";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import { syncAccount } from "@/lib/services/mail-sync";
import { EncryptionNotConfiguredError } from "@/lib/services/credentials";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import { MailTransportError } from "@/lib/mail";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const accounts = await mailAccountsService.listAccounts(workspace.id);
  return jsonResponse(accounts);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = createMailAccountSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const account = await mailAccountsService.createAccount(
      workspace.id,
      operator.id,
      parsed.data,
    );
    // Fire-and-forget first sync — don't block the 201; the lease makes
    // overlap with the scheduler safe, failures land in syncStatus/syncError.
    void syncAccount(account.id, workspace.id).catch(() => {});
    return jsonResponse(account, { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof EncryptionNotConfiguredError) {
      return jsonResponse({ error: error.message }, { status: 503 });
    }
    if (error instanceof MailTransportError) {
      return jsonResponse({ error: error.message }, { status: 502 });
    }
    return toErrorResponse(error);
  }
}
