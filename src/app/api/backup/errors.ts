import type { NextResponse } from "next/server";
import {
  BackupInvalidFileError,
  BackupUnsupportedVersionError,
  BackupPassphraseInvalidError,
} from "@/lib/backup/format";
import {
  BackupSecretDecryptError,
  BackupTooLargeError,
} from "@/lib/services/backup";
import { WorkspaceOwnerRequiredError } from "@/lib/services/workspace-auth";
import { WorkspaceNotFoundError } from "@/lib/services/workspaces";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

// Mirrors src/app/api/workspaces/errors.ts — Prisma/generic fallback is
// delegated to toErrorResponse, which already maps EncryptionNotConfiguredError
// (from src/lib/services/outgoingWebhooks.ts, reused here for backup) to 503.
export function mapBackupError(error: unknown): NextResponse {
  if (
    error instanceof BackupInvalidFileError ||
    error instanceof BackupUnsupportedVersionError ||
    error instanceof BackupPassphraseInvalidError
  ) {
    return jsonResponse({ error: error.code }, { status: 400 });
  }
  if (error instanceof BackupTooLargeError) {
    return jsonResponse({ error: error.code }, { status: 413 });
  }
  if (error instanceof BackupSecretDecryptError) {
    return jsonResponse({ error: error.code }, { status: 500 });
  }
  if (error instanceof WorkspaceOwnerRequiredError) {
    return jsonResponse({ error: error.message }, { status: 403 });
  }
  if (error instanceof WorkspaceNotFoundError) {
    return jsonResponse({ error: error.message }, { status: 404 });
  }
  return toErrorResponse(error);
}
