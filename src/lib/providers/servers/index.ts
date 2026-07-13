import type { ServerProvider } from "./types";
import { HetznerServerProvider } from "./hetzner";
import { MockServerProvider } from "./mock";

export function getServerProvider(): ServerProvider {
  if (process.env.HCLOUD_TOKEN) {
    return new HetznerServerProvider();
  }
  return new MockServerProvider();
}
