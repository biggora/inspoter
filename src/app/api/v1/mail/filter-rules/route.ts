import { NextResponse, type NextRequest } from "next/server";
import * as mailFilterRules from "@/lib/services/mail-filter-rules";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  createMailFilterRuleSchema,
  listMailFilterRulesQuerySchema,
} from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = listMailFilterRulesQuerySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    return apiJsonResponse(
      await mailFilterRules.listMailFilterRules(
        auth.workspaceId,
        null,
        parsed.data.accountId,
      ),
    );
  } catch (error) {
    return mapMailError(error);
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = createMailFilterRuleSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const rule = await mailFilterRules.createMailFilterRule(
      auth.workspaceId,
      null,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "mail_filter_rule",
      entityId: rule.id,
      entityLabel: rule.name,
    });
    return apiJsonResponse(rule, { status: 201 });
  } catch (error) {
    return mapMailError(error);
  }
}
