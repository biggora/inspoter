import { afterEach, describe, expect, it, vi } from "vitest";
import { getServerProvidersForWorkspace } from "@/lib/providers/servers";
import { getDnsProvidersForWorkspace } from "@/lib/providers/dns";
import * as credentialsService from "@/lib/services/credentials";

// Provider factories build providers exclusively from workspace
// ProviderCredential records: no env fallback, no mock fallback.

vi.mock("@/lib/services/credentials", () => ({
  getDecryptedCredentials: vi.fn(async () => []),
}));

const getDecryptedCredentials = vi.mocked(
  credentialsService.getDecryptedCredentials,
);

const WORKSPACE_ID = "test-workspace";

afterEach(() => {
  vi.unstubAllEnvs();
  getDecryptedCredentials.mockReset();
  getDecryptedCredentials.mockResolvedValue([]);
});

describe("getServerProvidersForWorkspace()", () => {
  it("returns an empty list without credentials even when env tokens are set", async () => {
    vi.stubEnv("HCLOUD_TOKEN", "env-token");
    vi.stubEnv("HETZNER_API_TOKEN", "env-token");

    const providers = await getServerProvidersForWorkspace(WORKSPACE_ID);
    expect(providers).toEqual([]);
  });

  it("builds one provider per HETZNER_CLOUD credential with the credential id", async () => {
    getDecryptedCredentials.mockResolvedValue([
      {
        id: "cred-1",
        label: "Prod Hetzner",
        type: "HETZNER_CLOUD",
        apiToken: "secret",
      },
    ]);

    const providers = await getServerProvidersForWorkspace(WORKSPACE_ID);
    expect(providers).toHaveLength(1);
    expect(providers[0].id).toBe("cred-1");
    expect(providers[0].label).toBe("Prod Hetzner");
  });
});

describe("getDnsProvidersForWorkspace()", () => {
  it("returns an empty list without credentials even when env tokens are set", async () => {
    vi.stubEnv("CLOUDFLARE_API_TOKEN", "env-token");
    vi.stubEnv("HETZNER_DNS_TOKEN", "env-token");
    vi.stubEnv("GODADDY_API_KEY", "env-key");
    vi.stubEnv("GODADDY_API_SECRET", "env-secret");

    const providers = await getDnsProvidersForWorkspace(WORKSPACE_ID);
    expect(providers).toEqual([]);
  });

  it("builds providers only from credentials with credential ids", async () => {
    getDecryptedCredentials.mockResolvedValue([
      {
        id: "cred-cf",
        label: "Cloudflare Main",
        type: "CLOUDFLARE_DNS",
        apiToken: "secret",
      },
      {
        id: "cred-gd",
        label: "GoDaddy Main",
        type: "GODADDY_DNS",
        apiKey: "key",
        apiSecret: "secret",
      },
    ]);

    const providers = await getDnsProvidersForWorkspace(WORKSPACE_ID);
    expect(providers.map((p) => p.id)).toEqual(["cred-cf", "cred-gd"]);
  });
});
