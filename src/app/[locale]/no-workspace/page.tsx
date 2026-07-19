import { redirect } from "next/navigation";
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
    redirect("/bookmarks");
  }

  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-8 bg-background px-4 py-12">
      <div className="flex flex-col items-center gap-1 text-center">
        <span className="text-2xl font-semibold text-foreground">Inspoter</span>
        <p className="text-sm text-muted-foreground">Панель управления</p>
      </div>
      <Card className="w-full max-w-[380px]">
        <CardHeader>
          <h1 className="font-heading text-base leading-none font-medium text-foreground">
            Нет доступа к рабочему пространству
          </h1>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Ваша учётная запись создана, но пока не добавлена ни в одно рабочее
            пространство. Обратитесь к администратору, чтобы вас добавили.
          </p>
          <form action={logout}>
            <Button type="submit" variant="outline" className="w-full">
              Выйти
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
