import { NextResponse, type NextRequest } from "next/server";
import * as mailAccounts from "@/lib/services/mail-accounts";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ accountId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;
  const { accountId } = await params;

  try {
    return apiJsonResponse(
      await mailAccounts.listFoldersForAccount(accountId, auth.workspaceId),
    );
  } catch (error) {
    return mapMailError(error);
  }
}
