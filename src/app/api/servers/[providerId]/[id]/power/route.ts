import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { z } from "zod";
import * as serversService from "@/lib/services/servers";
import { providerResultResponse } from "@/lib/api/provider-result";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

const powerSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
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
  const parsed = powerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await serversService.power(
    workspace.id,
    providerId,
    id,
    parsed.data.action,
  );
  if (result.ok) {
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "server",
      entityId: id,
      details: parsed.data.action,
    });
    return jsonResponse({ ok: true }, { status: 200 });
  }
  return providerResultResponse(result);
}
