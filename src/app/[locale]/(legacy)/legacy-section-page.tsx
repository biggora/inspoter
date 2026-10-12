import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import {
  legacyWorkspacePath,
  pickLegacyWorkspaceSlug,
  type LegacySearchParams,
} from "@/lib/auth/legacy-redirect";
import { toWorkspacePath } from "@/lib/workspace-path";

// URLs without a `/w/<slug>` prefix (old bookmarks, the post-login
// `/management`, the root redirect) are redirected to
// `/w/<slug>/<same path and query>` (AC-WS-014). One route per workspace
// section (`(legacy)/<section>/[[...rest]]`) instead of a single catch-all, so
// a URL that is not a section matches no route at all and keeps the global
// 404 page (plan K-1; e2e/ui-audit-regressions.spec.ts).
export function legacySectionPage(section: string) {
  return async function LegacySectionPage({
    params,
    searchParams,
  }: {
    params: Promise<{ rest?: string[] }>;
    searchParams: Promise<LegacySearchParams>;
  }) {
    const { rest = [] } = await params;
    const path = legacyWorkspacePath([section, ...rest], await searchParams);

    // Unauthenticated operators are sent to /login by the DAL inside.
    const slug = await pickLegacyWorkspaceSlug();
    const locale = await getLocale();
    if (!slug) return redirect({ href: "/no-workspace", locale });
    redirect({ href: toWorkspacePath(slug, path), locale });
  };
}
