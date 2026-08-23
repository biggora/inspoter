import { NextResponse, type NextRequest } from "next/server";
import { sendMail } from "@/lib/services/mail-actions";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { sendMailSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Irreversible, and covered by the workspace send limit on top of the
// per-token rate limit.
export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = sendMailSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const sent = await sendMail(auth.workspaceId, parsed.data);
    recordTokenActivity(auth, {
      action: "send",
      entityType: "mail_item",
      entityId: sent.id ?? undefined,
      entityLabel: parsed.data.subject,
    });
    return apiJsonResponse(sent, { status: 201 });
  } catch (error) {
    return mapMailError(error);
  }
}
