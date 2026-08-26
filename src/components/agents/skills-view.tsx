"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { useRouter } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { SkillSummary } from "@/lib/services/skills";
import { AgentSectionActions } from "./agent-section-actions";
import { ApiError, skillsApi } from "./api";
import { SkillDialog, type SkillDialogState } from "./skill-dialog";

interface SkillsViewProps {
  skills: SkillSummary[];
}

export function SkillsView({ skills }: SkillsViewProps) {
  const t = useTranslations("agents");
  const router = useRouter();
  const [dialogState, setDialogState] = useState<SkillDialogState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SkillSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [opening, setOpening] = useState<string | null>(null);

  // The instruction body is fetched on demand rather than shipped with the
  // list: 200 skills of 4000 characters each would be a megabyte of RSC
  // payload nobody reads until they click Edit.
  async function openEdit(id: string) {
    setOpening(id);
    try {
      setDialogState({ mode: "edit", skill: await skillsApi.get(id) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t("saveSkillError"));
    } finally {
      setOpening(null);
    }
  }

  async function handleDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await skillsApi.remove(pendingDelete.id);
      toast.success(t("skillDeletedToast"));
      setPendingDelete(null);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("deleteSkillError"),
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <PageHeader
        title={t("skillsPageTitle")}
        description={t("skillsPageDescription")}
        actions={
          <AgentSectionActions current="skills">
            <Button
              type="button"
              onClick={() => setDialogState({ mode: "create" })}
            >
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("newSkillButton")}
            </Button>
          </AgentSectionActions>
        }
      />
      <PageBody>
        {skills.length === 0 ? (
          <EmptyState
            icon="ri-lightbulb-line"
            title={t("noSkillsTitle")}
            description={t("noSkillsDescription")}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("nameColumn")}</TableHead>
                <TableHead>{t("descriptionColumn")}</TableHead>
                <TableHead>{t("toolsColumn")}</TableHead>
                <TableHead>{t("statusColumn")}</TableHead>
                <TableHead className="text-right">
                  {t("actionsColumn")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skills.map((skill) => (
                <TableRow key={skill.id}>
                  <TableCell className="font-medium">{skill.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {skill.description}
                  </TableCell>
                  <TableCell>
                    {skill.toolNames.length === 0
                      ? t("allToolsAllowed")
                      : t("toolCount", { count: skill.toolNames.length })}
                  </TableCell>
                  <TableCell>
                    <Badge variant={skill.isActive ? "default" : "secondary"}>
                      {skill.isActive ? t("statusActive") : t("statusInactive")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={opening === skill.id}
                      onClick={() => openEdit(skill.id)}
                    >
                      {t("editAction")}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setPendingDelete(skill)}
                    >
                      {t("deleteAction")}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </PageBody>

      <SkillDialog
        state={dialogState}
        onOpenChange={(open) => {
          if (!open) setDialogState(null);
        }}
        onSaved={() => {
          setDialogState(null);
          router.refresh();
        }}
      />

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteSkillTitle", { name: pendingDelete?.name ?? "" })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteSkillDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("deletingButton") : t("deleteAction")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
