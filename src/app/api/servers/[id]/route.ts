import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import * as serversService from "@/lib/services/servers";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAuth();
  const { id } = await params;
  const result = await serversService.getServer(id);
  if (!result.ok) {
    return NextResponse.json(
      {
        error:
          result.kind === "error"
            ? result.message
            : `Unsupported: ${result.operation}`,
      },
      { status: result.kind === "error" ? 404 : 501 },
    );
  }
  return NextResponse.json(result.data);
}
