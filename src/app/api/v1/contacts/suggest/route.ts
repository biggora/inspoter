import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  requireApiToken,
} from "@/lib/api/token-auth";

// Static segment, so it wins over /api/v1/contacts/[contactId].
// Address-level rather than contact-level: one contact with three addresses
// answers three suggestions, which is what a compose field needs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    query: z.string().trim().min(1),
    limit: z.coerce.number().int().min(1).max(50).optional(),
  })
  .strict();

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;

  const parsed = querySchema.safeParse(
    Object.fromEntries(request.nextUrl.searchParams),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  return apiJsonResponse(
    await contactsService.suggestRecipients(
      auth.workspaceId,
      parsed.data.query,
      parsed.data.limit,
    ),
  );
}
