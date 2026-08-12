import type { KanbanLinkType } from "@/generated/prisma/client";

// A card's link to an existing record is soft on purpose (see the
// KanbanLinkType comment in prisma/schema.prisma): the card stores the type,
// the target's id and a snapshot of its name. This module is the single place
// that knows how a link type maps onto a section route and an icon, so the
// card chip, the widget and the MCP tools all render a link the same way.

export const KANBAN_LINK_ICONS: Record<KanbanLinkType, string> = {
  SERVER: "ri-server-line",
  DOMAIN: "ri-global-line",
  SERVICE: "ri-pulse-line",
  ALERT: "ri-alert-line",
  HOSTING_ACCOUNT: "ri-cloud-line",
};

// Where clicking the chip takes the operator. Servers and services have
// detail routes; domains, alerts and hosting accounts only have their section
// index, so the chip links there rather than to a page that does not exist.
export function kanbanLinkHref(type: KanbanLinkType, id: string): string {
  switch (type) {
    case "SERVER":
      return `/servers/${id}`;
    case "SERVICE":
      return `/services/${id}`;
    case "DOMAIN":
      return "/domains";
    case "ALERT":
      return "/alerts";
    case "HOSTING_ACCOUNT":
      return "/hosting";
  }
}

/** i18n key inside the "kanban" namespace: linkTypes.<TYPE> */
export function kanbanLinkTypeKey(type: KanbanLinkType): string {
  return `linkTypes.${type}`;
}
