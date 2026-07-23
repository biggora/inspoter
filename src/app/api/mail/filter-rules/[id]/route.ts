import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { env } from "@/lib/config/env";
import * as mailFilterRulesService from "@/lib/services/mail-filter-rules";
import { recordActivity } from "@/lib/services/activity";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import { updateMailFilterRuleSchema } from "@/lib/validation/mail";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function disabledResponse() {
  return jsonResponse({ error: "Resource not found." }, { status: 404 });
}

function serviceErrorResponse(error: unknown) {
  if (
    error instanceof mailFilterRulesService.MailFilterRuleResourceNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WorkspaceOwnerRequiredError) {
    return jsonResponse({ error: "WORKSPACE_OWNER_REQUIRED" }, { status: 403 });
  }
  if (
    error instanceof
    mailFilterRulesService.ActiveMailFilterRuleLimitReachedError
  ) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (
    error instanceof mailFilterRulesService.MailFilterRulePredicateRequiredError
  ) {
    return jsonResponse({ error: error.code }, { status: 400 });
  }
  return toErrorResponse(error);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  if (!env.MAIL_LABELS_ENABLED) return disabledResponse();
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateMailFilterRuleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const rule = await mailFilterRulesService.updateMailFilterRule(
      authResult.workspace.id,
      authResult.operator.id,
      id,
      parsed.data,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "update",
      entityType: "mail_filter_rule",
      entityId: id,
    });
    return jsonResponse(rule);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  if (!env.MAIL_LABELS_ENABLED) return disabledResponse();
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    await mailFilterRulesService.deleteMailFilterRule(
      authResult.workspace.id,
      authResult.operator.id,
      id,
    );
    recordActivity(authResult.workspace.id, {
      operatorId: authResult.operator.id,
      operatorName: authResult.operator.username,
      action: "delete",
      entityType: "mail_filter_rule",
      entityId: id,
    });
    return emptyResponse();
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
