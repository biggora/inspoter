import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";

// Binary container format for workspace backup exports (.inspot-backup, v1).
// Layout: [0..8) magic | [8] version | [9..25) scrypt salt | [25..37) GCM iv |
// [37..53) GCM auth tag | [53..) ciphertext (gzip(JSON) encrypted with
// aes-256-gcm, key = scrypt(passphrase, salt, 32)).

export const BACKUP_MAGIC = Buffer.from("INSPOTBK", "ascii");
export const BACKUP_FORMAT_VERSION = 1;

const ALGORITHM = "aes-256-gcm";
const SALT_LENGTH = 16;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const MAGIC_END = BACKUP_MAGIC.length; // 8
const VERSION_END = MAGIC_END + 1; // 9
const SALT_END = VERSION_END + SALT_LENGTH; // 25
const IV_END = SALT_END + IV_LENGTH; // 37
const AUTH_TAG_END = IV_END + AUTH_TAG_LENGTH; // 53
const HEADER_LENGTH = AUTH_TAG_END; // 53

export class BackupInvalidFileError extends Error {
  readonly code = "BACKUP_INVALID_FILE" as const;
  constructor() {
    super("Not a valid backup file");
    this.name = "BackupInvalidFileError";
  }
}

export class BackupUnsupportedVersionError extends Error {
  readonly code = "BACKUP_UNSUPPORTED_VERSION" as const;
  constructor(version: number) {
    super(`Unsupported backup format version: ${version}`);
    this.name = "BackupUnsupportedVersionError";
  }
}

export class BackupPassphraseInvalidError extends Error {
  readonly code = "BACKUP_PASSPHRASE_INVALID_OR_CORRUPT" as const;
  constructor() {
    super("Passphrase is incorrect or the backup file is corrupt");
    this.name = "BackupPassphraseInvalidError";
  }
}

export class BackupTooLargeError extends Error {
  readonly code = "BACKUP_TOO_LARGE" as const;
  constructor() {
    super("Backup file exceeds the maximum allowed size");
    this.name = "BackupTooLargeError";
  }
}

export function sealArchive(payload: unknown, passphrase: string): Buffer {
  const compressed = gzipSync(Buffer.from(JSON.stringify(payload), "utf8"));

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = scryptSync(passphrase, salt, KEY_LENGTH);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([
    BACKUP_MAGIC,
    Buffer.from([BACKUP_FORMAT_VERSION]),
    salt,
    iv,
    authTag,
    ciphertext,
  ]);
}

export function openArchive(
  file: Buffer,
  passphrase: string,
  options?: { maxDecompressedBytes?: number },
): unknown {
  if (
    file.length < HEADER_LENGTH ||
    !file.subarray(0, MAGIC_END).equals(BACKUP_MAGIC)
  ) {
    throw new BackupInvalidFileError();
  }

  const version = file[MAGIC_END];
  if (version !== BACKUP_FORMAT_VERSION) {
    throw new BackupUnsupportedVersionError(version);
  }

  const salt = file.subarray(VERSION_END, SALT_END);
  const iv = file.subarray(SALT_END, IV_END);
  const authTag = file.subarray(IV_END, AUTH_TAG_END);
  const ciphertext = file.subarray(AUTH_TAG_END);

  const key = scryptSync(passphrase, salt, KEY_LENGTH);

  let compressed: Buffer;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    compressed = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new BackupPassphraseInvalidError();
  }

  let decompressed: Buffer;
  try {
    decompressed =
      options?.maxDecompressedBytes !== undefined
        ? gunzipSync(compressed, {
            maxOutputLength: options.maxDecompressedBytes,
          })
        : gunzipSync(compressed);
  } catch (error) {
    if (
      error instanceof RangeError &&
      (error as NodeJS.ErrnoException).code === "ERR_BUFFER_TOO_LARGE"
    ) {
      throw new BackupTooLargeError();
    }
    throw new BackupInvalidFileError();
  }

  try {
    return JSON.parse(decompressed.toString("utf8"));
  } catch {
    throw new BackupInvalidFileError();
  }
}
