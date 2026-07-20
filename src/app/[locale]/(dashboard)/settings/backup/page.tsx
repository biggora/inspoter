import { getTranslations } from "next-intl/server";

import { requireAuth } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { ExportForm } from "@/components/backup/export-form";
import { ImportForm } from "@/components/backup/import-form";

export const dynamic = "force-dynamic";

// Settings > Backup & restore. Owner-only (export/import touch every model
// in the workspace, including decrypted secrets) — mirrors the
// requireWorkspaceOwner gate enforced server-side by the /api/backup routes,
// computed here the same way src/app/api/backup/errors.ts's callers do
// (workspacesService.listMembers + role check) so non-owners see a notice
// instead of forms that would 403 on submit.
export default async function BackupSettingsPage() {
  const { operator, workspace } = await requireAuth();
  const members = await workspacesService.listMembers(workspace.id);
  const isOwner = members.some(
    (member) => member.operator.id === operator.id && member.role === "OWNER",
  );
  const t = await getTranslations("backup");
  const tSettings = await getTranslations("settings");

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/settings", label: tSettings("backToSettings") }}
        title={t("pageTitle")}
        description={t("pageDescription")}
      />

      {!isOwner ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("ownerOnlyTitle")}</CardTitle>
            <CardDescription>{t("ownerOnly")}</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("exportCardTitle")}</CardTitle>
              <CardDescription>{t("exportCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ExportForm />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("importCardTitle")}</CardTitle>
              <CardDescription>{t("importCardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ImportForm />
            </CardContent>
          </Card>
        </>
      )}
    </PageBody>
  );
}
