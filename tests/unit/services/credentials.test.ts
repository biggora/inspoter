import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as credentialsService from "@/lib/services/credentials";

// Provider credential service (encrypted at rest, workspace-scoped).
// CREDENTIAL_ENCRYPTION_KEY is not in scripts/test-env.mjs's TEST_ENV_KEYS
// allowlist, so it must be set directly here — a fixed 64-char hex test key.
process.env.CREDENTIAL_ENCRYPTION_KEY ??=
  "7d65bff94a983c4052b8fce4bbc9ed8a50c4c014fca6c22121a2662d9e9a2bea";

const NAME_PREFIX = `cred-${randomUUID()}`;
let workspaceId: string;

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Test Workspace",
      slug: `test-${randomUUID()}`,
      updatedAt: new Date(),
    },
  });
  workspaceId = workspace.id;
});

afterAll(async () => {
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => {});
  }
});

describe("upsertCredential + listCredentials", () => {
  it("persists a credential and returns metadata only (no raw secret)", async () => {
    const summary = await credentialsService.upsertCredential(
      workspaceId,
      "CLOUDFLARE_DNS",
      `${NAME_PREFIX}-cf`,
      { type: "CLOUDFLARE_DNS", apiToken: "cf-secret-token-value" },
    );

    expect(summary.provider).toBe("CLOUDFLARE_DNS");
    expect(summary.label).toBe(`${NAME_PREFIX}-cf`);
    expect(summary.maskedHint).toBe("****alue");

    const list = await credentialsService.listCredentials(workspaceId);
    const found = list.find((c) => c.id === summary.id);
    expect(found).toBeTruthy();
    expect(found).not.toHaveProperty("apiToken");
    expect(found).not.toHaveProperty("encryptedData");
    expect(found).not.toHaveProperty("iv");
    expect(found).not.toHaveProperty("authTag");
  });
});

describe("upsertCredential + getDecryptedCredential", () => {
  it("round-trips the original credential data through encryption", async () => {
    await credentialsService.upsertCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${NAME_PREFIX}-hetzner-cloud`,
      { type: "HETZNER_CLOUD", apiToken: "hc-secret-token-value" },
    );

    const decrypted = await credentialsService.getDecryptedCredential(
      workspaceId,
      "HETZNER_CLOUD",
    );

    expect(decrypted).toEqual({
      type: "HETZNER_CLOUD",
      apiToken: "hc-secret-token-value",
    });
  });

  it("round-trips multi-field GoDaddy credentials", async () => {
    await credentialsService.upsertCredential(
      workspaceId,
      "GODADDY_DNS",
      `${NAME_PREFIX}-godaddy`,
      { type: "GODADDY_DNS", apiKey: "gd-key-value", apiSecret: "gd-secret-value" },
    );

    const decrypted = await credentialsService.getDecryptedCredential(
      workspaceId,
      "GODADDY_DNS",
    );

    expect(decrypted).toEqual({
      type: "GODADDY_DNS",
      apiKey: "gd-key-value",
      apiSecret: "gd-secret-value",
    });
  });
});

describe("upsertCredential same provider twice", () => {
  it("updates the existing credential instead of creating a duplicate", async () => {
    const first = await credentialsService.upsertCredential(
      workspaceId,
      "HETZNER_DNS",
      `${NAME_PREFIX}-hetzner-dns-v1`,
      { type: "HETZNER_DNS", apiToken: "hd-token-v1" },
    );

    const second = await credentialsService.upsertCredential(
      workspaceId,
      "HETZNER_DNS",
      `${NAME_PREFIX}-hetzner-dns-v2`,
      { type: "HETZNER_DNS", apiToken: "hd-token-v2" },
    );

    expect(second.id).toBe(first.id);
    expect(second.label).toBe(`${NAME_PREFIX}-hetzner-dns-v2`);

    const stored = await db.providerCredential.findMany({
      where: { workspaceId, provider: "HETZNER_DNS" },
    });
    expect(stored).toHaveLength(1);

    const decrypted = await credentialsService.getDecryptedCredential(
      workspaceId,
      "HETZNER_DNS",
    );
    expect(decrypted).toEqual({ type: "HETZNER_DNS", apiToken: "hd-token-v2" });
  });
});

describe("deleteCredential", () => {
  it("removes the credential", async () => {
    await credentialsService.upsertCredential(
      workspaceId,
      "CLOUDFLARE_DNS",
      `${NAME_PREFIX}-cf-delete`,
      { type: "CLOUDFLARE_DNS", apiToken: "cf-delete-token" },
    );

    await credentialsService.deleteCredential(workspaceId, "CLOUDFLARE_DNS");

    const decrypted = await credentialsService.getDecryptedCredential(
      workspaceId,
      "CLOUDFLARE_DNS",
    );
    expect(decrypted).toBeNull();
  });

  it("throws CredentialNotFoundError when the credential does not exist", async () => {
    await expect(
      credentialsService.deleteCredential(workspaceId, "CLOUDFLARE_DNS"),
    ).rejects.toThrow(credentialsService.CredentialNotFoundError);
  });
});

describe("getDecryptedCredential for a non-existent credential", () => {
  it("returns null", async () => {
    const emptyWorkspace = await db.workspace.create({
      data: {
        name: "Empty Workspace",
        slug: `test-empty-${randomUUID()}`,
        updatedAt: new Date(),
      },
    });

    try {
      const decrypted = await credentialsService.getDecryptedCredential(
        emptyWorkspace.id,
        "HETZNER_CLOUD",
      );
      expect(decrypted).toBeNull();
    } finally {
      await db.workspace.delete({ where: { id: emptyWorkspace.id } });
    }
  });
});
