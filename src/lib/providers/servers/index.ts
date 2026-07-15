import type { ServerProvider } from "./types";
import { HetznerServerProvider } from "./hetzner";
import { MockServerProvider } from "./mock";
import * as credentialsService from "@/lib/services/credentials";

export async function getServerProviderForWorkspace(
  workspaceId: string,
): Promise<ServerProvider> {
  let token = process.env.HCLOUD_TOKEN || process.env.HETZNER_API_TOKEN;
  const cred = await credentialsService.getDecryptedCredential(
    workspaceId,
    "HETZNER_CLOUD",
  );
  if (cred && cred.type === "HETZNER_CLOUD") token = cred.apiToken;

  return token ? new HetznerServerProvider(token) : new MockServerProvider();
}
