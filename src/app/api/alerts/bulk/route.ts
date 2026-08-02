import { NextResponse, type NextRequest } from "next/server";
import { AlertCategorySource } from "@/generated/prisma/client";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as alertsService from "@/lib/services/alerts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";
import { alertBulkCategorySchema } from "@/lib/validation/alerts";

// Reclassifying a backlog in one call — the operator-facing counterpart to
// filtering by "no category". Bounded by MAX_BULK_ALERTS in the schema; a
// larger selection is paged by the caller.
export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;

  const body = await request.json().catch(() => null);
  const parsed = alertBulkCategorySchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  try {
    const result = await alertsService.setCategoryBulk(
      workspace.id,
      parsed.data.ids,
      parsed.data.alertCategoryId,
      AlertCategorySource.MANUAL,
    );
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "alert",
      details: JSON.stringify({
        updated: result.updated,
        alertCategoryId: parsed.data.alertCategoryId,
      }),
    });
    return jsonResponse(result);
  } catch (error) {
    return toErrorResponse(error, workspace.id);
  }
}
