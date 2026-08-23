import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactExportQuerySchema } from "@/lib/validation/contacts";
import { mapContactApiError } from "@/app/api/v1/contacts/errors";

// Static segment, so it wins over /api/v1/contacts/[contactId].
//
// Unlike the browser route next door this answers JSON rather than a file
// download: the caller is a script or an agent that wants the text, not a
// browser following a link. The selection is expressed either as explicit ids
// or as the same filters the list operation takes.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;

  const params = request.nextUrl.searchParams;
  const contactIds = params.getAll("contactId");
  const parsed = contactExportQuerySchema.safeParse({
    format: params.get("format") ?? undefined,
    contactIds: contactIds.length > 0 ? contactIds : undefined,
    labelId: params.get("labelId") ?? undefined,
    query: params.get("query") ?? undefined,
    starred:
      params.get("starred") === null
        ? undefined
        : params.get("starred") === "true",
  });
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    return apiJsonResponse(
      await contactsService.exportContacts(auth.workspaceId, {
        ...parsed.data,
        // Only vCard can carry a photo, so only vCard pays for reading them.
        includePhotos: parsed.data.format.startsWith("vcard"),
      }),
    );
  } catch (error) {
    return mapContactApiError(error);
  }
}
