import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { env } from "@/lib/config/env";
import * as mailFilterRunsService from "@/lib/services/mail-filter-runs";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function serviceErrorResponse(error: unknown) {
  if (
    error instanceof mailFilterRunsService.MailFilterRunResourceNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WorkspaceOwnerRequiredError) {
    return jsonResponse({ error: "WORKSPACE_OWNER_REQUIRED" }, { status: 403 });
  }
  return toErrorResponse(error);
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  if (!env.MAIL_LABELS_ENABLED) {
    return jsonResponse({ error: "Resource not found." }, { status: 404 });
  }
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;

  try {
    return jsonResponse(
      await mailFilterRunsService.getMailFilterRun(
        authResult.workspace.id,
        authResult.operator.id,
        id,
      ),
    );
  } catch (error) {
    return serviceErrorResponse(error);
  }
}
