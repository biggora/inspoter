import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { mapContactError } from "@/app/api/contacts/errors";
import * as contactsService from "@/lib/services/contacts";
import { recordActivity } from "@/lib/services/activity";
import { contactExportQuerySchema } from "@/lib/validation/contacts";

// GET so the browser can download it directly from a link. The selection is
// expressed either as explicit ids (the checkbox selection) or as the same
// filters the list is showing.
export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

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
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const file = await contactsService.exportContacts(workspace.id, {
      ...parsed.data,
      // Only vCard can carry a photo, so only vCard pays for reading them.
      includePhotos: parsed.data.format.startsWith("vcard"),
    });
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "export",
      entityType: "contact",
      entityId: null,
      entityLabel: null,
      details: JSON.stringify({
        format: parsed.data.format,
        count: file.count,
      }),
    });
    return new NextResponse(file.content, {
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="contacts.${file.fileExtension}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return mapContactError(error, workspace.id);
  }
}
