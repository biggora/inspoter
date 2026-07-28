import { headers } from "next/headers";
import { requireAuth } from "@/lib/auth/dal";
import { WebhookTokensView } from "@/components/settings/webhook-tokens-view";

export const dynamic = "force-dynamic";

// The MCP endpoint URL an operator copies into a client config has to be the
// absolute one, so it is resolved from the request here rather than from
// window.location in the client component: behind a reverse proxy the browser
// origin and the forwarded one can differ, and rendering it on the server
// avoids a post-hydration swap.
async function resolveOrigin(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host) return "";
  const proto =
    headerList.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.0.0.1")
      ? "http"
      : "https");
  return `${proto}://${host}`;
}

export default async function WebhookTokensPage() {
  await requireAuth();
  return <WebhookTokensView origin={await resolveOrigin()} />;
}
