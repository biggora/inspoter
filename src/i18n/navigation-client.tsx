"use client";

import { useParams } from "next/navigation";
import { forwardRef, useMemo, type ComponentPropsWithoutRef } from "react";
import { stripWorkspacePrefix, toWorkspacePath } from "@/lib/workspace-path";
import {
  Link as BaseLink,
  usePathname as useBasePathname,
  useRouter as useBaseRouter,
} from "./navigation-base";

// Returns the workspace slug of the current `/w/<slug>/...` route, or null
// outside it (login, no-workspace), where every wrapper below is a no-op.
function useWorkspaceSlug(): string | null {
  const { workspace } = useParams<{ workspace?: string | string[] }>();
  return typeof workspace === "string" ? workspace : null;
}

export const Link = forwardRef<
  HTMLAnchorElement,
  ComponentPropsWithoutRef<typeof BaseLink>
>(function Link({ href, ...props }, ref) {
  const slug = useWorkspaceSlug();
  return (
    <BaseLink
      ref={ref}
      href={slug ? toWorkspacePath(slug, href) : href}
      {...props}
    />
  );
});

export function usePathname(): string {
  const slug = useWorkspaceSlug();
  const pathname = useBasePathname();
  return slug ? stripWorkspacePrefix(pathname) : pathname;
}

type BaseRouter = ReturnType<typeof useBaseRouter>;

export function useRouter(): BaseRouter {
  const slug = useWorkspaceSlug();
  const router = useBaseRouter();
  return useMemo(() => {
    if (!slug) return router;
    return {
      ...router,
      push: (href, options) =>
        router.push(toWorkspacePath(slug, href), options),
      replace: (href, options) =>
        router.replace(toWorkspacePath(slug, href), options),
      prefetch: (href, options) =>
        router.prefetch(toWorkspacePath(slug, href), options),
    };
  }, [router, slug]);
}
