import { vi } from "vitest";

// In-memory stand-in for src/lib/services/provider-snapshots.ts, so the
// service tests can keep exercising listDomains()/listAccounts() end to end
// without a database. Behaviour matches the real module on the parts the
// callers depend on: a credential with no snapshot is fetched synchronously,
// and rows come back in the order the providers were listed.
//
// Credentials are derived from the mocked provider factory rather than from
// ProviderCredential rows — in these tests the mock providers *are* the
// credential set.
export function createSnapshotsMemoryMock(
  listProviders: () => Promise<Array<{ id: string }>>,
) {
  const store = new Map<string, { credentialId: string; payload: unknown }>();

  const key = (credentialId: string, kind: string) => `${credentialId}:${kind}`;

  return {
    __store: store,
    writeSnapshot: vi.fn(
      async (
        _workspaceId: string,
        credentialId: string,
        kind: string,
        payload: unknown,
      ) => {
        store.set(key(credentialId, kind), { credentialId, payload });
      },
    ),
    markStale: vi.fn(async (credentialId: string, kind: string) => {
      store.delete(key(credentialId, kind));
    }),
    // domains.ts reads the previous snapshot to tell a zone that has just
    // started failing from one that was already failing.
    readSnapshots: vi.fn(async (_workspaceId: string, kind: string) =>
      [...store.entries()]
        .filter(([entryKey]) => entryKey.endsWith(`:${kind}`))
        .map(([, row]) => ({
          ...row,
          kind,
          error: null,
          fetchedAt: new Date(),
        })),
    ),
    readCachedListing: vi.fn(
      async (
        workspaceId: string,
        kind: string,
        refresh: (
          workspaceId: string,
          credentialIds: string[],
        ) => Promise<void>,
      ) => {
        const providers = await listProviders();
        const missing = providers
          .filter((provider) => !store.has(key(provider.id, kind)))
          .map((provider) => provider.id);
        if (missing.length > 0) {
          await refresh(workspaceId, missing);
        }
        return providers
          .map((provider) => store.get(key(provider.id, kind)))
          .filter(
            (row): row is { credentialId: string; payload: unknown } =>
              row !== undefined,
          );
      },
    ),
  };
}
