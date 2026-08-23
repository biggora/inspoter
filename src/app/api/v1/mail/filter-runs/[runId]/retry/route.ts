import { NextResponse, type NextRequest } from "next/server";
import * as mailFilterRuns from "@/lib/services/mail-filter-runs";
import {
  apiJsonResponse,
  recordTokenActivity,
  requireApiToken,
} from "@/lib/api/token-auth";
import { mapMailError } from "@/app/api/v1/mail/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ runId: string }>;
}

// Only a failed run can be retried; a pending, running or finished one
// answers 409.
export async function POST(request: NextRequest, { params }: RouteContext) {
  const auth = await requireApiToken(request, "mail:write");
  if (auth instanceof NextResponse) return auth;
  const { runId } = await params;

  try {
    const run = await mailFilterRuns.retryMailFilterRun(
      auth.workspaceId,
      null,
      runId,
    );
    recordTokenActivity(auth, {
      action: "retry",
      entityType: "mail_filter_run",
      entityId: runId,
    });
    return apiJsonResponse(run);
  } catch (error) {
    return mapMailError(error);
  }
}
