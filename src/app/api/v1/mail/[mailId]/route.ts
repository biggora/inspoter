import { NextResponse, type NextRequest } from "next/server";
import * as mailService from "@/lib/services/mail";
import * as mailActions from "@/lib/services/mail-actions";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { patchMailItemSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ mailId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;
  const { mailId } = await params;

  const item = await mailService.getById(mailId, auth.workspaceId);
  if (!item) return apiNotFound("Mail message");
  return apiJsonResponse(mailService.toMailDetailDto(item));
}

// Read state only — the rest of a message is what the server sent.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { mailId } = await params;

  const parsed = patchMailItemSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await mailActions.setRead(mailId, auth.workspaceId, parsed.data.isRead);
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_item",
      entityId: mailId,
    });
    return apiJsonResponse({ id: mailId, isRead: parsed.data.isRead });
  } catch (error) {
    return mapMailError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { mailId } = await params;

  try {
    // The first delete moves the message to Trash; deleting from Trash — or
    // from an account without one — is permanent, and `status` says which.
    const result = await mailActions.deleteItem(mailId, auth.workspaceId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "mail_item",
      entityId: mailId,
    });
    return apiJsonResponse({ id: mailId, ...result });
  } catch (error) {
    return mapMailError(error);
  }
}
