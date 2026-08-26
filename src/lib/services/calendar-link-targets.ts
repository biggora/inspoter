import { db } from "@/lib/db";
import { listLinkTargets as listInfrastructureTargets } from "@/lib/services/kanban-link-targets";
import type { CalendarLinkInput } from "@/lib/calendar/types";

export interface CalendarLinkTargetOption {
  type: string;
  id: string;
  label: string;
  href: string;
  context?: Record<string, string>;
}

export interface CalendarLinkTargetPage {
  items: CalendarLinkTargetOption[];
  nextCursor: string | null;
}

const LIMIT_PER_TYPE = 15;

export class CalendarLinkTargetNotFoundError extends Error {
  code = "CALENDAR_LINK_TARGET_NOT_FOUND" as const;

  constructor(targetType: string, targetId: string) {
    super(`Calendar link target not found: ${targetType}:${targetId}`);
    this.name = "CalendarLinkTargetNotFoundError";
  }
}

export async function assertCalendarLinkTargets(
  workspaceId: string,
  links: CalendarLinkInput[],
): Promise<void> {
  let infrastructurePromise: ReturnType<
    typeof listInfrastructureTargets
  > | null = null;
  const infrastructure = () =>
    (infrastructurePromise ??= listInfrastructureTargets(workspaceId));

  await Promise.all(
    links.map(async (link) => {
      if (link.targetType === "EXTERNAL_URL") return;
      let exists = false;
      switch (link.targetType) {
        case "DASHBOARD":
          exists = Boolean(
            await db.dashboard.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "BOOKMARK":
          exists = Boolean(
            await db.bookmark.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "KANBAN_BOARD":
          exists = Boolean(
            await db.kanbanBoard.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "KANBAN_CARD":
          exists = Boolean(
            await db.kanbanCard.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "NOTE":
          exists = Boolean(
            await db.note.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "AGENT":
          exists = Boolean(
            await db.agent.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "AGENT_RUN":
          exists = Boolean(
            await db.agentRun.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "AGENT_CONVERSATION":
          exists = Boolean(
            await db.agentConversation.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "SERVICE":
          exists = Boolean(
            await db.service.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "MAIL_ITEM":
          exists = Boolean(
            await db.mailItem.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "MAIL_TEMPLATE":
          exists = Boolean(
            await db.mailTemplate.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "CONTACT":
          exists = Boolean(
            await db.contact.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "MESSAGE_CHANNEL":
          exists = Boolean(
            await db.channel.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "MESSAGE":
          exists = Boolean(
            await db.message.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "ACTIVITY":
          exists = Boolean(
            await db.activity.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "LOG":
          exists = Boolean(
            await db.logEntry.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "ALERT":
          exists = Boolean(
            await db.alert.findFirst({
              where: { id: link.targetId, workspaceId },
              select: { id: true },
            }),
          );
          break;
        case "DOMAIN":
        case "SERVER":
        case "HOSTING_ACCOUNT": {
          const targets = await infrastructure();
          exists = targets[link.targetType].some(
            (target) => target.id === link.targetId,
          );
          break;
        }
      }
      if (!exists) {
        throw new CalendarLinkTargetNotFoundError(
          link.targetType,
          link.targetId,
        );
      }
    }),
  );
}

export async function searchCalendarLinkTargets(
  workspaceId: string,
  query: string,
  pagination: { cursor?: string | null; limit?: number } = {},
): Promise<CalendarLinkTargetPage> {
  const contains = query.trim();
  const textFilter = contains
    ? { contains, mode: "insensitive" as const }
    : undefined;
  const [
    dashboards,
    bookmarks,
    boards,
    cards,
    notes,
    agents,
    runs,
    conversations,
    services,
    mail,
    templates,
    contacts,
    channels,
    messages,
    activities,
    logs,
    alerts,
    infrastructure,
  ] = await Promise.all([
    db.dashboard.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.bookmark.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.kanbanBoard.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.kanbanCard.findMany({
      where: { workspaceId, ...(textFilter ? { title: textFilter } : {}) },
      select: { id: true, title: true, boardId: true },
      take: LIMIT_PER_TYPE,
    }),
    db.note.findMany({
      where: { workspaceId, ...(textFilter ? { title: textFilter } : {}) },
      select: { id: true, title: true },
      take: LIMIT_PER_TYPE,
    }),
    db.agent.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.agentRun.findMany({
      where: {
        workspaceId,
        ...(textFilter ? { snapshotAgentName: textFilter } : {}),
      },
      select: { id: true, snapshotAgentName: true, status: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.agentConversation.findMany({
      where: { workspaceId, ...(textFilter ? { title: textFilter } : {}) },
      select: { id: true, title: true },
      orderBy: { lastMessageAt: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.service.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.mailItem.findMany({
      where: { workspaceId, ...(textFilter ? { subject: textFilter } : {}) },
      select: { id: true, subject: true, accountId: true },
      orderBy: { receivedAt: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.mailTemplate.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.contact.findMany({
      where: {
        workspaceId,
        ...(textFilter ? { displayName: textFilter } : {}),
      },
      select: { id: true, displayName: true },
      take: LIMIT_PER_TYPE,
    }),
    db.channel.findMany({
      where: { workspaceId, ...(textFilter ? { name: textFilter } : {}) },
      select: { id: true, name: true },
      take: LIMIT_PER_TYPE,
    }),
    db.message.findMany({
      where: { workspaceId, ...(textFilter ? { content: textFilter } : {}) },
      select: { id: true, content: true, channelId: true },
      orderBy: { createdAt: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.activity.findMany({
      where: {
        workspaceId,
        ...(textFilter ? { entityLabel: textFilter } : {}),
      },
      select: { id: true, entityLabel: true, action: true },
      orderBy: { timestamp: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.logEntry.findMany({
      where: { workspaceId, ...(textFilter ? { message: textFilter } : {}) },
      select: { id: true, message: true },
      orderBy: { timestamp: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    db.alert.findMany({
      where: { workspaceId, ...(textFilter ? { message: textFilter } : {}) },
      select: { id: true, message: true },
      orderBy: { timestamp: "desc" },
      take: LIMIT_PER_TYPE,
    }),
    listInfrastructureTargets(workspaceId),
  ]);

  const options: CalendarLinkTargetOption[] = [
    ...dashboards.map((row) =>
      option("DASHBOARD", row.id, row.name, `/dashboards/${row.id}`),
    ),
    ...bookmarks.map((row) =>
      option("BOOKMARK", row.id, row.name, `/bookmarks?bookmark=${row.id}`),
    ),
    ...boards.map((row) =>
      option("KANBAN_BOARD", row.id, row.name, `/kanban/${row.id}`),
    ),
    ...cards.map((row) =>
      option(
        "KANBAN_CARD",
        row.id,
        row.title,
        `/kanban/${row.boardId}?card=${row.id}`,
      ),
    ),
    ...notes.map((row) =>
      option("NOTE", row.id, row.title, `/notes/${row.id}`),
    ),
    ...agents.map((row) =>
      option("AGENT", row.id, row.name, `/agents/${row.id}`),
    ),
    ...runs.map((row) =>
      option(
        "AGENT_RUN",
        row.id,
        `${row.snapshotAgentName} · ${row.status}`,
        `/agents/runs/${row.id}`,
      ),
    ),
    ...conversations.map((row) =>
      option(
        "AGENT_CONVERSATION",
        row.id,
        row.title,
        `/agents/chats/${row.id}`,
      ),
    ),
    ...services.map((row) =>
      option("SERVICE", row.id, row.name, `/services/${row.id}`),
    ),
    ...mail.map((row) =>
      option(
        "MAIL_ITEM",
        row.id,
        row.subject || "(no subject)",
        `/mail?account=${row.accountId}&message=${row.id}`,
      ),
    ),
    ...templates.map((row) =>
      option(
        "MAIL_TEMPLATE",
        row.id,
        row.name,
        `/mail/templates?template=${row.id}`,
      ),
    ),
    ...contacts.map((row) =>
      option("CONTACT", row.id, row.displayName, `/contacts/${row.id}`),
    ),
    ...channels.map((row) =>
      option(
        "MESSAGE_CHANNEL",
        row.id,
        row.name,
        `/messages?channel=${row.id}`,
      ),
    ),
    ...messages.map((row) =>
      option(
        "MESSAGE",
        row.id,
        row.content.slice(0, 120),
        `/messages?channel=${row.channelId}&message=${row.id}`,
      ),
    ),
    ...activities.map((row) =>
      option(
        "ACTIVITY",
        row.id,
        row.entityLabel || row.action,
        `/activity?activity=${row.id}`,
      ),
    ),
    ...logs.map((row) =>
      option("LOG", row.id, row.message, `/logs?log=${row.id}`),
    ),
    ...alerts.map((row) =>
      option("ALERT", row.id, row.message, `/alerts?alert=${row.id}`),
    ),
    ...infrastructure.SERVER.map((row) =>
      option("SERVER", row.id, row.name, `/servers/${row.id}`),
    ),
    ...infrastructure.DOMAIN.map((row) =>
      option("DOMAIN", row.id, row.name, `/domains?resource=${row.id}`),
    ),
    ...infrastructure.HOSTING_ACCOUNT.map((row) =>
      option("HOSTING_ACCOUNT", row.id, row.name, `/hosting?account=${row.id}`),
    ),
  ];
  const filtered = contains
    ? options.filter((item) =>
        item.label.toLocaleLowerCase().includes(contains.toLocaleLowerCase()),
      )
    : options;
  const offset = Math.max(
    0,
    Number.parseInt(pagination.cursor ?? "0", 10) || 0,
  );
  const limit = Math.min(100, Math.max(1, pagination.limit ?? 30));
  const items = filtered.slice(offset, offset + limit);
  return {
    items,
    nextCursor:
      offset + limit < filtered.length ? String(offset + limit) : null,
  };
}

function option(
  type: string,
  id: string,
  label: string,
  href: string,
): CalendarLinkTargetOption {
  return { type, id, label, href };
}
