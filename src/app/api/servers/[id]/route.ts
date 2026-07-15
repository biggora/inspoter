import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { id } = await params;
  const result = await serversService.getServer(id);
  if (!result.ok) {
    return jsonResponse(
      {
        error:
          result.kind === "error"
            ? result.message
            : `Unsupported: ${result.operation}`,
      },
      { status: result.kind === "error" ? 404 : 501 },
    );
  }
  return jsonResponse(result.data);
}
