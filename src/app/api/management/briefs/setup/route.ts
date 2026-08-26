import { NextResponse, type NextRequest } from "next/server";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { ensureExecutiveBriefSetup } from "@/lib/services/executive-briefs";

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  try {
    return jsonResponse(
      await ensureExecutiveBriefSetup(authResult.workspace.id),
    );
  } catch (error) {
    return toErrorResponse(error, authResult.workspace.id);
  }
}
