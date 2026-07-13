import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";
import { dnsRecordInputSchema } from "@/lib/validation/dns";
import { providerResultResponse } from "@/lib/api/provider-result";

interface RouteContext {
  params: Promise<{ providerId: string; domainId: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteContext) {
  await requireAuth();
  const { providerId, domainId } = await params;

  const result = await domainsService.listRecords(providerId, domainId);
  return providerResultResponse(result);
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  await requireAuth();
  const { providerId, domainId } = await params;

  const body = await request.json().catch(() => null);
  const parsed = dnsRecordInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await domainsService.createRecord(
    providerId,
    domainId,
    parsed.data,
  );
  return providerResultResponse(result, 201);
}
