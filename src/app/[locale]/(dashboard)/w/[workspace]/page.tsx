import { getLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { requireWorkspaceBySlug } from "@/lib/auth/dal";
import { toWorkspacePath } from "@/lib/workspace-path";

export const dynamic = "force-dynamic";

// `/w/<slug>` has no content of its own: it opens the workspace on its
// management overview. The slug is resolved (and the 404 raised) here, not
// only in the layout, so an unknown slug never redirects anywhere.
export default async function WorkspaceRootPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await requireWorkspaceBySlug((await params).workspace);

  redirect({
    href: toWorkspacePath(workspace.slug, "/management"),
    locale: await getLocale(),
  });
}
