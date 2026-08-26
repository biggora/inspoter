import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";
import * as noteIndex from "@/lib/services/note-index";
import { recordActivity } from "@/lib/services/activity";
import { updateEmbeddingDefaultSchema } from "@/lib/validation/credentials";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  const auth = await requireAuthWithWorkspaceHeader(request).catch((error) =>
    toErrorResponse(error),
  );
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const parsed = updateEmbeddingDefaultSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.issues }, { status: 400 });
  }
  try {
    let status = null;
    if (parsed.data.enabled) {
      status = await noteIndex.configureEmbeddingProfile(
        auth.workspace.id,
        id,
        parsed.data.model ?? "",
        {
          operatorId: auth.operator.id,
          operatorName: auth.operator.username,
        },
      );
    } else {
      await noteIndex.clearEmbeddingProfile(auth.workspace.id);
    }
    void recordActivity(auth.workspace.id, {
      operatorId: auth.operator.id,
      operatorName: auth.operator.username,
      action: "update",
      entityType: "embedding_profile",
      entityId: auth.workspace.id,
      details: JSON.stringify({
        enabled: parsed.data.enabled,
        credentialId: parsed.data.enabled ? id : null,
        model: parsed.data.enabled ? parsed.data.model : null,
      }),
    });
    return jsonResponse(status);
  } catch (error) {
    return toErrorResponse(error, auth.workspace.id);
  }
}
