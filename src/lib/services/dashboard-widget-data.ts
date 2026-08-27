import type { DashboardWidget } from "@/generated/prisma/client";
import * as alertsService from "@/lib/services/alerts";
import * as bookmarksService from "@/lib/services/bookmarks";
import * as kanbanService from "@/lib/services/kanban";
import * as logsService from "@/lib/services/logs";
import * as mailService from "@/lib/services/mail";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import * as messagesService from "@/lib/services/messages";
import * as serversService from "@/lib/services/servers";
import * as servicesService from "@/lib/services/services";
import { getMonthEvents } from "@/lib/services/dashboard-calendar";
import { getWeather } from "@/lib/dashboards/weather";
import {
  parseWidgetConfigOrDefaults,
  type MessagesConfig,
} from "@/lib/validation/dashboards";
import type {
  BookmarkTile,
  BookmarksPayload,
  KanbanCardTile,
  KanbanPayload,
  MessagesPayload,
  ServerMetricsPayload,
  ServiceStatusPayload,
  WidgetDataMap,
  WidgetError,
  WidgetPayload,
} from "@/lib/dashboards/widget-payloads";

// Resolves the server-side payload of every widget on a dashboard. Called twice
// for the same data: once by the dashboard page (initial render) and once per
// poll by GET /api/dashboards/:id/data.
//
// The payload shapes live in @/lib/dashboards/widget-payloads — a
// dependency-free module — because the widget components import them too, and a
// client bundle must not reach this file (it imports Prisma through the services
// below).
//
// Failures are per-widget. One unreachable weather provider or one deleted mail
// account turns a single tile into an error card; the rest of the dashboard
// renders. Same isolation rule the provider sections already follow
// (src/lib/services/domains.ts).

export type { WidgetDataMap, WidgetPayload };

/**
 * @param now Reference time for the calendar widget's month. Injected so the
 *   month is decided by the caller (and pinned in tests) rather than read from
 *   the clock deep inside a resolver.
 */
export async function resolveWidgetData(
  workspaceId: string,
  widgets: Pick<DashboardWidget, "id" | "kind" | "config">[],
  now: Date = new Date(),
): Promise<WidgetDataMap> {
  const entries = await Promise.all(
    widgets.map(async (widget) => {
      try {
        return [widget.id, await resolveOne(workspaceId, widget, now)] as const;
      } catch (error) {
        return [
          widget.id,
          {
            error: error instanceof Error ? error.message : "Unknown error",
          } satisfies WidgetError,
        ] as const;
      }
    }),
  );
  return Object.fromEntries(entries);
}

async function resolveOne(
  workspaceId: string,
  widget: Pick<DashboardWidget, "kind" | "config">,
  now: Date,
): Promise<WidgetPayload> {
  switch (widget.kind) {
    case "CLOCK":
      return { kind: "CLOCK" };
    case "NOTE":
      return { kind: "NOTE" };
    case "WEATHER": {
      const config = parseWidgetConfigOrDefaults("WEATHER", widget.config);
      if (!config) return { error: "WEATHER_CONFIG_INVALID" };
      // A widget whose location was cleared has nothing to ask the provider
      // for; the tile renders the "set the coordinates" hint instead.
      const { latitude, longitude } = config;
      if (latitude === null || longitude === null) {
        return { kind: "WEATHER", data: null };
      }
      return {
        kind: "WEATHER",
        data: await getWeather({ ...config, latitude, longitude }),
      };
    }
    case "CALENDAR": {
      const config = parseWidgetConfigOrDefaults("CALENDAR", widget.config);
      if (!config) return { error: "CALENDAR_CONFIG_INVALID" };
      return {
        kind: "CALENDAR",
        data: await getMonthEvents(workspaceId, now, config.sources),
      };
    }
    case "BOOKMARKS": {
      const config = parseWidgetConfigOrDefaults("BOOKMARKS", widget.config);
      if (!config) return { error: "BOOKMARKS_CONFIG_INVALID" };
      return {
        kind: "BOOKMARKS",
        data: await resolveBookmarks(
          workspaceId,
          config.categoryId,
          config.limit,
        ),
      };
    }
    case "KANBAN": {
      const config = parseWidgetConfigOrDefaults("KANBAN", widget.config);
      if (!config) return { error: "KANBAN_CONFIG_INVALID" };
      return {
        kind: "KANBAN",
        data: await resolveKanban(
          workspaceId,
          config.boardId,
          config.columnId,
          config.limit,
        ),
      };
    }
    case "SERVICE_STATUS": {
      const config = parseWidgetConfigOrDefaults(
        "SERVICE_STATUS",
        widget.config,
      );
      if (!config) return { error: "SERVICE_STATUS_CONFIG_INVALID" };
      return {
        kind: "SERVICE_STATUS",
        data: await resolveServiceStatus(
          workspaceId,
          config.serviceIds,
          config.limit,
        ),
      };
    }
    case "SERVER_METRICS": {
      const config = parseWidgetConfigOrDefaults(
        "SERVER_METRICS",
        widget.config,
      );
      if (!config) return { error: "SERVER_METRICS_CONFIG_INVALID" };
      return {
        kind: "SERVER_METRICS",
        data: await resolveServerMetrics(
          workspaceId,
          config.localServerIds,
          config.limit,
        ),
      };
    }
    case "MAIL": {
      const config = parseWidgetConfigOrDefaults("MAIL", widget.config);
      if (!config) return { error: "MAIL_CONFIG_INVALID" };
      // The mailbox each message landed in is what the tile marks its rows
      // with, so the accounts are read alongside the messages.
      const [items, accounts] = await Promise.all([
        listDistinctMailItems(
          workspaceId,
          {
            sort: "desc",
            ...(config.accountId ? { accountId: config.accountId } : {}),
            ...(config.unreadOnly ? { unreadOnly: true } : {}),
          },
          config.limit,
        ),
        mailAccountsService.listAccountIdentities(workspaceId),
      ]);
      const accountsById = new Map(
        accounts.map((account) => [account.id, account]),
      );
      return {
        kind: "MAIL",
        data: {
          items: items.map((item) => {
            const account = accountsById.get(item.accountId);
            return {
              id: item.id,
              from: item.fromAddress,
              fromName: item.fromName,
              subject: item.subject,
              isRead: item.isRead,
              receivedAt: item.receivedAt.toISOString(),
              accountId: item.accountId,
              accountName: account?.name ?? "",
              accountEmail: account?.email ?? "",
            };
          }),
        },
      };
    }
    case "MESSAGES": {
      const config = parseWidgetConfigOrDefaults("MESSAGES", widget.config);
      if (!config) return { error: "MESSAGES_CONFIG_INVALID" };
      return {
        kind: "MESSAGES",
        data: await resolveMessages(workspaceId, config),
      };
    }
    case "ALERTS": {
      const config = parseWidgetConfigOrDefaults("ALERTS", widget.config);
      if (!config) return { error: "ALERTS_CONFIG_INVALID" };
      // alerts.list filters by a single severity; the widget allows a set, so a
      // multi-severity selection is filtered after the fact. Over-fetching by
      // the number of selected severities keeps the tile full.
      const result = await alertsService.list(workspaceId, {
        pageSize: overFetchFor(config.limit, config.severities.length),
        sort: "desc",
        ...(config.severities.length === 1
          ? { severity: config.severities[0] }
          : {}),
      });
      const items = filterBySelection(
        result.items,
        config.severities,
        (item) => item.severity,
      );
      return {
        kind: "ALERTS",
        data: {
          items: items.slice(0, config.limit).map((item) => ({
            id: item.id,
            severity: item.severity,
            source: item.source,
            message: item.message,
            messageKey: item.messageKey,
            messageParams: item.messageParams as Record<
              string,
              string | number
            > | null,
            categoryName: item.alertCategory?.name ?? null,
            categorySystemKey: item.alertCategory?.systemKey ?? null,
            timestamp: item.timestamp.toISOString(),
          })),
        },
      };
    }
    case "LOGS": {
      const config = parseWidgetConfigOrDefaults("LOGS", widget.config);
      if (!config) return { error: "LOGS_CONFIG_INVALID" };
      const result = await logsService.list(workspaceId, {
        pageSize: overFetchFor(config.limit, config.levels.length),
        sort: "desc",
        ...(config.levels.length === 1 ? { level: config.levels[0] } : {}),
      });
      const items = filterBySelection(
        result.items,
        config.levels,
        (item) => item.level,
      );
      return {
        kind: "LOGS",
        data: {
          items: items.slice(0, config.limit).map((item) => ({
            id: item.id,
            level: item.level,
            source: item.source,
            message: item.message,
            timestamp: item.timestamp.toISOString(),
          })),
        },
      };
    }
  }
}

// A single selected value is pushed down into the query; zero or several are
// filtered here, so ask the database for enough rows to still fill the tile.
function overFetchFor(limit: number, selectedCount: number): number {
  return selectedCount > 1 ? limit * selectedCount : limit;
}

function filterBySelection<T>(
  items: T[],
  selection: readonly string[],
  valueOf: (item: T) => string,
): T[] {
  if (selection.length <= 1) return items;
  return items.filter((item) => selection.includes(valueOf(item)));
}

// Gmail-style accounts store one MailItem row per folder a message landed in
// (INBOX, [Gmail]/All Mail, [Gmail]/Important, ...) — correct for the
// per-folder mail list, but the Mail tile aggregates across every folder, so
// the same message rendered as several identical rows. Over-fetch (same
// trade-off as overFetchFor above) and collapse by messageId — falling back
// to id for the webhook-ingested rows that have none — before trimming to
// `limit`.
const MAIL_WIDGET_OVERFETCH_FACTOR = 4;

async function listDistinctMailItems(
  workspaceId: string,
  params: Omit<mailService.ListMailParams, "cursor" | "pageSize">,
  limit: number,
): Promise<mailService.MailListItem[]> {
  const result = await mailService.list(workspaceId, {
    ...params,
    pageSize: limit * MAIL_WIDGET_OVERFETCH_FACTOR,
  });
  const seen = new Set<string>();
  const distinct: mailService.MailListItem[] = [];
  for (const item of result.items) {
    const key = item.messageId ?? item.id;
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(item);
    if (distinct.length >= limit) break;
  }
  return distinct;
}

async function resolveBookmarks(
  workspaceId: string,
  categoryId: string | null,
  limit: number,
): Promise<BookmarksPayload> {
  const categories = await bookmarksService.list(workspaceId);
  // Flatten top-level categories and their subcategories in board order, so
  // "all categories" shows the same sequence the Bookmarks page does.
  const tiles: BookmarkTile[] = [];
  for (const category of categories) {
    for (const node of [category, ...category.childCategories]) {
      if (categoryId && node.id !== categoryId) continue;
      for (const bookmark of node.bookmarks) {
        tiles.push({
          id: bookmark.id,
          name: bookmark.name,
          url: bookmark.url,
          icon: bookmark.icon,
          color: bookmark.color,
          categoryName: node.name,
        });
      }
    }
  }
  return { bookmarks: tiles.slice(0, limit), totalCount: tiles.length };
}

// A widget with no board picked, or one whose board was deleted, renders the
// "choose a board" hint rather than an error — same treatment the weather tile
// gives a missing location.
async function resolveKanban(
  workspaceId: string,
  boardId: string | null,
  columnId: string | null,
  limit: number,
): Promise<KanbanPayload> {
  const board = boardId
    ? await kanbanService.getBoard(workspaceId, boardId)
    : null;
  if (!board) return { boardName: null, cards: [], totalCount: 0 };

  const tiles: KanbanCardTile[] = [];
  for (const column of board.columns) {
    if (columnId && column.id !== columnId) continue;
    for (const card of column.cards) {
      tiles.push({
        id: card.id,
        title: card.title,
        columnName: column.name,
        columnColor: column.color,
        priority: card.priority,
        dueDate: card.dueDate?.toISOString() ?? null,
        isOverdue: card.isOverdue,
        assignee: card.assignee?.username ?? null,
        isDone: card.completedAt !== null,
      });
    }
  }
  return {
    boardName: board.name,
    cards: tiles.slice(0, limit),
    totalCount: tiles.length,
  };
}

async function resolveServerMetrics(
  workspaceId: string,
  localServerIds: string[],
  limit: number,
): Promise<ServerMetricsPayload> {
  const servers = await serversService.listLocalServerMetrics(workspaceId);
  const selected =
    localServerIds.length > 0
      ? servers.filter((server) =>
          localServerIds.includes(server.localServerId),
        )
      : servers;

  return {
    servers: selected.slice(0, limit).map((server) => ({
      localServerId: server.localServerId,
      name: server.name,
      hostname: server.hostname,
      // Narrowed to what a tile draws — see WidgetServerMetrics.
      metrics: {
        state: server.metrics.state,
        receivedAt: server.metrics.receivedAt,
        cpuUsagePercent: server.metrics.cpuUsagePercent,
        memoryTotalBytes: server.metrics.memoryTotalBytes,
        memoryAvailableBytes: server.metrics.memoryAvailableBytes,
        filesystemTotalBytes: server.metrics.filesystemTotalBytes,
        filesystemAvailableBytes: server.metrics.filesystemAvailableBytes,
      },
    })),
    // Counts the selected servers, not the whole workspace: the tile's "and N
    // more" line is about what this widget was told to watch.
    totalCount: selected.length,
  };
}

/** How much of a message body travels to the tile — see MessageEntry.content. */
const MESSAGE_PREVIEW_MAX = 240;

async function resolveMessages(
  workspaceId: string,
  config: MessagesConfig,
): Promise<MessagesPayload> {
  // One read of the category tree serves both jobs: deciding which channels the
  // widget watches, and naming the channel and category of every row.
  const categories = await messagesService.listCategories(workspaceId);
  const channels = categories.flatMap((category) =>
    category.channels.map((channel) => ({
      id: channel.id,
      name: channel.name,
      categoryId: category.id,
      categoryName: category.name,
    })),
  );

  const inScope = config.categoryId
    ? channels.filter((channel) => channel.categoryId === config.categoryId)
    : channels;

  // Ticked channels win over the category; nothing ticked and no category means
  // "every channel", which stays null so a channel added later is included.
  // A selection that resolves to nothing (channel or category deleted) yields an
  // empty tile rather than silently widening back to the whole workspace.
  const selection =
    config.channelIds.length > 0
      ? inScope
          .filter((channel) => config.channelIds.includes(channel.id))
          .map((channel) => channel.id)
      : config.categoryId
        ? inScope.map((channel) => channel.id)
        : null;

  const messages = await messagesService.listRecentMessages(workspaceId, {
    channelIds: selection,
    unreadOnly: config.unreadOnly,
    limit: config.limit,
  });

  const channelsById = new Map(
    channels.map((channel) => [channel.id, channel]),
  );
  return {
    items: messages.map((message) => {
      const channel = channelsById.get(message.channelId);
      return {
        id: message.id,
        channelId: message.channelId,
        channelName: channel?.name ?? "",
        categoryName: channel?.categoryName ?? "",
        author: message.author,
        content: message.content.trim().slice(0, MESSAGE_PREVIEW_MAX),
        isRead: message.isRead,
        createdAt: message.createdAt.toISOString(),
      };
    }),
  };
}

async function resolveServiceStatus(
  workspaceId: string,
  serviceIds: string[],
  limit: number,
): Promise<ServiceStatusPayload> {
  const services = await servicesService.list(workspaceId);
  const selected =
    serviceIds.length > 0
      ? services.filter((service) => serviceIds.includes(service.id))
      : services;

  // The summary counts every selected service, not just the ones that fit in
  // the widget — a tile showing five of twelve monitors must still say how many
  // are down overall.
  const summary = { up: 0, down: 0, pending: 0 };
  for (const service of selected) {
    if (service.currentStatus === "UP") summary.up += 1;
    else if (service.currentStatus === "DOWN") summary.down += 1;
    else summary.pending += 1;
  }

  // Down first, then pending, then up: the tile leads with what needs attention.
  const severityRank = { DOWN: 0, PENDING: 1, UP: 2 } as const;
  const ordered = [...selected].sort(
    (a, b) =>
      severityRank[a.currentStatus] - severityRank[b.currentStatus] ||
      a.name.localeCompare(b.name),
  );

  return {
    services: ordered.slice(0, limit).map((service) => ({
      id: service.id,
      name: service.name,
      status: service.currentStatus,
      isActive: service.isActive,
      lastResponseTimeMs: service.lastResponseTimeMs,
      lastCheckedAt: service.lastCheckedAt?.toISOString() ?? null,
    })),
    summary,
    totalCount: selected.length,
  };
}
