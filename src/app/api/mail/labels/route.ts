import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as mailLabelsService from "@/lib/services/mail-labels";
import { recordActivity } from "@/lib/services/activity";
import { WorkspaceMemberRequiredError } from "@/lib/services/workspace-auth";
import {
  createMailLabelSchema,
  listMailLabelsQuerySchema,
} from "@/lib/validation/mail";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const parsed = listMailLabelsQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const labels = await mailLabelsService.listLabels(
    authResult.workspace.id,
    parsed.data.accountId && parsed.data.folderId
      ? {
          accountId: parsed.data.accountId,
          folderId: parsed.data.folderId,
        }
      : undefined,
  );
  return jsonResponse(labels);
}

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null);
  const parsed = createMailLabelSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const label = await mailLabelsService.createLabel(
      authResult.workspace.id,
      authResult.operator.id,
      parsed.data,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "create",
      entityType: "mail_label",
      entityId: label.id,
    });
    return jsonResponse(label, { status: 201 });
  } catch (error) {
    if (error instanceof WorkspaceMemberRequiredError) {
      return jsonResponse(
        { error: "WORKSPACE_MEMBER_REQUIRED" },
        { status: 403 },
      );
    }
    if (error instanceof mailLabelsService.MailLabelNameConflictError) {
      return jsonResponse({ error: error.code }, { status: 409 });
    }
    if (error instanceof mailLabelsService.MailLabelLimitReachedError) {
      return jsonResponse({ error: error.code }, { status: 409 });
    }
    return toErrorResponse(error);
  }
}
