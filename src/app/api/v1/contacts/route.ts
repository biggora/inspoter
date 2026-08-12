import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  contactCreateSchema,
  contactListQuerySchema,
} from "@/lib/validation/contacts";

// Agent-facing contacts. Session-cookie-free: the bearer token is the sole
// authority and carries the workspace (see src/lib/api/token-auth.ts).

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;

  const query = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = contactListQuerySchema.safeParse({
    ...query,
    starred: query.starred === undefined ? undefined : query.starred === "true",
  });
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  return apiJsonResponse(
    await contactsService.list(auth.workspaceId, parsed.data),
  );
}

export async function POST(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;

  const parsed = contactCreateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  // A token has no operator behind it, so the membership check is skipped and
  // the token's own workspace scope is the authority.
  const contact = await contactsService.createContact(
    auth.workspaceId,
    null,
    parsed.data,
  );
  recordTokenActivity(auth, {
    action: "create",
    entityType: "contact",
    entityId: contact.id,
    entityLabel: contact.displayName,
  });

  return apiJsonResponse(contact, { status: 201 });
}
