import { NextResponse, type NextRequest } from "next/server";
import * as mailLabelAssignments from "@/lib/services/mail-label-assignments";
import {
  apiJsonResponse,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ mailId: string; labelId: string }>;
}

// PUT rather than POST: assigning a label a message already carries is a
// no-op, matching the browser route next door.
export async function PUT(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { mailId, labelId } = await params;

  try {
    const label = await mailLabelAssignments.assignLabel(
      auth.workspaceId,
      mailId,
      labelId,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_item",
      entityId: mailId,
    });
    return apiJsonResponse(label);
  } catch (error) {
    return mapMailError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { mailId, labelId } = await params;

  try {
    await mailLabelAssignments.removeLabel(auth.workspaceId, mailId, labelId);
    recordTokenActivity(auth, {
      action: "update",
      entityType: "mail_item",
      entityId: mailId,
    });
    return apiJsonResponse({ id: mailId, labelId, removed: true });
  } catch (error) {
    return mapMailError(error);
  }
}
