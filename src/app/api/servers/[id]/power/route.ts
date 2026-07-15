import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { z } from "zod";
import * as serversService from "@/lib/services/servers";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

const powerSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = powerSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await serversService.power(
    workspace.id,
    id,
    parsed.data.action,
  );
  if (!result.ok) {
    const status = result.kind === "error" ? 502 : 501;
    return jsonResponse(
      {
        error:
          result.kind === "error"
            ? result.message
            : `Unsupported: ${result.operation}`,
      },
      { status },
    );
  }

  return jsonResponse({ ok: true }, { status: 200 });
}
