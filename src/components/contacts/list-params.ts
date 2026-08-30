// The contacts list's own URL policy: which keys it owns, how they parse, and
// what resets pagination. Deliberately not a client module — the list page,
// the detail page and the duplicates page all import it on the server.

import {
  buildListSearch,
  listHref,
  type ListParamValue,
} from "@/lib/list-search-params";

export interface ContactsFilters {
  query: string;
  labelId: string | null;
  starred: boolean;
  page: number;
}

/** The keys a detail page carries back into the "return to the list" link. */
export const CONTACTS_LIST_PARAMS = [
  "query",
  "labelId",
  "starred",
  "page",
] as const;

export function parseContactsFilters(searchParams: {
  query?: string;
  labelId?: string;
  starred?: string;
  page?: string;
}): ContactsFilters {
  return {
    query: searchParams.query?.trim() ?? "",
    labelId: searchParams.labelId ?? null,
    starred: searchParams.starred === "true",
    page: Number.parseInt(searchParams.page ?? "1", 10) || 1,
  };
}

function toSearch(filters: ContactsFilters, page: number): string {
  const values: Record<string, ListParamValue> = {
    query: filters.query,
    labelId: filters.labelId,
    starred: filters.starred,
    page: page > 1 ? page : null,
  };
  return buildListSearch(values);
}

/**
 * Patching any filter returns to the first page; an explicit `page` in the
 * patch is what a pagination link sends, and an empty patch keeps the page
 * the operator is on.
 */
export function contactsListHref(
  filters: ContactsFilters,
  patch: Partial<ContactsFilters> = {},
): string {
  const next = { ...filters, ...patch };
  const resetsPage =
    "query" in patch || "labelId" in patch || "starred" in patch;
  const page = patch.page ?? (resetsPage ? 1 : next.page);
  return listHref("/contacts", toSearch(next, page));
}

/** A row link that remembers the list view it was opened from. */
export function contactDetailHref(
  id: string,
  filters: ContactsFilters,
): string {
  return listHref(
    `/contacts/${encodeURIComponent(id)}`,
    toSearch(filters, filters.page),
  );
}

export function contactDuplicatesHref(filters: ContactsFilters): string {
  return listHref("/contacts/duplicates", toSearch(filters, filters.page));
}
