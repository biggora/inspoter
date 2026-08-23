import { NextResponse, type NextRequest } from "next/server";
import * as mailFilterRules from "@/lib/services/mail-filter-rules";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { updateMailFilterRuleSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ ruleId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { ruleId } = await params;

  const parsed = updateMailFilterRuleSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const rule = await mailFilterRules.updateMailFilterRule(
      auth.workspaceId,
      null,
      ruleId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_filter_rule",
      entityId: ruleId,
      entityLabel: rule.name,
    });
    return apiJsonResponse(rule);
  } catch (error) {
    return mapMailError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { ruleId } = await params;

  try {
    await mailFilterRules.deleteMailFilterRule(auth.workspaceId, null, ruleId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "mail_filter_rule",
      entityId: ruleId,
    });
    return apiJsonResponse({ deleted: ruleId });
  } catch (error) {
    return mapMailError(error);
  }
}
