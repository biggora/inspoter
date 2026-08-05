import { z } from "zod";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";
import {
  BACKUP_SECTIONS,
  type BackupSection,
} from "@/lib/backup/serialization";

// UI-facing (settings > backup & restore) — these messages surface as
// fieldErrors there, in the product's base language (see
// src/lib/validation/error-map.ts).

function dedupeSections(sections: BackupSection[]): BackupSection[] {
  return [...new Set(sections)];
}

export const exportBackupSchema = z.object({
  passphrase: z
    .string()
    .min(10, { error: () => VALIDATION_MESSAGES.backup.passphraseTooShort })
    .max(256, { error: () => VALIDATION_MESSAGES.backup.passphraseTooLong }),
  sections: z
    .array(z.enum(BACKUP_SECTIONS))
    .min(1, { error: () => VALIDATION_MESSAGES.backup.sectionsRequired })
    .transform(dedupeSections),
});

export type ExportBackupInput = z.infer<typeof exportBackupSchema>;

export type BackupImportMode = "replace" | "merge";

// No strength requirement — an archive sealed with a weaker passphrase must
// still be importable with whatever passphrase it was created with.
export const importBackupFieldsSchema = z.object({
  passphrase: z
    .string()
    .min(1, { error: () => VALIDATION_MESSAGES.backup.passphraseRequired })
    .max(256, { error: () => VALIDATION_MESSAGES.backup.passphraseTooLong }),
  mode: z.enum(["replace", "merge"]),
});

export type ImportBackupFieldsInput = z.infer<typeof importBackupFieldsSchema>;
