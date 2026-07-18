import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { testMailAccountSchema } from "@/lib/validation/mail";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import {
  requireWorkspaceOwner,
  WorkspaceOwnerRequiredError,
} from "@/lib/services/workspace-auth";
import { MailTransportError } from "@/lib/mail";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = testMailAccountSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    await requireWorkspaceOwner(workspace.id, operator.id);
    const result = await mailAccountsService.testConnection(parsed.data);
    return jsonResponse(result);
  } catch (error) {
    if (error instanceof WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof MailTransportError) {
      return jsonResponse({ error: error.message }, { status: 502 });
    }
    return toErrorResponse(error);
  }
}
