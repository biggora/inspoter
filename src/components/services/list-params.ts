// The services list's URL policy. Filtering itself stays client-side over the
// already-loaded list (see filter.ts) — the URL is the persisted mirror, so
// the view survives a reload and can be carried into a service's detail page.

import { buildListSearch, listHref } from "@/lib/list-search-params";

export interface ServicesFilters {
  query: string;
  labelIds: string[];
}

/** The keys a detail page carries back into the "return to the list" link. */
export const SERVICES_LIST_PARAMS = ["query", "labelId"] as const;

// Repeated `labelId` rather than one comma-joined value: ids are cuids, and
// getAll/pickListSearch already handle repetition.
export function parseServicesFilters(params: {
  get(key: string): string | null;
  getAll(key: string): string[];
}): ServicesFilters {
  return {
    query: params.get("query")?.trim() ?? "",
    labelIds: params.getAll("labelId").filter((id) => id.length > 0),
  };
}

export function servicesListSearch(filters: ServicesFilters): string {
  return buildListSearch({
    query: filters.query,
    labelId: filters.labelIds,
  });
}

/** A card link that remembers the filtered list it was opened from. */
export function serviceDetailHref(
  id: string,
  filters: ServicesFilters,
): string {
  return listHref(
    `/services/${encodeURIComponent(id)}`,
    servicesListSearch(filters),
  );
}
