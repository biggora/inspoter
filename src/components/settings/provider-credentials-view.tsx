"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { LoadingRegion } from "@/components/ui/loading";
import { TableSkeleton } from "@/components/ui/skeletons";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  PROVIDER_REGISTRY,
  type ProviderCategory,
} from "@/lib/providers/registry";
import {
  credentialsApi,
  type CredentialDto,
  type EmbeddingStatusDto,
} from "./credentials-api";
import { ProviderCredentialDialog } from "./provider-credential-dialog";

// "DNS" and "LLM" aren't prose so they stay plain literal strings;
// "Hosting" is a word every locale spells differently and holds a key instead,
// resolved via categoryLabel() below (same convention as services/format.ts's
// MONITOR_TYPE_LABELS/getMonitorTypeLabel).
const CATEGORY_LABELS: Record<ProviderCategory, string> = {
  DNS: "DNS",
  HOSTING: "categoryHosting",
  LLM: "LLM",
};

function categoryLabel(
  category: ProviderCategory,
  t: (key: string) => string,
): string {
  return category === "HOSTING"
    ? t(CATEGORY_LABELS.HOSTING)
    : CATEGORY_LABELS[category];
}

type DialogState =
  { mode: "create" } | { mode: "edit"; credential: CredentialDto };

// Settings > Providers — dynamic list of all configured credentials
// (multiple accounts per provider type allowed) + add/edit/delete. Client-
// fetched (no server-component data hand-off) since secrets must never
// round-trip through a server-rendered prop, matching
// src/components/settings/webhook-tokens-view.tsx.
export function ProviderCredentialsView() {
  const t = useTranslations("settings");
  const [credentials, setCredentials] = useState<CredentialDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CredentialDto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [savingAutoRefresh, setSavingAutoRefresh] = useState<string | null>(
    null,
  );
  const [savingDefault, setSavingDefault] = useState<string | null>(null);
  const [embeddingStatus, setEmbeddingStatus] =
    useState<EmbeddingStatusDto | null>(null);
  const [embeddingCredentialId, setEmbeddingCredentialId] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [savingEmbedding, setSavingEmbedding] = useState(false);

  const load = useCallback(() => {
    return Promise.all([
      credentialsApi.list(),
      credentialsApi.embeddingStatus(),
    ])
      .then(([data, status]) => {
        setCredentials(data);
        setEmbeddingStatus(status);
        const openAi = data.filter(
          (credential) => credential.provider === "OPENAI_COMPATIBLE",
        );
        setEmbeddingCredentialId(status?.credentialId ?? openAi[0]?.id ?? "");
        setEmbeddingModel(status?.model ?? "");
        setError(null);
      })
      .catch(() => setError(t("loadCredentialsError")))
      .finally(() => setLoading(false));
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteConfirm() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await credentialsApi.remove(deleteTarget.id);
      toast.success(t("providerDeletedToast"));
      setDeleteTarget(null);
      load();
    } catch {
      toast.error(t("deleteProviderError"));
    } finally {
      setDeleting(false);
    }
  }

  async function saveEmbeddingProfile() {
    if (!embeddingCredentialId || !embeddingModel.trim()) return;
    setSavingEmbedding(true);
    try {
      const status = await credentialsApi.setEmbeddingDefault(
        embeddingCredentialId,
        true,
        embeddingModel.trim(),
      );
      setEmbeddingStatus(status);
      toast.success(t("embeddingProfileSavedToast"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("embeddingProfileSaveError"),
      );
    } finally {
      setSavingEmbedding(false);
    }
  }

  async function disableEmbeddingProfile() {
    if (!embeddingCredentialId) return;
    setSavingEmbedding(true);
    try {
      await credentialsApi.setEmbeddingDefault(embeddingCredentialId, false);
      setEmbeddingStatus(null);
      toast.success(t("embeddingProfileDisabledToast"));
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("embeddingProfileSaveError"),
      );
    } finally {
      setSavingEmbedding(false);
    }
  }

  // Optimistic: the row flips immediately and rolls back if the PATCH fails,
  // so a toggle doesn't need a full list reload to feel responsive.
  async function handleAutoRefreshChange(
    credential: CredentialDto,
    enabled: boolean,
  ) {
    setSavingAutoRefresh(credential.id);
    setCredentials((prev) =>
      prev.map((entry) =>
        entry.id === credential.id
          ? { ...entry, autoRefreshEnabled: enabled }
          : entry,
      ),
    );
    try {
      await credentialsApi.setAutoRefresh(credential.id, enabled);
    } catch {
      setCredentials((prev) =>
        prev.map((entry) =>
          entry.id === credential.id
            ? { ...entry, autoRefreshEnabled: !enabled }
            : entry,
        ),
      );
      toast.error(t("autoRefreshSaveError"));
    } finally {
      setSavingAutoRefresh(null);
    }
  }

  // Optimistic like the toggle above, with one addition: setting the flag
  // clears it on every other credential of the same category, because that is
  // what the service does server-side. Without the local sweep the table would
  // show two defaults until the next reload. Clearing it is allowed too — with
  // no default anywhere the LLM registry falls back to the oldest credential.
  async function handleDefaultChange(
    credential: CredentialDto,
    isDefault: boolean,
  ) {
    const previous = credentials;
    setSavingDefault(credential.id);
    setCredentials((prev) =>
      prev.map((entry) => {
        if (entry.id === credential.id) return { ...entry, isDefault };
        if (
          !isDefault ||
          PROVIDER_REGISTRY[entry.provider].category !==
            PROVIDER_REGISTRY[credential.provider].category
        ) {
          return entry;
        }
        return { ...entry, isDefault: false };
      }),
    );
    try {
      await credentialsApi.setDefault(credential.id, isDefault);
    } catch {
      setCredentials(previous);
      toast.error(t("defaultSaveError"));
    } finally {
      setSavingDefault(null);
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={t("providersTitle")}
        back={{ href: "/settings", label: t("backToSettings") }}
        actions={
          <Button size="sm" onClick={() => setDialogState({ mode: "create" })}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("addProviderButton")}
          </Button>
        }
      />

      {error && (
        <Alert variant="error">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {!loading ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle>{t("embeddingProfileTitle")}</CardTitle>
                <CardDescription>
                  {t("embeddingProfileDescription")}
                </CardDescription>
              </div>
              {embeddingStatus ? (
                <Badge
                  variant={
                    embeddingStatus.backfillStatus === "READY"
                      ? "default"
                      : "secondary"
                  }
                >
                  {t(`embeddingStatus${embeddingStatus.backfillStatus}`)}
                </Badge>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <Alert>
              <AlertDescription>{t("embeddingCloudWarning")}</AlertDescription>
            </Alert>
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select
                value={embeddingCredentialId}
                onValueChange={(value) =>
                  setEmbeddingCredentialId(value as string)
                }
                items={Object.fromEntries(
                  credentials
                    .filter(
                      (credential) =>
                        credential.provider === "OPENAI_COMPATIBLE",
                    )
                    .map((credential) => [credential.id, credential.label]),
                )}
              >
                <SelectTrigger
                  className="w-full"
                  aria-label={t("embeddingCredentialLabel")}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {credentials
                      .filter(
                        (credential) =>
                          credential.provider === "OPENAI_COMPATIBLE",
                      )
                      .map((credential) => (
                        <SelectItem key={credential.id} value={credential.id}>
                          {credential.label}
                        </SelectItem>
                      ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Input
                value={embeddingModel}
                onChange={(event) => setEmbeddingModel(event.target.value)}
                placeholder={t("embeddingModelPlaceholder")}
                aria-label={t("embeddingModelLabel")}
              />
              <Button
                onClick={saveEmbeddingProfile}
                disabled={
                  savingEmbedding ||
                  !embeddingCredentialId ||
                  !embeddingModel.trim()
                }
              >
                {t("embeddingSaveButton")}
              </Button>
            </div>
            {embeddingStatus ? (
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                <span>
                  {t("embeddingDimensions", {
                    count: embeddingStatus.dimensions,
                  })}
                </span>
                <span>
                  {t("embeddingProgress", {
                    indexed: embeddingStatus.indexedNotes,
                    total: embeddingStatus.totalNotes,
                  })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={disableEmbeddingProfile}
                  disabled={savingEmbedding}
                >
                  {t("embeddingDisableButton")}
                </Button>
              </div>
            ) : null}
            {embeddingStatus?.lastError ? (
              <p className="text-sm text-destructive">
                {embeddingStatus.lastError}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {loading ? (
        <LoadingRegion>
          <TableSkeleton rows={3} />
        </LoadingRegion>
      ) : credentials.length === 0 ? (
        <EmptyState
          icon="ri-key-2-line"
          title={t("emptyProvidersTitle")}
          description={t("emptyProvidersDescription")}
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("providerHeader")}</TableHead>
              <TableHead>{t("nameHeader")}</TableHead>
              <TableHead>{t("keyHeader")}</TableHead>
              <TableHead>{t("categoryHeader")}</TableHead>
              <TableHead>{t("defaultHeader")}</TableHead>
              <TableHead>{t("autoRefreshHeader")}</TableHead>
              <TableHead className="text-right">{t("actionsHeader")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {credentials.map((credential) => {
              const meta = PROVIDER_REGISTRY[credential.provider];
              return (
                <TableRow key={credential.id}>
                  <TableCell className="font-medium text-foreground">
                    {meta.label}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {credential.label}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {credential.maskedHint}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryLabel(meta.category, t)}
                  </TableCell>
                  <TableCell>
                    {meta.category === "LLM" ? (
                      <Checkbox
                        checked={credential.isDefault}
                        disabled={savingDefault !== null}
                        aria-label={t("defaultAria", {
                          label: credential.label,
                        })}
                        onCheckedChange={(value) =>
                          handleDefaultChange(credential, value === true)
                        }
                      />
                    ) : (
                      <span className="text-muted-foreground">&mdash;</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Checkbox
                      checked={credential.autoRefreshEnabled}
                      disabled={savingAutoRefresh === credential.id}
                      aria-label={t("autoRefreshAria", {
                        label: credential.label,
                      })}
                      onCheckedChange={(value) =>
                        handleAutoRefreshChange(credential, value === true)
                      }
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("editAria")}
                        onClick={() =>
                          setDialogState({ mode: "edit", credential })
                        }
                      >
                        <Icon
                          name="ri-edit-line"
                          aria-hidden
                          className="text-base"
                        />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("deleteAria")}
                        onClick={() => setDeleteTarget(credential)}
                      >
                        <Icon
                          name="ri-delete-bin-line"
                          aria-hidden
                          className="text-base"
                        />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {dialogState && (
        <ProviderCredentialDialog
          open={dialogState !== null}
          onOpenChange={(open) => !open && setDialogState(null)}
          mode={dialogState.mode}
          existing={dialogState.mode === "edit" ? dialogState.credential : null}
          onSaved={load}
        />
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t("deleteProviderConfirmTitle", {
                label: deleteTarget?.label ?? "",
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteProviderConfirmDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={handleDeleteConfirm}
              disabled={deleting}
            >
              {deleting ? t("deletingLabel") : t("deleteButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  );
}
