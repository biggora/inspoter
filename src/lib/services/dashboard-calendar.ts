import { db } from "@/lib/db";
import type { CalendarEventSource } from "@/lib/validation/dashboards";
import type {
  CalendarDayBucket,
  CalendarEventCounts,
  CalendarMonthData,
} from "@/lib/dashboards/widget-payloads";

// Day buckets for the dashboard calendar widget. There is no calendar entity in
// this product: the widget marks the days on which things the workspace already
// records happened — alerts raised, service checks that came back DOWN, mail
// received, operator actions. Domains are absent on purpose, since a DNS zone
// (src/lib/providers/dns/types.ts) carries no expiry date.
//
// Each source is one indexed range query selecting nothing but the timestamp,
// bucketed in JS. Buckets could be computed in SQL with date_trunc, but no
// application code in this project uses raw SQL, and a month of timestamps is
// small enough that the trade isn't worth a new pattern. The `take` cap keeps a
// pathological month (a flapping monitor writing a check a minute) from pulling
// tens of thousands of rows into memory; when it trips, `truncated` says so and
// the widget shows a note instead of pretending the counts are complete.

const MAX_ROWS_PER_SOURCE = 2000;

export type { CalendarDayBucket, CalendarMonthData };

/** YYYY-MM-DD in UTC — the same basis the range boundaries use. */
function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function monthRange(month: Date): { from: Date; to: Date } {
  const from = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1),
  );
  const to = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1),
  );
  return { from, to };
}

async function fetchTimestamps(
  source: CalendarEventSource,
  workspaceId: string,
  from: Date,
  to: Date,
): Promise<Date[]> {
  const range = { gte: from, lt: to };
  switch (source) {
    case "alerts": {
      const rows = await db.alert.findMany({
        where: { workspaceId, timestamp: range },
        select: { timestamp: true },
        orderBy: { timestamp: "asc" },
        take: MAX_ROWS_PER_SOURCE + 1,
      });
      return rows.map((row) => row.timestamp);
    }
    case "serviceIncidents": {
      const rows = await db.serviceCheck.findMany({
        where: { workspaceId, status: "DOWN", checkedAt: range },
        select: { checkedAt: true },
        orderBy: { checkedAt: "asc" },
        take: MAX_ROWS_PER_SOURCE + 1,
      });
      return rows.map((row) => row.checkedAt);
    }
    case "mail": {
      const rows = await db.mailItem.findMany({
        where: { workspaceId, receivedAt: range },
        select: { receivedAt: true },
        orderBy: { receivedAt: "asc" },
        take: MAX_ROWS_PER_SOURCE + 1,
      });
      return rows.map((row) => row.receivedAt);
    }
    case "activity": {
      const rows = await db.activity.findMany({
        where: { workspaceId, timestamp: range },
        select: { timestamp: true },
        orderBy: { timestamp: "asc" },
        take: MAX_ROWS_PER_SOURCE + 1,
      });
      return rows.map((row) => row.timestamp);
    }
  }
}

/**
 * Buckets the requested sources for one month into per-day counts. Only days
 * with at least one event appear in `days`; the widget draws the empty ones from
 * the calendar grid itself.
 */
export async function getMonthEvents(
  workspaceId: string,
  month: Date,
  sources: CalendarEventSource[],
): Promise<CalendarMonthData> {
  const { from, to } = monthRange(month);
  const requested = [...new Set(sources)];

  const results = await Promise.all(
    requested.map(async (source) => ({
      source,
      timestamps: await fetchTimestamps(source, workspaceId, from, to),
    })),
  );

  const buckets = new Map<string, CalendarDayBucket>();
  const truncated: CalendarEventSource[] = [];

  for (const { source, timestamps } of results) {
    if (timestamps.length > MAX_ROWS_PER_SOURCE) truncated.push(source);
    for (const timestamp of timestamps.slice(0, MAX_ROWS_PER_SOURCE)) {
      const key = dayKey(timestamp);
      const bucket = buckets.get(key) ?? {
        date: key,
        counts: emptyCounts(),
        total: 0,
      };
      bucket.counts[source] += 1;
      bucket.total += 1;
      buckets.set(key, bucket);
    }
  }

  return {
    month: dayKey(from),
    days: [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date)),
    truncated,
  };
}

// Every source is present with a zero, including the ones this widget didn't
// ask for, so the client never has to guard on a missing key.
function emptyCounts(): CalendarEventCounts {
  return { alerts: 0, serviceIncidents: 0, mail: 0, activity: 0 };
}
