// The single navigation entry point for the app. `Link`, `useRouter` and
// `usePathname` are workspace-aware (they add and strip `/w/<slug>` when the
// current route has a workspace param). Server `redirect` and `getPathname`
// stay raw: Server Components get the slug from `params` and pass the full
// path via `toWorkspacePath`.
export { Link, usePathname, useRouter } from "./navigation-client";
export { getPathname, redirect } from "./navigation-base";
