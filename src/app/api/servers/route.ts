import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";

export async function GET() {
  await requireAuth();
  const result = await serversService.listServers();
  if (!result.ok) {
    return NextResponse.json({ error: result.kind === "error" ? result.message : `Unsupported: ${result.operation}` }, { status: 502 });
  }
  return NextResponse.json(result.data);
}
