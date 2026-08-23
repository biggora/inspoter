import { NextResponse, type NextRequest } from "next/server";
import * as mailLabels from "@/lib/services/mail-labels";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { createMailLabelSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(await mailLabels.listLabels(auth.workspaceId));
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = createMailLabelSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    // A token has no operator behind it, so the membership check is skipped
    // and the token's own workspace scope is the authority.
    const label = await mailLabels.createLabel(
      auth.workspaceId,
      null,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "create",
      entityType: "mail_label",
      entityId: label.id,
      entityLabel: label.name,
    });
    return apiJsonResponse(label, { status: 201 });
  } catch (error) {
    return mapMailError(error);
  }
}
