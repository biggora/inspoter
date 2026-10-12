import { getTranslations } from "next-intl/server";
import { WorkspaceNotFoundHeading } from "@/components/shell/workspace-not-found-heading";
import { Link } from "@/i18n/navigation";

// Rendered when `requireWorkspaceBySlug` calls `notFound()` for a slug that
// is unknown or belongs to a workspace the operator is not a member of
// (AC-WS-013). The two cases look identical on purpose, so the page cannot be
// used to probe for workspaces, and it sits above `[workspace]/layout.tsx`
// so no shell, sidebar or workspace data is rendered.
export default async function WorkspaceNotFound() {
  const t = await getTranslations("ui");

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <div className="max-w-md text-center">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <WorkspaceNotFoundHeading>
          {t("workspaceNotFoundTitle")}
        </WorkspaceNotFoundHeading>
        <p className="mt-3 text-muted-foreground">
          {t("workspaceNotFoundDescription")}
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
        >
          {t("workspaceNotFoundAction")}
        </Link>
      </div>
    </main>
  );
}
