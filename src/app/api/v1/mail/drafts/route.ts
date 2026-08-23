import { NextResponse, type NextRequest } from "next/server";
import { saveMailDraft } from "@/lib/services/mail-drafts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { saveMailDraftSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Upsert: omit draftId to create a draft, pass it to overwrite one.
export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = saveMailDraftSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const draft = await saveMailDraft(auth.workspaceId, parsed.data);
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_draft",
      entityId: draft.id,
      entityLabel: parsed.data.subject,
    });
    return apiJsonResponse(draft);
  } catch (error) {
    return mapMailError(error);
  }
}
