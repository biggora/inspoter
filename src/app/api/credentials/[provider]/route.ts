import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { providerParamSchema } from "@/lib/validation/credentials";
import * as credentialsService from "@/lib/services/credentials";
import { toErrorResponse } from "@/lib/api/errors";
import { emptyResponse, jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace, operator } = authResult;
  const { provider: rawProvider } = await params;

  const parsed = providerParamSchema.safeParse(rawProvider);
  if (!parsed.success) {
    return jsonResponse({ error: "Unknown provider" }, { status: 400 });
  }

  try {
    await credentialsService.requireWorkspaceOwner(workspace.id, operator.id);
    await credentialsService.deleteCredential(workspace.id, parsed.data);
    return emptyResponse();
  } catch (error) {
    if (error instanceof credentialsService.WorkspaceOwnerRequiredError) {
      return jsonResponse({ error: error.message }, { status: 403 });
    }
    if (error instanceof credentialsService.CredentialNotFoundError) {
      return jsonResponse({ error: error.message }, { status: 404 });
    }
    return toErrorResponse(error);
  }
}
