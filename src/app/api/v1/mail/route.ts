import { NextResponse, type NextRequest } from "next/server";
import * as mailService from "@/lib/services/mail";
import {
  apiJsonResponse,
  apiValidationError,
  requireApiToken,
} from "@/lib/api/token-auth";
import { listMailQuerySchema } from "@/lib/validation/mail";
import { mapMailError } from "@/app/api/v1/mail/errors";

// Agent-facing mail. Session-cookie-free: the bearer token is the sole
// authority and carries the workspace (see src/lib/api/token-auth.ts).
//
// Creating, editing and deleting mail accounts is deliberately not exposed
// anywhere in this family: an account carries IMAP and SMTP credentials, and
// handing those to an agent means putting a password through its context.
// Accounts stay an operator action in /settings/mail; everything an agent
// needs — reading, organizing, sending and syncing — is here.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;

  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listMailQuerySchema.safeParse({
    ...query,
    unread: query.unread === undefined ? undefined : query.unread === "true",
  });
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const result = await mailService.list(auth.workspaceId, parsed.data);
    return apiJsonResponse({
      items: result.items.map(mailService.toMailListItemDto),
      nextCursor: result.nextCursor,
    });
  } catch (error) {
    return mapMailError(error);
  }
}
