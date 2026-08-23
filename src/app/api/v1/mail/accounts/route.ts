import { NextResponse, type NextRequest } from "next/server";
import * as mailAccounts from "@/lib/services/mail-accounts";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Read-only. Creating, editing and deleting an account means handling IMAP and
// SMTP credentials, which stays an operator action in /settings/mail.
export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;

  return apiJsonResponse(await mailAccounts.listAccounts(auth.workspaceId));
}
