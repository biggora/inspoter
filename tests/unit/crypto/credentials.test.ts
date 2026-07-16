import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CredentialData,
  decrypt,
  encrypt,
  isEncryptionConfigured,
  maskSecret,
} from "@/lib/crypto/credentials";

const TEST_KEY =
  "1c0c78e9d208fb20edac6012a8b1d6e02a4bdc17f2b28593fdffafcafec6c9e5";
const OTHER_KEY =
  "245ea6a77e7190c267ca696081556cd7f0127162e1aba042ce1a0584701bc2b1";

const SAMPLES: CredentialData[] = [
  { type: "CLOUDFLARE_DNS", apiToken: "cf-token-value" },
  { type: "HETZNER_DNS", apiToken: "hetzner-dns-token" },
  { type: "HETZNER_CLOUD", apiToken: "hetzner-cloud-token" },
  { type: "GODADDY_DNS", apiKey: "godaddy-key", apiSecret: "godaddy-secret" },
];

describe("credential encryption", () => {
  beforeEach(() => {
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each(SAMPLES)("round-trips $type data through encrypt/decrypt", (data) => {
    const payload = encrypt(data);
    const decrypted = decrypt(payload);
    expect(decrypted).toEqual(data);
  });

  it("produces different ciphertexts for the same data on each call", () => {
    const data: CredentialData = {
      type: "CLOUDFLARE_DNS",
      apiToken: "same-token",
    };
    const first = encrypt(data);
    const second = encrypt(data);

    expect(first.iv).not.toBe(second.iv);
    expect(first.encryptedData).not.toBe(second.encryptedData);
    expect(decrypt(first)).toEqual(data);
    expect(decrypt(second)).toEqual(data);
  });

  it("throws when decrypting with the wrong key", () => {
    const data: CredentialData = {
      type: "HETZNER_CLOUD",
      apiToken: "secret-token",
    };
    const payload = encrypt(data);

    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", OTHER_KEY);

    expect(() => decrypt(payload)).toThrow();
  });

  it("throws when the auth tag has been tampered with", () => {
    const data: CredentialData = {
      type: "GODADDY_DNS",
      apiKey: "key",
      apiSecret: "secret",
    };
    const payload = encrypt(data);
    const tamperedByte = payload.authTag.startsWith("00") ? "ff" : "00";
    const tampered = {
      ...payload,
      authTag: tamperedByte + payload.authTag.slice(2),
    };

    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when the encryption key env var is missing", () => {
    vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "");

    expect(() =>
      encrypt({ type: "CLOUDFLARE_DNS", apiToken: "token" }),
    ).toThrow();
  });

  describe("isEncryptionConfigured", () => {
    it("returns false when the key is missing", () => {
      vi.stubEnv("CREDENTIAL_ENCRYPTION_KEY", "");
      expect(isEncryptionConfigured()).toBe(false);
    });

    it("returns false when the key is not 64 hex characters", () => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = "not-hex";
      expect(isEncryptionConfigured()).toBe(false);
    });

    it("returns true when the key is a valid 64-char hex string", () => {
      process.env.CREDENTIAL_ENCRYPTION_KEY = TEST_KEY;
      expect(isEncryptionConfigured()).toBe(true);
    });
  });

  describe("maskSecret", () => {
    it("masks all but the last four characters for long secrets", () => {
      expect(maskSecret("abcdefgh1234")).toBe("****1234");
    });

    it("returns a full mask for secrets of length 4 or less", () => {
      expect(maskSecret("abcd")).toBe("****");
      expect(maskSecret("ab")).toBe("****");
      expect(maskSecret("")).toBe("****");
    });
  });
});
