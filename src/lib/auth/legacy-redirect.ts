import { headers } from "next/headers";
import { routing } from "@/i18n/routing";
import {
  findMemberWorkspaceBySlug,
  requireOperator,
  resolveLastUsedWorkspace,
} from "@/lib/auth/dal";
import { resolveDeepLinkWorkspaceSlug } from "@/lib/services/legacy-link-resolver";

// Legacy URLs (no `/w/<slug>` prefix) are redirected to the workspace the
// operator most plausibly meant (workspace-in-url.md §4.5, AC-WS-014). Used by
// the `src/app/[locale]/(legacy)/<section>/[[...rest]]` routes.

export type LegacySearchParams = Record<string, string | string[] | undefined>;

/**
 * The workspace-relative path (`/notes/abc?x=1`) of a legacy URL: its route
 * segments and its query string. Next hands route params over still
 * percent-encoded, so the segments are joined as they are (encoding them again
 * would turn `%20` into `%2520`).
 */
export function legacyWorkspacePath(
  segments: string[],
  searchParams: LegacySearchParams,
): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) {
      query.append(key, item);
    }
  }
  const search = query.size > 0 ? `?${query}` : "";
  return `/${segments.join("/")}${search}`;
}

function stripLocale(pathname: string): string {
  for (const locale of routing.locales) {
    if (pathname.startsWith(`/${locale}/`)) {
      return pathname.slice(locale.length + 1);
    }
  }
  return pathname;
}

// The `<slug>` of a same-origin Referer pointing at `/w/<slug>/...` (with or
// without a locale prefix). Cross-origin and unparseable Referers yield null.
function workspaceSlugFromReferer(
  referer: string | null,
  host: string | null,
): string | null {
  if (!referer || !host) return null;
  let url: URL;
  try {
    url = new URL(referer);
  } catch {
    return null;
  }
  if (url.host !== host.toLowerCase()) return null;
  const match = /^\/w\/([^/]+)/.exec(stripLocale(url.pathname));
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

/**
 * The slug a legacy URL should be redirected under, or null when the operator
 * has no workspace at all (the caller sends them to /no-workspace).
 *
 * Order: the workspace owning the entity of a single-entity deep link, when the
 * operator is a member of it; else the same-origin Referer `/w/<slug>` if the
 * operator is a member of that workspace; else the last-used workspace. Every
 * hint is membership-checked, and an entity the operator cannot see falls
 * through exactly like a link without an id, so its existence is not disclosed.
 * `segments` are the legacy route segments, section first (`["notes", "<id>"]`).
 */
export async function pickLegacyWorkspaceSlug(
  segments: string[] = [],
): Promise<string | null> {
  const [section = "", ...rest] = segments;
  const operator = await requireOperator();
  const owning = await resolveDeepLinkWorkspaceSlug(operator.id, section, rest);
  if (owning) return owning;

  const headerList = await headers();
  const hinted = workspaceSlugFromReferer(
    headerList.get("referer"),
    headerList.get("x-forwarded-host") ?? headerList.get("host"),
  );
  if (hinted) {
    const workspace = await findMemberWorkspaceBySlug(hinted);
    if (workspace) return workspace.slug;
  }
  return (await resolveLastUsedWorkspace())?.slug ?? null;
}
