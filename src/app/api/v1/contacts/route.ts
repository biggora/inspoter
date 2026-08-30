import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiNotFound,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import {
  contactCreateSchema,
  contactListQuerySchema,
} from "@/lib/validation/contacts";
import { idempotencyKeySchema } from "@/lib/validation/webhookTokens";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

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

  const rawIdempotencyKey = request.headers.get("idempotency-key");
  const idempotencyKey =
    rawIdempotencyKey === null
      ? null
      : idempotencyKeySchema.safeParse(rawIdempotencyKey);
  if (idempotencyKey !== null && !idempotencyKey.success) {
    return apiValidationError(idempotencyKey.error.issues);
  }

  try {
    // A token has no operator behind it, so the membership check is skipped and
    // the token's own workspace scope is the authority.
    const batch =
      idempotencyKey === null
        ? null
        : await contactsService.createContactsIdempotent(
            auth.workspaceId,
            null,
            auth.tokenId,
            idempotencyKey.data,
            [parsed.data],
          );
    const contact =
      batch === null
        ? await contactsService.createContact(
            auth.workspaceId,
            null,
            parsed.data,
          )
        : await contactsService.getContact(
            auth.workspaceId,
            batch.contacts[0].id,
          );
    if (!contact) return apiNotFound("Contact");
    if (batch === null || !batch.replayed) {
      recordTokenActivity(auth, {
        action: "create",
        entityType: "contact",
        entityId: contact.id,
        entityLabel: contact.displayName,
      });
    }

    return apiJsonResponse(contact, {
      status: batch?.replayed === true ? 200 : 201,
    });
  } catch (error) {
    return mapContactApiError(error);
  }
}
