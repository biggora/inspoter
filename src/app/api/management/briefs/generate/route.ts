import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { generateExecutiveBriefNow } from "@/lib/services/executive-briefs";

const generateSchema = z
  .object({ period: z.enum(["DAILY", "WEEKLY"]) })
  .strict();

export async function POST(request: NextRequest) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const parsed = generateSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  try {
    const result = await generateExecutiveBriefNow(
      authResult.workspace.id,
      parsed.data.period,
    );
    return jsonResponse(result, { status: result.active ? 202 : 201 });
  } catch (error) {
    return toErrorResponse(error, authResult.workspace.id);
  }
}
