import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as mailActionsService from "@/lib/services/mail-actions";
import { sendMailSchema } from "@/lib/validation/mail";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

// Send a message through an IMAP account's SMTP transport (member access,
// plan §4 Phase 6). 429 on the per-workspace rate limit; 201 carries the id
// of the locally created Sent row (null when the account has no SENT folder).
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = sendMailSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await mailActionsService.sendMail(workspace.id, parsed.data);
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "send",
      entityType: "mail",
      entityLabel: parsed.data.subject,
    });
    return jsonResponse(result, { status: 201 });
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
