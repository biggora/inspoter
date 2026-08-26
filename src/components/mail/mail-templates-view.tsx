"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Link, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import {
  deleteMailTemplate,
  fetchMailTemplate,
  fetchMailTemplateTags,
  patchMailTemplate,
  type MailTemplateDetailDto,
  type MailTemplateListDto,
  type MailTemplateSummaryDto,
  type MailTemplateTagSummaryDto,
} from "./api";
import {
  MailTemplateEditorDialog,
  type TemplateEditorMode,
} from "./mail-template-editor-dialog";
import { ManageTemplateTagsDialog } from "./manage-template-tags-dialog";

export interface MailTemplateFilters {
  query: string;
  tagId: string | null;
  starred: boolean;
  page: number;
}

interface EditorState {
  mode: TemplateEditorMode;
  template: MailTemplateDetailDto | null;
}

export function MailTemplatesView({
  result,
  tags,
  filters,
}: {
  result: MailTemplateListDto;
  tags: MailTemplateTagSummaryDto[];
  filters: MailTemplateFilters;
}) {
  const t = useTranslations("mail");
  const router = useRouter();
  const [searchInput, setSearchInput] = useState(filters.query);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [tagsOpen, setTagsOpen] = useState(false);
  const [localTags, setLocalTags] = useState(tags);
  const [previousTags, setPreviousTags] = useState(tags);
  const [deleteTarget, setDeleteTarget] =
    useState<MailTemplateSummaryDto | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (tags !== previousTags) {
    setPreviousTags(tags);
    setLocalTags(tags);
  }

  function href(patch: Partial<MailTemplateFilters>): string {
    const next = { ...filters, ...patch };
    const params = new URLSearchParams();
    if (next.query) params.set("query", next.query);
    if (next.tagId) params.set("tagId", next.tagId);
    if (next.starred) params.set("starred", "true");
    const page =
      patch.page ??
      (patch.query !== undefined ||
      patch.tagId !== undefined ||
      patch.starred !== undefined
        ? 1
        : next.page);
    if (page > 1) params.set("page", String(page));
    const query = params.toString();
    return query ? `/mail/templates?${query}` : "/mail/templates";
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    router.push(href({ query: searchInput.trim() }));
  }

  async function openEditor(
    mode: TemplateEditorMode,
    template?: MailTemplateSummaryDto,
  ): Promise<void> {
    if (!template) {
      setEditor({ mode, template: null });
      return;
    }
    setBusyId(template.id);
    try {
      setEditor({ mode, template: await fetchMailTemplate(template.id) });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("templateGenericError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggleStar(template: MailTemplateSummaryDto): Promise<void> {
    setBusyId(template.id);
    try {
      await patchMailTemplate(template.id, { starred: !template.starred });
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("templateGenericError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removeTemplate(): Promise<void> {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteMailTemplate(deleteTarget.id);
      toast.success(t("templateDeletedToast"));
      setDeleteTarget(null);
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("templateGenericError"),
      );
    } finally {
      setBusyId(null);
    }
  }

  async function refreshTags(): Promise<void> {
    try {
      setLocalTags(await fetchMailTemplateTags());
    } catch {
      // The server refresh below remains the source of truth.
    }
    router.refresh();
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const hasFilters = Boolean(filters.query || filters.tagId || filters.starred);

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/mail", label: t("backToMailButton") }}
        title={t("templatesPageTitle")}
        description={t("templatesCount", { count: result.total })}
        actions={
          <Button type="button" onClick={() => void openEditor("create")}>
            <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
            {t("newTemplateButton")}
          </Button>
        }
      >
        <FilterBar>
          <form
            onSubmit={submitSearch}
            className="flex w-full gap-2 sm:max-w-md"
          >
            <Input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder={t("templateSearchPlaceholder")}
              aria-label={t("templateSearchLabel")}
            />
            <Button type="submit" variant="outline" size="icon">
              <Icon name="ri-search-line" aria-hidden />
              <span className="sr-only">{t("templateSearchLabel")}</span>
            </Button>
          </form>
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                router.push("/mail/templates");
              }}
            >
              {t("templateResetFilters")}
            </Button>
          )}
        </FilterBar>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-56 lg:shrink-0">
          <nav
            aria-label={t("templatesPageTitle")}
            className="flex gap-1 overflow-x-auto pb-1 lg:flex-col"
          >
            <TemplateNavLink
              href={href({ starred: false, tagId: null })}
              icon="ri-file-copy-2-line"
              label={t("templatesAll")}
              active={!filters.starred && !filters.tagId}
            />
            <TemplateNavLink
              href={href({ starred: true, tagId: null })}
              icon="ri-star-line"
              label={t("templatesStarred")}
              active={filters.starred}
            />
          </nav>
          <div className="mt-4">
            <div className="flex items-center justify-between px-3">
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {t("templateTagsTitle")}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={t("manageTemplateTagsButton")}
                onClick={() => setTagsOpen(true)}
              >
                <Icon name="ri-settings-3-line" aria-hidden />
              </Button>
            </div>
            {localTags.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {t("noTemplateTags")}
              </p>
            ) : (
              <nav
                aria-label={t("templateTagsTitle")}
                className="mt-1 flex flex-col"
              >
                {localTags.map((tag) => (
                  <Link
                    key={tag.id}
                    href={href({ tagId: tag.id, starred: false })}
                    className={navClasses(filters.tagId === tag.id)}
                  >
                    <LabelChip label={tag} className="max-w-32" />
                    <span className="ml-auto text-xs text-muted-foreground">
                      {tag.templateCount}
                    </span>
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </aside>

        <section
          className="min-w-0 flex-1"
          aria-label={t("templatesPageTitle")}
        >
          {result.items.length === 0 ? (
            <EmptyState
              icon="ri-file-copy-2-line"
              title={
                hasFilters
                  ? t("templateNoResultsTitle")
                  : t("templateEmptyTitle")
              }
              description={
                hasFilters
                  ? t("templateNoResultsDescription")
                  : t("templateEmptyDescription")
              }
              action={
                hasFilters ? (
                  <Button
                    variant="outline"
                    onClick={() => router.push("/mail/templates")}
                  >
                    {t("templateResetFilters")}
                  </Button>
                ) : (
                  <Button onClick={() => void openEditor("create")}>
                    {t("newTemplateButton")}
                  </Button>
                )
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {result.items.map((template) => (
                <article
                  key={template.id}
                  className="flex min-h-56 flex-col rounded-xl border border-background-200 bg-background-50 p-4"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="truncate font-semibold">
                        {template.name}
                      </h2>
                      <p className="mt-1 truncate text-sm text-muted-foreground">
                        {template.subject || t("templateNoSubject")}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === template.id}
                      aria-label={t(
                        template.starred
                          ? "templateUnstarButton"
                          : "templateStarButton",
                        { name: template.name },
                      )}
                      onClick={() => void toggleStar(template)}
                    >
                      <Icon
                        name={
                          template.starred ? "ri-star-fill" : "ri-star-line"
                        }
                        className={
                          template.starred ? "text-amber-500" : undefined
                        }
                        aria-hidden
                      />
                    </Button>
                  </div>
                  <p className="mt-4 line-clamp-4 whitespace-pre-line text-sm text-muted-foreground">
                    {template.bodyText}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4">
                    {template.tags.map((tag) => (
                      <LabelChip key={tag.id} label={tag} />
                    ))}
                  </div>
                  <div className="mt-4 flex justify-end gap-1 border-t border-background-100 pt-3">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === template.id}
                      aria-label={t("templateDuplicateButton", {
                        name: template.name,
                      })}
                      onClick={() => void openEditor("duplicate", template)}
                    >
                      <Icon name="ri-file-copy-line" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === template.id}
                      aria-label={t("templateEditButton", {
                        name: template.name,
                      })}
                      onClick={() => void openEditor("edit", template)}
                    >
                      <Icon name="ri-pencil-line" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      disabled={busyId === template.id}
                      aria-label={t("templateDeleteButton", {
                        name: template.name,
                      })}
                      onClick={() => setDeleteTarget(template)}
                    >
                      <Icon name="ri-delete-bin-line" aria-hidden />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <nav
              className="mt-6 flex items-center justify-between"
              aria-label={t("templatesPageTitle")}
            >
              <Button
                variant="ghost"
                disabled={result.page <= 1}
                onClick={() => router.push(href({ page: result.page - 1 }))}
              >
                <Icon name="ri-arrow-left-s-line" aria-hidden />
                {result.page - 1 > 0 ? result.page - 1 : ""}
              </Button>
              <span className="text-sm text-muted-foreground">
                {result.page} / {totalPages}
              </span>
              <Button
                variant="ghost"
                disabled={result.page >= totalPages}
                onClick={() => router.push(href({ page: result.page + 1 }))}
              >
                {result.page + 1 <= totalPages ? result.page + 1 : ""}
                <Icon name="ri-arrow-right-s-line" aria-hidden />
              </Button>
            </nav>
          )}
        </section>
      </div>

      <MailTemplateEditorDialog
        open={editor !== null}
        mode={editor?.mode ?? "create"}
        template={editor?.template ?? null}
        tags={localTags}
        onOpenChange={(open) => {
          if (!open) setEditor(null);
        }}
        onSaved={() => router.refresh()}
      />
      <ManageTemplateTagsDialog
        open={tagsOpen}
        tags={localTags}
        onOpenChange={setTagsOpen}
        onChanged={() => void refreshTags()}
      />
      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("templateDeleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("templateDeleteDescription", {
                name: deleteTarget?.name ?? "",
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={removeTemplate}>
              {t("templateDeleteConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageBody>
  );
}

function TemplateNavLink({
  href,
  icon,
  label,
  active,
}: {
  href: string;
  icon: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link href={href} className={navClasses(active)}>
      <Icon name={icon} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function navClasses(active: boolean): string {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm whitespace-nowrap transition-colors",
    active
      ? "bg-background-100 font-medium text-foreground"
      : "text-muted-foreground hover:bg-background-50 hover:text-foreground",
  );
}
