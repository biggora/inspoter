import { NextResponse } from "next/server";
import { Prisma } from "@/generated/prisma/client";
import {
  WorkspaceContextRequiredError,
  WorkspaceContextStaleError,
} from "@/lib/auth/dal";
import {
  AlertCategoryNotFoundError,
  AlertNotFoundError,
} from "@/lib/services/alerts";
import { CategoryHierarchyValidationError } from "@/lib/services/bookmarks";
import {
  DashboardLayoutValidationError,
  DashboardNotFoundError,
  DashboardWidgetConfigError,
  DashboardWidgetNotFoundError,
} from "@/lib/services/dashboards";
import {
  EncryptionNotConfiguredError,
  OutgoingWebhookNotFoundError,
  WebhookDeliveryNotFoundError,
} from "@/lib/services/outgoingWebhooks";
import { ServerMetricsError } from "@/lib/services/serverMetrics";
import { CredentialDeleteConflictError } from "@/lib/services/credentials";
import {
  WebhookTokenActiveError,
  WebhookTokenNotFoundError,
  WebhookTokenRevokedError,
} from "@/lib/services/webhookTokens";
import { jsonResponse } from "@/lib/api/response";
import { logError } from "@/lib/services/logs";

// Shared Prisma-error -> HTTP response mapping (code-review fix, Slice 1,
// minor #4). Without this, a nonexistent categoryId on bookmark create
// (FK violation, P2003) or an update/delete against a missing id (P2025)
// surfaced as an unhandled 500 from all four Bookmarks route handlers.
// Machine-readable `{error}` shape mirrors the validation-error responses
// (architecture §3.7 style). Anything else is rethrown so it still
// surfaces as a 500 (unexpected — not swallowed).
//
// Persistence to the Logs page (feat/logs unexpected-errors): only the
// genuinely unexpected paths are logged — the final `throw error` and the
// ServerMetricsError fallthrough to 500. The typed 400/404/409/503
// branches above are expected client-side rejections (bad input, not
// found, stale workspace context, ownership) and are deliberately left
// silent so the Logs page isn't flooded with noise no operator can act
// on. Logging is best-effort and only fires when a workspaceId is known.

// Truncate so a single pathological stack trace can't bloat the LogEntry
// table; enough context survives to identify the failing frame.
const STACK_TRUNCATE_LENGTH = 1000;

function logUnexpectedError(workspaceId: string | undefined, error: unknown) {
  if (!workspaceId) return;
  const name =
    error instanceof Error
      ? error.name
      : (error?.constructor?.name ?? typeof error);
  const message = error instanceof Error ? error.message : String(error);
  const details: Record<string, unknown> = { name };
  if (error instanceof Error && error.stack) {
    details.stack = error.stack.slice(0, STACK_TRUNCATE_LENGTH);
  }
  logError(workspaceId, "api", message, JSON.stringify(details));
}

export function toErrorResponse(
  error: unknown,
  workspaceId?: string,
): NextResponse {
  if (error instanceof WorkspaceContextRequiredError) {
    return jsonResponse(
      { error: "WORKSPACE_CONTEXT_REQUIRED", message: error.message },
      { status: 400 },
    );
  }
  if (error instanceof WorkspaceContextStaleError) {
    return jsonResponse(
      { error: "WORKSPACE_CONTEXT_STALE", message: error.message },
      { status: 409 },
    );
  }
  if (error instanceof CategoryHierarchyValidationError) {
    return jsonResponse({ error: error.message }, { status: 400 });
  }
  if (
    error instanceof AlertNotFoundError ||
    error instanceof AlertCategoryNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (
    error instanceof DashboardNotFoundError ||
    error instanceof DashboardWidgetNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (
    error instanceof DashboardLayoutValidationError ||
    error instanceof DashboardWidgetConfigError
  ) {
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: 400 },
    );
  }
  if (
    error instanceof OutgoingWebhookNotFoundError ||
    error instanceof WebhookDeliveryNotFoundError
  ) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof EncryptionNotConfiguredError) {
    return jsonResponse({ error: error.code }, { status: 503 });
  }
  if (error instanceof ServerMetricsError) {
    const statusMap: Record<string, number> = {
      SERVER_MATCH_AMBIGUOUS: 409,
      ADDRESS_CONFLICT: 409,
      PROVIDER_INVENTORY_UNAVAILABLE: 503,
    };
    const status = statusMap[error.code];
    if (status === undefined) {
      // Unknown ServerMetricsError code — falls through to 500, so this
      // is an unexpected path worth persisting (see header comment).
      logUnexpectedError(workspaceId, error);
    }
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: status ?? 500 },
    );
  }
  if (error instanceof CredentialDeleteConflictError) {
    return jsonResponse(
      { error: error.code, message: error.message },
      { status: 409 },
    );
  }
  if (error instanceof WebhookTokenNotFoundError) {
    return jsonResponse({ error: error.code }, { status: 404 });
  }
  if (error instanceof WebhookTokenRevokedError) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (error instanceof WebhookTokenActiveError) {
    return jsonResponse({ error: error.code }, { status: 409 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return jsonResponse(
        { error: "Referenced resource does not exist." },
        { status: 400 },
      );
    }
    if (error.code === "P2025") {
      return jsonResponse({ error: "Resource not found." }, { status: 404 });
    }
  }
  // Genuinely unrecognized error — surfaces as an unlogged-by-default 500
  // to the caller, so persist it here before rethrowing.
  logUnexpectedError(workspaceId, error);
  throw error;
}
