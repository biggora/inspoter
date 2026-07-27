import { formatTarget } from "./format";
import type { MonitorTypeValue } from "./api";

// Client-side filtering for the services list. The page renders every
// service the workspace owns in one server pass (services/page.tsx →
// listOverview), so there is nothing to paginate and no reason to round-trip
// a query to the API — unlike alerts/logs, which are cursor-paginated.

export interface FilterableService {
  name: string;
  description?: string | null;
  monitorType: MonitorTypeValue;
  url?: string | null;
  host?: string | null;
  port?: number | null;
  labels: Array<{ id: string }>;
}

export interface ServiceFilters {
  query: string;
  /** Empty = no label filter. Several labels match with OR semantics. */
  labelIds: readonly string[];
}

export function filterServices<T extends FilterableService>(
  services: readonly T[],
  { query, labelIds }: ServiceFilters,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  const wanted = new Set(labelIds);

  return services.filter((service) => {
    if (
      wanted.size > 0 &&
      !service.labels.some((label) => wanted.has(label.id))
    ) {
      return false;
    }
    if (!needle) return true;

    const haystack = [
      service.name,
      service.description ?? "",
      formatTarget(service),
    ];
    return haystack.some((value) => value.toLocaleLowerCase().includes(needle));
  });
}
