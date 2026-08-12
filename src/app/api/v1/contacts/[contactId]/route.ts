import { NextResponse, type NextRequest } from "next/server";
import * as contactsService from "@/lib/services/contacts";
import {
  apiJsonResponse,
  apiValidationError,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { contactUpdateSchema } from "@/lib/validation/contacts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ contactId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:read");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  const contact = await contactsService.getContact(auth.workspaceId, contactId);
  if (contact === null) {
    return apiJsonResponse(
      { error: { code: "not_found", message: "Contact not found." } },
      { status: 404 },
    );
  }
  return apiJsonResponse(contact);
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  const parsed = contactUpdateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return apiValidationError(parsed.error.issues);

  try {
    const contact = await contactsService.updateContact(
      auth.workspaceId,
      null,
      contactId,
      parsed.data,
    );
    recordTokenActivity(auth, {
      action: "update",
      entityType: "contact",
      entityId: contactId,
      entityLabel: contact.displayName,
    });
    return apiJsonResponse(contact);
  } catch (error) {
    if (error instanceof contactsService.ContactNotFoundError) {
      return apiJsonResponse(
        { error: { code: "not_found", message: "Contact not found." } },
        { status: 404 },
      );
    }
    throw error;
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "contacts:write");
  if (auth instanceof NextResponse) return auth;
  const { contactId } = await params;

  try {
    await contactsService.deleteContact(auth.workspaceId, null, contactId);
    recordTokenActivity(auth, {
      action: "delete",
      entityType: "contact",
      entityId: contactId,
    });
    return apiJsonResponse({ deleted: contactId });
  } catch (error) {
    if (error instanceof contactsService.ContactNotFoundError) {
      return apiJsonResponse(
        { error: { code: "not_found", message: "Contact not found." } },
        { status: 404 },
      );
    }
    throw error;
  }
}
