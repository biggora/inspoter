// Thin fetch wrapper for the /api/backup routes (backend-owned,
// src/app/api/backup/**). Mirrors src/components/workspace/api.ts's
// request()/ApiError shape. Section/mode types and the import summary shape
// are redefined locally instead of imported from src/lib/backup/serialization.ts
// / src/lib/validation/backup.ts / src/lib/services/backup.ts: those modules
// pull in @/generated/prisma/client, which instantiates the Prisma client
// class (node:path/node:process, query engine loading) at module top level —
// not safe to bundle client-side (see that file's own "please refer to
// browser.ts" note). Keep BACKUP_SECTIONS in sync with
// src/lib/backup/serialization.ts manually.

import {
  getActiveWorkspaceId,
  WORKSPACE_HEADER_NAME,
} from "@/lib/client/active-workspace";

export const BACKUP_SECTIONS = [
  "bookmarks",
  "messages",
  "mail",
  "logs",
  "alerts",
  "services",
  "webhooks",
  "providers",
  "workspaceSettings",
] as const;

export type BackupSection = (typeof BACKUP_SECTIONS)[number];

export type BackupImportMode = "replace" | "merge";

export interface ImportSummary {
  mode: BackupImportMode;
  imported: Record<string, number>;
  skipped: { webhookTokens: number; providerResourceBindings: number };
}

export class ApiError extends Error {
  fieldErrors?: Record<string, string>;

  constructor(message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "ApiError";
    this.fieldErrors = fieldErrors;
  }
}

// Known machine-readable error codes surfaced by src/app/api/backup/errors.ts
// (mapBackupError) — everything else (WorkspaceOwnerRequiredError's English
// sentence, Prisma fallbacks, etc.) falls back to a generic message.
const KNOWN_ERROR_CODES = [
  "BACKUP_INVALID_FILE",
  "BACKUP_UNSUPPORTED_VERSION",
  "BACKUP_PASSPHRASE_INVALID_OR_CORRUPT",
  "BACKUP_TOO_LARGE",
  "BACKUP_SECRET_DECRYPT_FAILED",
  "ENCRYPTION_NOT_CONFIGURED",
] as const;

export function backupErrorMessage(
  err: unknown,
  t: (key: string) => string,
): string {
  if (err instanceof ApiError) {
    const code = KNOWN_ERROR_CODES.find((known) => known === err.message);
    if (code) return t(`errors.${code}`);
  }
  return t("errors.generic");
}

interface ZodIssueLike {
  path?: Array<string | number>;
  message: string;
}

async function readError(res: Response): Promise<ApiError> {
  let message = "Something went wrong. Try again.";
  let fieldErrors: Record<string, string> | undefined;
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body?.error === "string") {
      message = body.error;
    } else if (Array.isArray(body?.error)) {
      // src/lib/validation/backup.ts 400 shape: { error: ZodIssue[] },
      // already Russian-localized server-side (VALIDATION_RU.backup.*).
      fieldErrors = {};
      for (const issue of body.error as ZodIssueLike[]) {
        const key = issue.path?.[0];
        if (typeof key === "string" && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      message = (body.error as ZodIssueLike[])[0]?.message ?? message;
    }
  } catch {
    // Non-JSON error body — fall back to the generic message above.
  }
  return new ApiError(message, fieldErrors);
}

// RFC 6266/5987 filename parsing — mirrors the encoding written by
// src/app/api/backup/export/route.ts's contentDisposition(). filename*
// (UTF-8, percent-encoded) takes precedence over the ASCII filename fallback.
function parseFilename(header: string | null): string {
  const fallback = "inspot-backup.inspot-backup";
  if (!header) return fallback;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (utf8Match) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      // fall through to the ascii filename below
    }
  }
  const asciiMatch = /filename="([^"]+)"/i.exec(header);
  return asciiMatch ? asciiMatch[1] : fallback;
}

export async function exportBackup(
  passphrase: string,
  sections: BackupSection[],
): Promise<void> {
  const res = await fetch("/api/backup/export", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "",
    },
    body: JSON.stringify({ passphrase, sections }),
  });

  if (!res.ok) throw await readError(res);

  const blob = await res.blob();
  const filename = parseFilename(res.headers.get("Content-Disposition"));
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function importBackup(
  file: File,
  mode: BackupImportMode,
  passphrase: string,
): Promise<ImportSummary> {
  const form = new FormData();
  form.append("file", file);
  form.append("passphrase", passphrase);
  form.append("mode", mode);

  const res = await fetch("/api/backup/import", {
    method: "POST",
    // No Content-Type — the browser sets the multipart boundary itself.
    headers: { [WORKSPACE_HEADER_NAME]: getActiveWorkspaceId() ?? "" },
    body: form,
  });

  if (!res.ok) throw await readError(res);
  return (await res.json()) as ImportSummary;
}
