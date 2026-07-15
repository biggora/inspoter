import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as credentialsService from "@/lib/services/credentials";

// Provider credential service (encrypted at rest, workspace-scoped, multiple
// credentials per provider allowed). CREDENTIAL_ENCRYPTION_KEY is not in
// scripts/test-env.mjs's TEST_ENV_KEYS allowlist, so it must be set directly
// here — a fixed 64-char hex test key.
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

describe("createCredential + listCredentials", () => {
  it("persists a credential and returns metadata only (no raw secret)", async () => {
    const summary = await credentialsService.createCredential(
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

describe("createCredential + getDecryptedCredentials", () => {
  it("round-trips the original credential data through encryption", async () => {
    const created = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${NAME_PREFIX}-hetzner-cloud`,
      { type: "HETZNER_CLOUD", apiToken: "hc-secret-token-value" },
    );

    const decrypted = await credentialsService.getDecryptedCredentials(
      workspaceId,
      "HETZNER_CLOUD",
    );

    const found = decrypted.find((c) => c.id === created.id);
    expect(found).toEqual({
      id: created.id,
      label: `${NAME_PREFIX}-hetzner-cloud`,
      type: "HETZNER_CLOUD",
      apiToken: "hc-secret-token-value",
    });
  });

  it("round-trips multi-field GoDaddy credentials", async () => {
    const created = await credentialsService.createCredential(
      workspaceId,
      "GODADDY_DNS",
      `${NAME_PREFIX}-godaddy`,
      { type: "GODADDY_DNS", apiKey: "gd-key-value", apiSecret: "gd-secret-value" },
    );

    const decrypted = await credentialsService.getDecryptedCredentials(
      workspaceId,
      "GODADDY_DNS",
    );

    const found = decrypted.find((c) => c.id === created.id);
    expect(found).toEqual({
      id: created.id,
      label: `${NAME_PREFIX}-godaddy`,
      type: "GODADDY_DNS",
      apiKey: "gd-key-value",
      apiSecret: "gd-secret-value",
    });
  });
});

describe("createCredential same provider twice", () => {
  it("creates two independent credentials instead of upserting", async () => {
    const first = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_DNS",
      `${NAME_PREFIX}-hetzner-dns-v1`,
      { type: "HETZNER_DNS", apiToken: "hd-token-v1" },
    );

    const second = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_DNS",
      `${NAME_PREFIX}-hetzner-dns-v2`,
      { type: "HETZNER_DNS", apiToken: "hd-token-v2" },
    );

    expect(second.id).not.toBe(first.id);

    const stored = await db.providerCredential.findMany({
      where: { id: { in: [first.id, second.id] } },
    });
    expect(stored).toHaveLength(2);

    const decrypted = await credentialsService.getDecryptedCredentials(
      workspaceId,
      "HETZNER_DNS",
    );
    expect(decrypted.find((c) => c.id === first.id)).toMatchObject({
      apiToken: "hd-token-v1",
    });
    expect(decrypted.find((c) => c.id === second.id)).toMatchObject({
      apiToken: "hd-token-v2",
    });
  });
});

describe("updateCredential", () => {
  it("updates label and data of the existing credential without creating a new row", async () => {
    const created = await credentialsService.createCredential(
      workspaceId,
      "CLOUDFLARE_DNS",
      `${NAME_PREFIX}-cf-update-v1`,
      { type: "CLOUDFLARE_DNS", apiToken: "cf-update-token-v1" },
    );

    const updated = await credentialsService.updateCredential(
      created.id,
      workspaceId,
      `${NAME_PREFIX}-cf-update-v2`,
      { type: "CLOUDFLARE_DNS", apiToken: "cf-update-token-v2" },
    );

    expect(updated.id).toBe(created.id);
    expect(updated.label).toBe(`${NAME_PREFIX}-cf-update-v2`);

    const decrypted = await credentialsService.getDecryptedCredentialById(
      created.id,
      workspaceId,
    );
    expect(decrypted).toEqual({
      id: created.id,
      label: `${NAME_PREFIX}-cf-update-v2`,
      type: "CLOUDFLARE_DNS",
      apiToken: "cf-update-token-v2",
    });
  });

  it("throws CredentialNotFoundError when the credential does not exist", async () => {
    await expect(
      credentialsService.updateCredential(
        "nonexistent-id",
        workspaceId,
        "label",
        { type: "CLOUDFLARE_DNS", apiToken: "token" },
      ),
    ).rejects.toThrow(credentialsService.CredentialNotFoundError);
  });
});

describe("deleteCredential", () => {
  it("removes the credential", async () => {
    const created = await credentialsService.createCredential(
      workspaceId,
      "CLOUDFLARE_DNS",
      `${NAME_PREFIX}-cf-delete`,
      { type: "CLOUDFLARE_DNS", apiToken: "cf-delete-token" },
    );

    await credentialsService.deleteCredential(created.id, workspaceId);

    const decrypted = await credentialsService.getDecryptedCredentialById(
      created.id,
      workspaceId,
    );
    expect(decrypted).toBeNull();
  });

  it("throws CredentialNotFoundError when the credential does not exist", async () => {
    await expect(
      credentialsService.deleteCredential("nonexistent-id", workspaceId),
    ).rejects.toThrow(credentialsService.CredentialNotFoundError);
  });
});

describe("getDecryptedCredentials for a workspace with none", () => {
  it("returns an empty array", async () => {
    const emptyWorkspace = await db.workspace.create({
      data: {
        name: "Empty Workspace",
        slug: `test-empty-${randomUUID()}`,
        updatedAt: new Date(),
      },
    });

    try {
      const decrypted = await credentialsService.getDecryptedCredentials(
        emptyWorkspace.id,
        "HETZNER_CLOUD",
      );
      expect(decrypted).toEqual([]);
    } finally {
      await db.workspace.delete({ where: { id: emptyWorkspace.id } });
    }
  });
});

describe("getDecryptedCredentialById for a non-existent credential", () => {
  it("returns null", async () => {
    const decrypted = await credentialsService.getDecryptedCredentialById(
      "nonexistent-id",
      workspaceId,
    );
    expect(decrypted).toBeNull();
  });
});
