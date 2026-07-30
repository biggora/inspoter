"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { DashboardDialog, type DashboardDialogState } from "./dashboard-dialog";

// Shown by /dashboards when the workspace has none yet. Creating one navigates
// straight to it, so the operator lands on the board they just made instead of
// back on this screen.
export function DashboardsEmptyState() {
  const t = useTranslations("dashboards");
  const router = useRouter();
  const [dialog, setDialog] = useState<DashboardDialogState | null>(null);

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        actions={
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("newDashboardButton")}
          </Button>
        }
      />
      <EmptyState
        icon="ri-dashboard-line"
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={
          <Button onClick={() => setDialog({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("createFirstButton")}
          </Button>
        }
      />
      <DashboardDialog
        state={dialog}
        onOpenChange={(open) => !open && setDialog(null)}
        onSaved={(dashboard) => {
          setDialog(null);
          router.push(`/dashboards/${dashboard.id}`);
        }}
      />
    </PageBody>
  );
}
