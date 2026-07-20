import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { updateSectionVisibilitySchema } from "@/lib/validation/workspaces";
import * as workspacesService from "@/lib/services/workspaces";
import { mapWorkspaceServiceError } from "@/app/api/workspaces/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Per-workspace section visibility (workspace-section-visibility). Separate
// route from the rename PATCH — mirrors the members/switch split — so the two
// concerns stay isolated. Owner-only is enforced in the service layer.
export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => mapWorkspaceServiceError(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = updateSectionVisibilitySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const workspace = await workspacesService.setHiddenSections(
      id,
      operator.id,
      parsed.data.hiddenSections,
    );
    return jsonResponse(workspace);
  } catch (error) {
    return mapWorkspaceServiceError(error);
  }
}
