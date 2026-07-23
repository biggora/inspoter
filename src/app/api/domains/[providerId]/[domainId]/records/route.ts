import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { dnsRecordInputSchema } from "@/lib/validation/dns";
import { providerResultResponse } from "@/lib/api/provider-result";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { recordActivity } from "@/lib/services/activity";

interface RouteContext {
  params: Promise<{ providerId: string; domainId: string }>;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { providerId, domainId } = await params;

  const result = await domainsService.listRecords(
    workspace.id,
    providerId,
    domainId,
  );
  return providerResultResponse(result);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { operator, workspace } = authResult;
  const { providerId, domainId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = dnsRecordInputSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await domainsService.createRecord(
    workspace.id,
    providerId,
    domainId,
    parsed.data,
  );
  if (result.ok) {
    recordActivity(workspace.id, {
      operatorId: operator.id,
      operatorName: operator.username,
      action: "create",
      entityType: "dns_record",
      entityId: result.data.id,
      entityLabel: `${parsed.data.type} ${parsed.data.name}`,
    });
  }
  return providerResultResponse(result, 201);
}
