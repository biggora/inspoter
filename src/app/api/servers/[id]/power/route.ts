import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth/dal";
import { z } from "zod";
import * as serversService from "@/lib/services/servers";

const powerSchema = z.object({
  action: z.enum(["start", "stop", "restart"]),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await requireAuth();
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const parsed = powerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues }, { status: 400 });
  }

  const result = await serversService.power(id, parsed.data.action);
  if (!result.ok) {
    const status = result.kind === "error" ? 502 : 501;
    return NextResponse.json(
      {
        error:
          result.kind === "error"
            ? result.message
            : `Unsupported: ${result.operation}`,
      },
      { status },
    );
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}
