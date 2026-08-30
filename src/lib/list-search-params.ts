// A list's filters and page live in the query string, so the view survives a
// reload and is shareable. The reason this module exists is the step after
// that: the state is carried into a detail page's URL and rebuilt there into
// the "back to the list" link, so returning lands on the view the operator
// left rather than on an unfiltered first page.
//
// Only the mechanics live here. Which keys a section owns and what resets its
// pagination is section knowledge and stays beside the section (see
// `components/contacts/list-params.ts` for the shape).

export type ListParamValue =
  string | number | boolean | null | undefined | readonly string[];

/**
 * Query string for a list's state. `null`, `undefined`, `false` and `""` are
 * omitted so an unfiltered list keeps a bare URL; an array contributes one
 * entry per item (the keyset cursor stack). Insertion order is preserved, so
 * the same state always produces the same string.
 */
export function buildListSearch(
  values: Record<string, ListParamValue>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined || value === false) continue;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item !== "") params.append(key, item);
      }
      continue;
    }
    if (value === "") continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** `listHref("/contacts", "query=a")` → `"/contacts?query=a"`; empty → `"/contacts"`. */
export function listHref(pathname: string, search: string): string {
  return search.length > 0 ? `${pathname}?${search}` : pathname;
}

/** `string | string[] | undefined` → `string[]` (App Router repeated params). */
export function toValues(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * The slice of a detail page's searchParams that belongs to the list it was
 * opened from. An allowlist, not a passthrough: a detail page must not echo
 * arbitrary query params back into a link it renders.
 */
export function pickListSearch(
  searchParams: Record<string, string | string[] | undefined>,
  keys: readonly string[],
): string {
  const params = new URLSearchParams();
  for (const key of keys) {
    for (const value of toValues(searchParams[key])) {
      if (value !== "") params.append(key, value);
    }
  }
  return params.toString();
}
