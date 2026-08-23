import { NextResponse, type NextRequest } from "next/server";
import { syncAccount } from "@/lib/services/mail-sync";
import {
  apiErrorResponse,
  apiJsonResponse,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { accountId } = await params;

  try {
    const outcome = await syncAccount(accountId, auth.workspaceId);
    // Exactly one syncer per account: a second caller is told to wait rather
    // than queued behind the first.
    if (outcome.status === "busy") {
      return apiErrorResponse(
        409,
        "SYNC_IN_PROGRESS",
        "A sync of this account is already running.",
      );
    }
    if (outcome.status === "error") {
      return apiErrorResponse(502, "UPSTREAM_FAILED", outcome.error);
    }
    recordTokenActivity(auth, {
      action: "sync",
      entityType: "mail_account",
      entityId: accountId,
    });
    return apiJsonResponse(outcome);
  } catch (error) {
    return mapMailError(error);
  }
}
