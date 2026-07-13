import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as domainsService from "@/lib/services/domains";

export async function GET() {
  await requireAuth();
  const providers = await domainsService.listDomains();
  return NextResponse.json(providers);
}
