import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

export async function GET(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const result = await serversService.listServers();
  if (!result.ok) {
    return jsonResponse(
      {
        error:
          result.kind === "error"
            ? result.message
            : `Unsupported: ${result.operation}`,
      },
      { status: 502 },
    );
  }
  return jsonResponse(result.data);
}
