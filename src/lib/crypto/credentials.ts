import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const KEY_ENV = "CREDENTIAL_ENCRYPTION_KEY";

export type CredentialData =
  | { type: "CLOUDFLARE_DNS"; apiToken: string }
  | { type: "HETZNER_DNS"; apiToken: string }
  | { type: "HETZNER_CLOUD"; apiToken: string }
  | { type: "GODADDY_DNS"; apiKey: string; apiSecret: string }
  | { type: "MAIL_PASSWORD"; imapPassword: string; smtpPassword?: string }
  | { type: "HOSTINGER"; apiToken: string }
  | {
      type: "CPANEL_WHM";
      hostname: string;
      username: string;
      apiToken: string;
      allowInsecure?: boolean;
    }
  | {
      type: "CPANEL_UAPI";
      hostname: string;
      username: string;
      apiToken: string;
      allowInsecure?: boolean;
    }
  | { type: "WEBHOOK_SECRET"; secret: string }
  // Ed25519 private key (PKCS#8, base64) of a DISCORD_EVENTS outgoing webhook.
  // The public half lives unencrypted in OutgoingWebhook.publicKey so the
  // operator can configure it on the receiving side
  // (specs/discord-webhook-compatibility.md §7).
  | { type: "WEBHOOK_ED25519_KEY"; privateKey: string; secret: string }
  // OpenAI-compatible LLM endpoint (src/lib/llm). `mode` selects the driver
  // the same way MailAccount.mode does: MOCK is the deterministic in-process
  // driver used by tests and e2e, REAL talks to baseUrl.
  | {
      type: "OPENAI_COMPATIBLE";
      baseUrl: string;
      model: string;
      apiKey: string;
      mode: "MOCK" | "REAL";
    }
  // Anthropic-compatible LLM endpoint (src/lib/llm/anthropic.ts): z.ai/GLM
  // and Anthropic itself. Same fields as above — the two differ only in the
  // wire format the driver speaks, never in what the operator has to enter.
  | {
      type: "ANTHROPIC_COMPATIBLE";
      baseUrl: string;
      model: string;
      apiKey: string;
      mode: "MOCK" | "REAL";
    };

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
