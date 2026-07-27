import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  isSectionAutoRefreshEnabled,
  listCredentialsForKind,
  listDueCredentials,
  markStale,
  readCachedListing,
  readSnapshots,
  writeSnapshot,
} from "@/lib/services/provider-snapshots";
import { recordSyncOutcomes } from "@/lib/services/provider-health";

// Provider listing cache (ADR-004 amendment). Covers the parts that only a
// real database can show: read-through behaviour, cascade on credential
// delete, the scheduler's due-scan, and the log de-duplication that keeps a
// down provider from filling the Logs section.

let workspaceId: string;
let credentialId: string;

async function createCredential(
  provider: "CLOUDFLARE_DNS" | "HETZNER_CLOUD",
  autoRefreshEnabled = true,
): Promise<string> {
  const credential = await db.providerCredential.create({
    data: {
      workspaceId,
      provider,
      label: `test-${randomUUID()}`,
      encryptedData: "x",
      iv: "x",
      authTag: "x",
      maskedHint: "****",
      autoRefreshEnabled,
    },
  });
  return credential.id;
}

beforeAll(async () => {
  const workspace = await db.workspace.create({
    data: {
      name: "Snapshot Test Workspace",
      slug: `snapshots-${randomUUID()}`,
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

beforeEach(async () => {
  await db.logEntry.deleteMany({ where: { workspaceId } });
  await db.alert.deleteMany({ where: { workspaceId } });
  await db.providerCredential.deleteMany({ where: { workspaceId } });
  await db.workspace.update({
    where: { id: workspaceId },
    data: { autoRefreshDisabledKinds: [] },
  });
  credentialId = await createCredential("CLOUDFLARE_DNS");
});

describe("readCachedListing()", () => {
  it("fetches and persists when no snapshot exists yet", async () => {
    let calls = 0;
    const rows = await readCachedListing(
      workspaceId,
      "DNS_ZONES",
      async (ws, ids) => {
        calls += 1;
        for (const id of ids) {
          await writeSnapshot(ws, id, "DNS_ZONES", { providerId: id }, null);
        }
      },
    );

    expect(calls).toBe(1);
    expect(rows).toHaveLength(1);
    expect(rows[0].credentialId).toBe(credentialId);
    expect(await readSnapshots(workspaceId, "DNS_ZONES")).toHaveLength(1);
  });

  it("serves a fresh snapshot without touching the provider", async () => {
    await writeSnapshot(
      workspaceId,
      credentialId,
      "DNS_ZONES",
      { providerId: credentialId, domains: [] },
      null,
    );

    let calls = 0;
    const rows = await readCachedListing(workspaceId, "DNS_ZONES", async () => {
      calls += 1;
    });

    expect(calls).toBe(0);
    expect(rows).toHaveLength(1);
  });

  it("returns nothing and never fetches when the workspace has no credentials", async () => {
    await db.providerCredential.deleteMany({ where: { workspaceId } });

    let calls = 0;
    const rows = await readCachedListing(workspaceId, "DNS_ZONES", async () => {
      calls += 1;
    });

    expect(rows).toEqual([]);
    expect(calls).toBe(0);
  });

  it("refetches after markStale, which is what a mutation relies on", async () => {
    await writeSnapshot(
      workspaceId,
      credentialId,
      "DNS_ZONES",
      { providerId: credentialId, generation: 1 },
      null,
    );
    await markStale(credentialId, "DNS_ZONES");

    const rows = await readCachedListing(
      workspaceId,
      "DNS_ZONES",
      async (ws, ids) => {
        for (const id of ids) {
          await writeSnapshot(
            ws,
            id,
            "DNS_ZONES",
            { providerId: id, generation: 2 },
            null,
          );
        }
      },
    );

    // Stale rows are served immediately and refreshed behind the render, so
    // this read still returns generation 1 — the refresh lands afterwards.
    expect(rows).toHaveLength(1);
    await expect
      .poll(async () => {
        const [row] = await readSnapshots(workspaceId, "DNS_ZONES");
        return (row?.payload as { generation: number }).generation;
      })
      .toBe(2);
  });
});

describe("snapshot lifecycle", () => {
  it("is removed with its credential, so a deleted account leaves no cache behind", async () => {
    await writeSnapshot(workspaceId, credentialId, "DNS_ZONES", {}, null);
    await db.providerCredential.delete({ where: { id: credentialId } });

    expect(await readSnapshots(workspaceId, "DNS_ZONES")).toHaveLength(0);
  });

  it("scopes credentials to the section they feed", async () => {
    const serverCredentialId = await createCredential("HETZNER_CLOUD");

    const dns = await listCredentialsForKind(workspaceId, "DNS_ZONES");
    const servers = await listCredentialsForKind(workspaceId, "SERVERS");

    expect(dns.map((c) => c.id)).toEqual([credentialId]);
    expect(servers.map((c) => c.id)).toEqual([serverCredentialId]);
  });
});

describe("listDueCredentials()", () => {
  it("treats a credential with no snapshot as due", async () => {
    const due = await listDueCredentials("DNS_ZONES");
    expect(due.map((entry) => entry.credentialId)).toContain(credentialId);
  });

  it("skips a credential whose snapshot is still within the TTL", async () => {
    await writeSnapshot(workspaceId, credentialId, "DNS_ZONES", {}, null);

    const due = await listDueCredentials("DNS_ZONES");
    expect(due.map((entry) => entry.credentialId)).not.toContain(credentialId);
  });

  it("skips a credential with automatic refresh switched off", async () => {
    await db.providerCredential.update({
      where: { id: credentialId },
      data: { autoRefreshEnabled: false },
    });

    const due = await listDueCredentials("DNS_ZONES");
    expect(due.map((entry) => entry.credentialId)).not.toContain(credentialId);
  });

  it("skips every credential of a section the workspace switched off", async () => {
    await db.workspace.update({
      where: { id: workspaceId },
      data: { autoRefreshDisabledKinds: ["DNS_ZONES"] },
    });

    const due = await listDueCredentials("DNS_ZONES");
    expect(due.map((entry) => entry.credentialId)).not.toContain(credentialId);
    expect(await isSectionAutoRefreshEnabled(workspaceId, "DNS_ZONES")).toBe(
      false,
    );
    // Other sections are unaffected.
    expect(await isSectionAutoRefreshEnabled(workspaceId, "SERVERS")).toBe(
      true,
    );
  });
});

describe("recordSyncOutcomes() log de-duplication", () => {
  async function providerLogs() {
    return db.logEntry.findMany({
      where: { workspaceId, source: "provider:cloudflare" },
      orderBy: { timestamp: "asc" },
    });
  }

  it("writes one error entry per outage, not one per refresh", async () => {
    // The scheduler polls on a timer, so an unreachable provider is seen again
    // every tick. Without the transition gate that would be ~288 identical
    // entries a day per credential.
    for (let i = 0; i < 3; i += 1) {
      await recordSyncOutcomes(workspaceId, "DNS", "listDomains", [
        {
          credentialId,
          providerType: "cloudflare",
          error: "Provider unreachable",
        },
      ]);
    }

    await expect.poll(async () => (await providerLogs()).length).toBe(1);
    const [entry] = await providerLogs();
    expect(entry.level).toBe("error");
    expect(entry.message).toBe("Provider unreachable");
  });

  it("writes one info entry when the provider comes back", async () => {
    await recordSyncOutcomes(workspaceId, "DNS", "listDomains", [
      {
        credentialId,
        providerType: "cloudflare",
        error: "Provider unreachable",
      },
    ]);
    await expect.poll(async () => (await providerLogs()).length).toBe(1);

    await recordSyncOutcomes(workspaceId, "DNS", "listDomains", [
      { credentialId, providerType: "cloudflare", error: null },
    ]);
    await recordSyncOutcomes(workspaceId, "DNS", "listDomains", [
      { credentialId, providerType: "cloudflare", error: null },
    ]);

    await expect.poll(async () => (await providerLogs()).length).toBe(2);
    const entries = await providerLogs();
    expect(entries.map((entry) => entry.level)).toEqual(["error", "info"]);
  });

  it("stays silent while a healthy provider keeps succeeding", async () => {
    for (let i = 0; i < 3; i += 1) {
      await recordSyncOutcomes(workspaceId, "DNS", "listDomains", [
        { credentialId, providerType: "cloudflare", error: null },
      ]);
    }

    expect(await providerLogs()).toHaveLength(0);
  });
});
