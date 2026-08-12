import { db } from "@/lib/db";
import type { KanbanLinkType } from "@/generated/prisma/client";
import * as alertsService from "@/lib/services/alerts";
import * as hostingService from "@/lib/services/hosting";

// Option lists for the card dialog's "linked record" picker. Loaded on demand
// (GET /api/kanban/link-targets) rather than with the board: the hosting list
// reads a provider snapshot that can trigger a refresh fan-out, which must not
// sit on the critical path of rendering a board.
//
// Everything here is ids plus a display name — this is a picker, not a data
// source. What gets persisted on the card is the id and a snapshot of the name
// (see the KanbanLinkType comment in prisma/schema.prisma).

export interface KanbanLinkOption {
  id: string;
  name: string;
}

export type KanbanLinkTargets = Record<KanbanLinkType, KanbanLinkOption[]>;

// Cap on the alert list: alerts are unbounded and mostly historical, so the
// picker offers the most recent ones rather than every row ever recorded.
const ALERT_OPTION_LIMIT = 50;

export async function listLinkTargets(
  workspaceId: string,
): Promise<KanbanLinkTargets> {
  const [servers, services, domains, alerts, hosting] = await Promise.all([
    db.localServer.findMany({
      where: { workspaceId },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
    db.service.findMany({
      where: { workspaceId },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    }),
    // Domains have no local table of their own; the workspace's claimed
    // provider bindings are the authoritative local list.
    db.providerResourceBinding.findMany({
      where: { workspaceId, resourceType: "DOMAIN" },
      select: { id: true, displayName: true },
      orderBy: [{ displayName: "asc" }, { id: "asc" }],
    }),
    alertsService.list(workspaceId, { pageSize: ALERT_OPTION_LIMIT }),
    listHostingAccounts(workspaceId),
  ]);

  return {
    SERVER: servers.map((server) => ({
      id: server.id,
      name: server.displayName,
    })),
    SERVICE: services.map((service) => ({
      id: service.id,
      name: service.name,
    })),
    DOMAIN: domains.map((domain) => ({
      id: domain.id,
      name: domain.displayName,
    })),
    ALERT: alerts.items.map((alert) => ({
      id: alert.id,
      name: alert.message,
    })),
    HOSTING_ACCOUNT: hosting,
  };
}

// A hosting provider that is down must not take the whole picker with it — the
// section already renders per-provider errors, and a task link is not worth a
// failed request.
async function listHostingAccounts(
  workspaceId: string,
): Promise<KanbanLinkOption[]> {
  try {
    const groups = await hostingService.listAccounts(workspaceId);
    return groups.flatMap((group) =>
      group.accounts.map((account) => ({
        id: account.id,
        name: `${group.label} / ${account.domain}`,
      })),
    );
  } catch (error) {
    console.error("[kanban] hosting link targets unavailable:", error);
    return [];
  }
}
