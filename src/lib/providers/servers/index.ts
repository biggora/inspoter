import type { ServerProvider } from "./types";
import { HetznerServerProvider } from "./hetzner";
import { MockServerProvider } from "./mock";

export function getServerProvider(): ServerProvider {
  const token = process.env.HCLOUD_TOKEN || process.env.HETZNER_API_TOKEN;
  if (token) {
    return new HetznerServerProvider(token);
  }
  return new MockServerProvider();
}
