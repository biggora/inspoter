import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { dnsRecordPatchSchema } from "@/lib/validation/dns";
import { providerResultResponse } from "@/lib/api/provider-result";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ providerId: string; domainId: string; recordId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { providerId, domainId, recordId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = dnsRecordPatchSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await domainsService.updateRecord(
    workspace.id,
    providerId,
    domainId,
    recordId,
    parsed.data,
  );
  if (result.ok) {
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "update",
      entityType: "dns_record",
      entityId: recordId,
    });
  }
  return providerResultResponse(result);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { providerId, domainId, recordId } = await params;

  const result = await domainsService.deleteRecord(
    workspace.id,
    providerId,
    domainId,
    recordId,
  );
  if (result.ok) {
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "delete",
      entityType: "dns_record",
      entityId: recordId,
    });
  }
  return providerResultResponse(result, 204);
}
