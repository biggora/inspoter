// Top-level folders under `src/app/[locale]/(dashboard)/`. Only paths whose
// first segment is one of these live under `/w/<slug>`; everything else
// (`/login`, `/api/...`, `/`) is workspace-independent. A filesystem test keeps
// this list equal to the folders on disk.
export const WORKSPACE_SECTIONS = [
  "activity",
  "agents",
  "alerts",
  "bookmarks",
  "calendar",
  "contacts",
  "dashboards",
  "domains",
  "help",
  "hosting",
  "kanban",
  "logs",
  "mail",
  "management",
  "messages",
  "notes",
  "servers",
  "services",
  "settings",
] as const;

const SECTIONS: ReadonlySet<string> = new Set(WORKSPACE_SECTIONS);
// An href object with a pathname: next-intl's `{ pathname, query }` or a
// Next `UrlObject`.
type HrefObject = { pathname?: string | null };

const WORKSPACE_PREFIX = /^\/w\/[^/]+(?=\/|$)/;

function prefixPathname(slug: string, pathname: string): string {
  if (!pathname.startsWith("/")) return pathname;
  const firstSegment = pathname.slice(1).split(/[/?#]/, 1)[0];
  return SECTIONS.has(firstSegment)
    ? `/w/${encodeURIComponent(slug)}${pathname}`
    : pathname;
}

/**
 * Prefix a workspace-relative href with `/w/<slug>`. Query and hash are kept.
 * Anything that is not a workspace section path (`/login`, `/api/...`, `/`,
 * absolute URLs, already-prefixed paths) is returned unchanged.
 */
export function toWorkspacePath(slug: string, href: string): string;
export function toWorkspacePath<T extends HrefObject>(slug: string, href: T): T;
export function toWorkspacePath<T extends HrefObject>(
  slug: string,
  href: string | T,
): string | T;
export function toWorkspacePath<T extends HrefObject>(
  slug: string,
  href: string | T,
): string | T {
  if (typeof href === "string") return prefixPathname(slug, href);
  if (typeof href.pathname !== "string") return href;
  return { ...href, pathname: prefixPathname(slug, href.pathname) };
}

/** Inverse of `toWorkspacePath` for a pathname: `/w/acme/notes` -> `/notes`. */
export function stripWorkspacePrefix(pathname: string): string {
  if (!WORKSPACE_PREFIX.test(pathname)) return pathname;
  return pathname.replace(WORKSPACE_PREFIX, "") || "/";
}
