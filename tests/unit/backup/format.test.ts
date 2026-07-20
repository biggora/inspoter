import { describe, expect, it } from "vitest";

import {
  BACKUP_FORMAT_VERSION,
  BACKUP_MAGIC,
  BackupInvalidFileError,
  BackupPassphraseInvalidError,
  BackupUnsupportedVersionError,
  openArchive,
  sealArchive,
} from "@/lib/backup/format";
import {
  backupPayloadSchema,
  BACKUP_SCHEMA_VERSION,
} from "@/lib/backup/serialization";

const PASSPHRASE = "correct horse battery staple";

const SAMPLE_PAYLOAD = {
  manifest: {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: "2026-07-20T00:00:00.000Z",
    appVersion: "1.0.0",
    workspace: {
      id: "ws1",
      name: "Тест воркспейс 🚀",
      slug: "test-ws",
      hiddenSections: [],
    },
    sections: ["bookmarks"],
    counts: { categories: 1 },
  },
  data: {
    categories: [
      {
        id: "cat1",
        name: "Родная категория – emoji 🎉 and ünïcödé",
        position: 0,
        parentCategoryId: null,
        createdAt: "2026-07-20T00:00:00.000Z",
        updatedAt: "2026-07-20T00:00:00.000Z",
      },
    ],
  },
};

describe("backup archive format", () => {
  it("round-trips a payload through sealArchive/openArchive, including non-ASCII strings", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    const opened = openArchive(sealed, PASSPHRASE);
    expect(opened).toEqual(SAMPLE_PAYLOAD);
  });

  it("throws BackupPassphraseInvalidError when opened with the wrong passphrase", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    expect(() => openArchive(sealed, "wrong passphrase")).toThrow(
      BackupPassphraseInvalidError,
    );
  });

  it("throws BackupInvalidFileError for a header cut short (< 53 bytes)", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    const truncated = sealed.subarray(0, 40);
    expect(() => openArchive(truncated, PASSPHRASE)).toThrow(
      BackupInvalidFileError,
    );
  });

  it("throws BackupPassphraseInvalidError for a tampered/truncated ciphertext (intact header)", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    const halfCiphertext = sealed.subarray(
      0,
      53 + Math.floor((sealed.length - 53) / 2),
    );
    expect(() => openArchive(halfCiphertext, PASSPHRASE)).toThrow(
      BackupPassphraseInvalidError,
    );
  });

  it("throws BackupInvalidFileError for a bad magic", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    const badMagic = Buffer.from(sealed);
    badMagic.write("XXXXXXXX", 0, "ascii");
    expect(() => openArchive(badMagic, PASSPHRASE)).toThrow(
      BackupInvalidFileError,
    );
  });

  it("throws BackupUnsupportedVersionError when the version byte is patched to 2", () => {
    const sealed = sealArchive(SAMPLE_PAYLOAD, PASSPHRASE);
    const patched = Buffer.from(sealed);
    patched[BACKUP_MAGIC.length] = 2;
    expect(() => openArchive(patched, PASSPHRASE)).toThrow(
      BackupUnsupportedVersionError,
    );
  });

  it("BACKUP_FORMAT_VERSION is 1", () => {
    expect(BACKUP_FORMAT_VERSION).toBe(1);
  });
});

describe("backupPayloadSchema", () => {
  it("accepts a minimal valid payload", () => {
    const result = backupPayloadSchema.safeParse(SAMPLE_PAYLOAD);
    expect(result.success).toBe(true);
  });

  it("rejects a payload with schemaVersion 2", () => {
    const invalid = {
      ...SAMPLE_PAYLOAD,
      manifest: { ...SAMPLE_PAYLOAD.manifest, schemaVersion: 2 },
    };
    const result = backupPayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });

  it("rejects a payload with an unknown section", () => {
    const invalid = {
      ...SAMPLE_PAYLOAD,
      manifest: {
        ...SAMPLE_PAYLOAD.manifest,
        sections: ["not-a-real-section"],
      },
    };
    const result = backupPayloadSchema.safeParse(invalid);
    expect(result.success).toBe(false);
  });
});
