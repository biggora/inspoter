import type { NextRequest } from "next/server";
import { processWebhook } from "@/lib/webhooks/pipeline";

interface RouteContext {
  params: Promise<{ type: string }>;
}

export async function POST(request: NextRequest, { params }: RouteContext) {
  const { type } = await params;
  return processWebhook(request, type);
}
