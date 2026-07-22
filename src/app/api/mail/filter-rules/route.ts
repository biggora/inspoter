import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { env } from "@/lib/config/env";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as mailFilterRulesService from "@/lib/services/mail-filter-rules";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import {
  createMailFilterRuleSchema,
  listMailFilterRulesQuerySchema,
} from "@/lib/validation/mail";

function disabledResponse() {
  return jsonResponse({ error: "Resource not found." }, { status: 404 });
}

function serviceErrorResponse(error: unknown) {
  if (error instanceof WorkspaceOwnerRequiredError) {
    return jsonResponse({ error: "WORKSPACE_OWNER_REQUIRED" }, { status: 403 });
  }
  if (
    error instanceof mailFilterRulesService.MailFilterRuleResourceNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
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

export async function GET(request: NextRequest) {
  if (!env.MAIL_LABELS_ENABLED) return disabledResponse();
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const parsed = listMailFilterRulesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const rules = await mailFilterRulesService.listMailFilterRules(
      authResult.workspace.id,
      authResult.operator.id,
      parsed.data.accountId,
    );
    return jsonResponse(rules);
  } catch (error) {
    return serviceErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  if (!env.MAIL_LABELS_ENABLED) return disabledResponse();
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;

  const body = await request.json().catch(() => null);
  const parsed = createMailFilterRuleSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const rule = await mailFilterRulesService.createMailFilterRule(
      authResult.workspace.id,
      authResult.operator.id,
      parsed.data,
    );
    return jsonResponse(rule, { status: 201 });
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
