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
      {
        type: "GODADDY_DNS",
        apiKey: "gd-key-value",
        apiSecret: "gd-secret-value",
      },
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

describe("deleteCredential with linked local servers", () => {
  async function createLinkedServer(
    credentialId: string,
    displayName: string,
    providerRemoteId: string,
  ) {
    return db.localServer.create({
      data: {
        workspaceId,
        origin: "PROVIDER",
        displayName,
        providerCredentialId: credentialId,
        providerCredentialWorkspaceId: workspaceId,
        providerRemoteId,
        providerLastSeenAt: new Date(),
      },
    });
  }

  async function createAddress(
    localServerId: string,
    address: string,
    source: "AGENT" | "PROVIDER",
    overrides: { isEnrollmentClaim?: boolean; matchKey?: string | null } = {},
  ) {
    return db.localServerAddress.create({
      data: {
        workspaceId,
        localServerId,
        address,
        family: "IPV4",
        scope: "GLOBAL",
        source,
        isCurrent: true,
        isEnrollmentClaim: overrides.isEnrollmentClaim ?? false,
        matchKey: overrides.matchKey ?? null,
      },
    });
  }

  async function createSnapshot(localServerId: string, hostname: string) {
    return db.serverMetricSnapshot.create({
      data: {
        localServerId,
        workspaceId,
        schemaVersion: 1,
        agentVersion: "1.0.0",
        hostname,
        capturedAt: new Date(),
        cpuUsagePercent: 10,
        load1: 0.1,
        load5: 0.2,
        load15: 0.3,
        memoryTotalBytes: BigInt(1000),
        memoryAvailableBytes: BigInt(500),
        swapTotalBytes: BigInt(0),
        swapFreeBytes: BigInt(0),
        filesystemTotalBytes: BigInt(2000),
        filesystemAvailableBytes: BigInt(1000),
        uptimeSeconds: BigInt(3600),
      },
    });
  }

  it("detaches a server with an active metrics agent to AGENT origin and converts its agent address into an enrollment claim", async () => {
    const agentIp = "203.0.113.10";
    const credential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${NAME_PREFIX}-detach`,
      { type: "HETZNER_CLOUD", apiToken: "hc-detach-token" },
    );
    const server = await createLinkedServer(
      credential.id,
      "detach-server",
      "remote-detach",
    );
    const agentAddress = await createAddress(server.id, agentIp, "AGENT");
    const providerAddress = await createAddress(server.id, agentIp, "PROVIDER");
    await createSnapshot(server.id, "detach-host");

    await credentialsService.deleteCredential(credential.id, workspaceId);

    expect(
      await db.providerCredential.findUnique({ where: { id: credential.id } }),
    ).toBeNull();

    const detached = await db.localServer.findUniqueOrThrow({
      where: { id: server.id },
    });
    expect(detached).toMatchObject({
      origin: "AGENT",
      providerCredentialId: null,
      providerCredentialWorkspaceId: null,
      providerRemoteId: null,
      providerLastSeenAt: null,
      providerMissingAt: null,
    });

    const claim = await db.localServerAddress.findUniqueOrThrow({
      where: { id: agentAddress.id },
    });
    expect(claim).toMatchObject({
      isCurrent: true,
      isEnrollmentClaim: true,
      matchKey: agentIp,
    });

    const retired = await db.localServerAddress.findUniqueOrThrow({
      where: { id: providerAddress.id },
    });
    expect(retired).toMatchObject({
      isCurrent: false,
      isEnrollmentClaim: false,
      matchKey: null,
    });
    expect(retired.retiredAt).not.toBeNull();

    expect(
      await db.serverMetricSnapshot.findUnique({
        where: { localServerId: server.id },
      }),
    ).not.toBeNull();
  });

  it("deletes linked servers without an active metrics agent along with the credential", async () => {
    const credential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${NAME_PREFIX}-cascade`,
      { type: "HETZNER_CLOUD", apiToken: "hc-cascade-token" },
    );
    const server = await createLinkedServer(
      credential.id,
      "cascade-server",
      "remote-cascade",
    );
    await createAddress(server.id, "203.0.113.20", "PROVIDER");

    await credentialsService.deleteCredential(credential.id, workspaceId);

    expect(
      await db.providerCredential.findUnique({ where: { id: credential.id } }),
    ).toBeNull();
    expect(
      await db.localServer.findUnique({ where: { id: server.id } }),
    ).toBeNull();
    expect(
      await db.localServerAddress.count({
        where: { workspaceId, localServerId: server.id },
      }),
    ).toBe(0);
  });

  it("throws CredentialDeleteConflictError when another server claims the agent address, leaving no partial writes", async () => {
    const conflictIp = "203.0.113.30";
    const cleanIp = "203.0.113.31";
    const credential = await credentialsService.createCredential(
      workspaceId,
      "HETZNER_CLOUD",
      `${NAME_PREFIX}-conflict`,
      { type: "HETZNER_CLOUD", apiToken: "hc-conflict-token" },
    );
    const server = await createLinkedServer(
      credential.id,
      "conflict-server",
      "remote-conflict",
    );
    const cleanAddress = await createAddress(server.id, cleanIp, "AGENT");
    const conflictAddress = await createAddress(server.id, conflictIp, "AGENT");
    const providerAddress = await createAddress(
      server.id,
      conflictIp,
      "PROVIDER",
    );
    await createSnapshot(server.id, "conflict-host");

    const rival = await db.localServer.create({
      data: { workspaceId, origin: "AGENT", displayName: "rival-server" },
    });
    await createAddress(rival.id, conflictIp, "AGENT", {
      isEnrollmentClaim: true,
      matchKey: conflictIp,
    });

    await expect(
      credentialsService.deleteCredential(credential.id, workspaceId),
    ).rejects.toThrow(credentialsService.CredentialDeleteConflictError);

    // Transaction rollback: credential, server link, and all addresses untouched.
    expect(
      await db.providerCredential.findUnique({ where: { id: credential.id } }),
    ).not.toBeNull();

    const untouchedServer = await db.localServer.findUniqueOrThrow({
      where: { id: server.id },
    });
    expect(untouchedServer).toMatchObject({
      origin: "PROVIDER",
      providerCredentialId: credential.id,
      providerRemoteId: "remote-conflict",
    });

    for (const addressId of [cleanAddress.id, conflictAddress.id]) {
      const address = await db.localServerAddress.findUniqueOrThrow({
        where: { id: addressId },
      });
      expect(address).toMatchObject({
        isCurrent: true,
        isEnrollmentClaim: false,
        matchKey: null,
      });
    }

    const provider = await db.localServerAddress.findUniqueOrThrow({
      where: { id: providerAddress.id },
    });
    expect(provider).toMatchObject({ isCurrent: true, retiredAt: null });
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

describe("createCredential + updateCredential with allowInsecure", () => {
  it("persists and updates the allowInsecure flag for cPanel credentials", async () => {
    const created = await credentialsService.createCredential(
      workspaceId,
      "CPANEL_WHM",
      `${NAME_PREFIX}-cpanel-whm-insecure`,
      {
        type: "CPANEL_WHM",
        hostname: "srv.example.com",
        username: "root",
        apiToken: "cpanel-token-value",
        allowInsecure: true,
      },
    );

    expect(created.allowInsecure).toBe(true);

    const list = await credentialsService.listCredentials(workspaceId);
    const found = list.find((c) => c.id === created.id);
    expect(found).toBeTruthy();
    expect(found?.allowInsecure).toBe(true);

    const updated = await credentialsService.updateCredential(
      created.id,
      workspaceId,
      `${NAME_PREFIX}-cpanel-whm-insecure-v2`,
      {
        type: "CPANEL_WHM",
        hostname: "srv.example.com",
        username: "root",
        apiToken: "cpanel-token-value-2",
        allowInsecure: false,
      },
    );

    expect(updated.allowInsecure).toBe(false);
  });
});
