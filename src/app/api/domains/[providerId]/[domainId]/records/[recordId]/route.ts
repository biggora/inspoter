import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { dnsRecordPatchSchema } from "@/lib/validation/dns";
import { providerResultResponse } from "@/lib/api/provider-result";
import { toErrorResponse } from "@/lib/api/errors";

interface RouteContext {
  params: Promise<{ providerId: string; domainId: string; recordId: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { providerId, domainId, recordId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = dnsRecordPatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await domainsService.updateRecord(
    providerId,
    domainId,
    recordId,
    parsed.data,
  );
  return providerResultResponse(result);
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { providerId, domainId, recordId } = await params;

  const result = await domainsService.deleteRecord(
    providerId,
    domainId,
    recordId,
  );
  return providerResultResponse(result, 204);
}
