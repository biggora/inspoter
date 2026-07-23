import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { z } from "zod";
import * as hostingService from "@/lib/services/hosting";
import { providerResultResponse } from "@/lib/api/provider-result";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

const suspendSchema = z.object({
  suspended: z.boolean(),
});

interface RouteContext {
  params: Promise<{ providerId: string; id: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { providerId, id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = suspendSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await hostingService.setSuspended(
    workspace.id,
    providerId,
    id,
    parsed.data.suspended,
  );
  if (result.ok) {
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "hosting_account",
      entityId: id,
      details: parsed.data.suspended ? "suspended" : "unsuspended",
    });
    return jsonResponse({ ok: true }, { status: 200 });
  }
  return providerResultResponse(result);
}
