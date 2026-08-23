import { NextResponse, type NextRequest } from "next/server";
import * as mailFilterRuns from "@/lib/services/mail-filter-runs";
import { apiJsonResponse, requireApiToken } from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:read");
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;

  try {
    return apiJsonResponse(
      await mailFilterRuns.getMailFilterRun(auth.workspaceId, null, runId),
    );
  } catch (error) {
    return mapMailError(error);
  }
}
