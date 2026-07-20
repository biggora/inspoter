import { redirect } from "@/i18n/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { requireOperator } from "@/lib/auth/dal";
import { listForOperator } from "@/lib/services/workspaces";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { logout } from "@/app/[locale]/login/actions";

// Landing page for an authenticated Operator with zero workspace
// memberships — e.g. a freshly auto-provisioned Authentik account before an
// owner adds them to a workspace. Uses requireOperator() (not requireAuth()),
// which does not require any WorkspaceMember row.
export default async function NoWorkspacePage() {
  const operator = await requireOperator();

  // Defensive re-check: an owner may have added this operator to a
  // workspace in another tab since this session started.
  const workspaces = await listForOperator(operator.id);
  if (workspaces.length > 0) {
    redirect({ href: "/bookmarks", locale: await getLocale() });
  }

  const t = await getTranslations("auth");

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-semibold text-foreground">Inspoter</span>
        <p className="text-sm text-muted-foreground">{t("tagline")}</p>
      </div>
      <Card className="w-full max-w-[380px]">
        <CardHeader>
          <h1 className="font-heading text-base leading-none font-medium text-foreground">
            {t("noWorkspaceHeading")}
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {t("noWorkspaceDescription")}
          </p>
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">
              {t("logout")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
