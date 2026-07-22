import { NextResponse, type NextRequest } from "next/server";

import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { mailActionErrorResponse } from "@/lib/api/mail-action-errors";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { saveMailDraft } from "@/lib/services/mail-drafts";
import { saveMailDraftSchema } from "@/lib/validation/mail";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = saveMailDraftSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const draft = await saveMailDraft(workspace.id, parsed.data);
    return jsonResponse(draft);
  } catch (error) {
    return mailActionErrorResponse(error);
  }
}
