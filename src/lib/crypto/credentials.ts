import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_ENV = "CREDENTIAL_ENCRYPTION_KEY";

export type CredentialData =
  | { type: "CLOUDFLARE_DNS"; apiToken: string }
  | { type: "HETZNER_DNS"; apiToken: string }
  | { type: "HETZNER_CLOUD"; apiToken: string }
  | { type: "GODADDY_DNS"; apiKey: string; apiSecret: string }
  | { type: "MAIL_PASSWORD"; imapPassword: string; smtpPassword?: string };

export interface EncryptedPayload {
  encryptedData: string; // hex
  iv: string; // hex
  authTag: string; // hex
}

export function isEncryptionConfigured(): boolean {
  const hex = process.env[KEY_ENV];
  return typeof hex === "string" && /^[0-9a-f]{64}$/i.test(hex);
}

function getMasterKey(): Buffer {
  const hex = process.env[KEY_ENV];
  if (!hex || !/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(
      "CREDENTIAL_ENCRYPTION_KEY must be a 64-char hex string (32 bytes)",
    );
  }
  return Buffer.from(hex, "hex");
}

export function encrypt(data: CredentialData): EncryptedPayload {
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return {
    encryptedData: encrypted.toString("hex"),
    iv: iv.toString("hex"),
    authTag: cipher.getAuthTag().toString("hex"),
  };
}

export function decrypt(payload: EncryptedPayload): CredentialData {
  const key = getMasterKey();
  const decipher = createDecipheriv(
    ALGORITHM,
    key,
    Buffer.from(payload.iv, "hex"),
  );
  decipher.setAuthTag(Buffer.from(payload.authTag, "hex"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(payload.encryptedData, "hex")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8"));
}

export function maskSecret(secret: string): string {
  if (secret.length <= 4) return "****";
  return "****" + secret.slice(-4);
}
