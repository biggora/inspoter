import { NextResponse } from "next/server";
import {
  LastMemberError,
  LastOwnerError,
  LastWorkspaceError,
  WorkspaceAuthorizationError,
  WorkspaceNotFoundError,
  WorkspaceValidationError,
} from "@/lib/services/workspaces";
import { toErrorResponse } from "@/lib/api/errors";

export function mapWorkspaceServiceError(error: unknown): NextResponse {
  if (error instanceof WorkspaceNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }
  if (error instanceof WorkspaceAuthorizationError) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (
    error instanceof LastOwnerError ||
    error instanceof LastMemberError ||
    error instanceof LastWorkspaceError
  ) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof WorkspaceValidationError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return toErrorResponse(error);
}
