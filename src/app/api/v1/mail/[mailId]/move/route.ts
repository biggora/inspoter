import { NextResponse, type NextRequest } from "next/server";
import * as mailActions from "@/lib/services/mail-actions";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { moveMailItemSchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ mailId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { mailId } = await params;

  const parsed = moveMailItemSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    await mailActions.moveItem(
      mailId,
      auth.workspaceId,
      parsed.data.targetFolderId,
    );
    recordTokenActivity(auth, {
      action: "move",
      entityType: "mail_item",
      entityId: mailId,
    });
    return apiJsonResponse({
      id: mailId,
      folderId: parsed.data.targetFolderId,
    });
  } catch (error) {
    return mapMailError(error);
  }
}
