// The runs list pages by keyset cursor (ADR-009), so "which page am I on" is
// the chain of cursors walked to get here, not a number. That chain used to
// live in React state and died on every route change; it lives in the query
// string instead, which makes a page reloadable, shareable, and reachable
// again from a run's detail page.
//
// Deep paging makes the URL grow — a run cursor is `<ISO>|<id>`, ~60 chars —
// but it is bounded by how far an operator actually pages, and a stale or
// foreign cursor degrades to the first page rather than erroring.

import { buildListSearch, listHref, toValues } from "@/lib/list-search-params";

/** The keys a detail page carries back into the "return to the list" link. */
export const RUNS_LIST_PARAMS = ["cursor"] as const;

/** The keyset cursors walked to reach the current page; `[]` is page 1. */
export function parseRunCursors(
  value: string | string[] | undefined,
): string[] {
  return toValues(value).filter((cursor) => cursor.length > 0);
}

export function runsListHref(cursors: readonly string[]): string {
  return listHref("/agents/runs", buildListSearch({ cursor: cursors }));
}

/** A row link that remembers which page the run was opened from. */
export function runDetailHref(id: string, cursors: readonly string[]): string {
  return listHref(
    `/agents/runs/${encodeURIComponent(id)}`,
    buildListSearch({ cursor: cursors }),
  );
}
