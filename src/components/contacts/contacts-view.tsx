"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/empty-state";
import { FilterBar } from "@/components/ui/filter-bar";
import { Input } from "@/components/ui/input";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import type { ContactBulkAction } from "@/lib/services/contacts";
import {
  contactLabelsApi,
  contactsApi,
  type ContactLabelSummary,
  type ContactListItem,
  type ContactListResult,
} from "./api";
import { ContactsTable } from "./contacts-table";
import { ContactFormDialog } from "./contact-form-dialog";
import { DeleteContactsDialog } from "./delete-contacts-dialog";
import { ExportContactsDialog } from "./export-dialog";
import { ImportContactsDialog } from "./import-dialog";
import { ManageContactLabelsDialog } from "./manage-labels-dialog";
import { ContactsSidebar } from "./contacts-sidebar";
import { contactsListHref, type ContactsFilters } from "./list-params";
import { SelectionToolbar } from "./selection-toolbar";

interface ContactsViewProps {
  result: ContactListResult;
  labels: ContactLabelSummary[];
  filters: ContactsFilters;
}

// The list is server-rendered from the URL: filters and the page number live
// in the query string, so a filtered view is shareable and the browser's back
// button behaves. Mutations go through the API and end in router.refresh(),
// which re-runs the server component — there is no client-held copy of the
// list (the convention set by bookmarks-board.tsx).
export function ContactsView({ result, labels, filters }: ContactsViewProps) {
  const t = useTranslations("contacts");
  const router = useRouter();

  const [searchInput, setSearchInput] = useState(filters.query);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [labelsOpen, setLabelsOpen] = useState(false);
  const [deleteTargets, setDeleteTargets] = useState<ContactListItem[] | null>(
    null,
  );

  // Labels are server-rendered, but the bulk "Add label"/"Remove label" menus
  // and the sidebar read them client-side. A create/edit/delete inside the
  // Manage-labels dialog fires `router.refresh()`, yet that refresh is
  // fire-and-forget and races the dialog close and any later navigation — so
  // the menus would show a stale list until a fresh server payload committed.
  // Holding a local copy (synced from the prop on each server render and
  // re-fetched immediately on change) keeps the menus live without waiting on
  // RSC commit timing.
  const [localLabels, setLocalLabels] = useState(labels);
  const [prevLabels, setPrevLabels] = useState(labels);
  if (labels !== prevLabels) {
    setPrevLabels(labels);
    setLocalLabels(labels);
  }

  async function refreshLabels(): Promise<void> {
    try {
      setLocalLabels(await contactLabelsApi.list());
    } catch {
      // The server refresh below still reconciles the list; a transient fetch
      // failure must not strand the operator in the dialog.
    }
    router.refresh();
  }
  const [busy, setBusy] = useState(false);

  // Both of the reconciliations below adjust state while rendering rather than
  // in an effect (react.dev "adjusting state when a prop changes"): they react
  // to a new server payload, not to an external system, and doing it in an
  // effect would render the stale value once before correcting it.

  // A filter change that came from elsewhere (a sidebar link, the back button)
  // has to win over whatever is in the box.
  const [lastQuery, setLastQuery] = useState(filters.query);
  if (lastQuery !== filters.query) {
    setLastQuery(filters.query);
    setSearchInput(filters.query);
  }

  // Ids that vanished after a refresh must not stay selected — a bulk action
  // on them would silently do nothing.
  const visibleKey = result.contacts.map((contact) => contact.id).join(",");
  const [lastVisibleKey, setLastVisibleKey] = useState(visibleKey);
  if (lastVisibleKey !== visibleKey) {
    setLastVisibleKey(visibleKey);
    if (selected.size > 0) {
      const visible = new Set(result.contacts.map((contact) => contact.id));
      setSelected(new Set([...selected].filter((id) => visible.has(id))));
    }
  }

  // Everything the operator can click is a real link built by
  // contactsListHref; only the debounced search box has to push imperatively,
  // because there is no element to hang the href on.
  useEffect(() => {
    if (searchInput === filters.query) return;
    const handle = setTimeout(
      () =>
        router.push(contactsListHref(filters, { query: searchInput.trim() })),
      300,
    );
    return () => clearTimeout(handle);
    // The href builder closes over `filters`, which only changes with the URL.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const selectedContacts = useMemo(
    () => result.contacts.filter((contact) => selected.has(contact.id)),
    [result.contacts, selected],
  );

  async function runBulk(action: ContactBulkAction): Promise<void> {
    if (selected.size === 0) return;
    setBusy(true);
    try {
      const { affected } = await contactsApi.bulk([...selected], action);
      toast.success(
        action.type === "delete"
          ? t("bulkDeletedToast", { count: affected })
          : t("bulkUpdatedToast", { count: affected }),
      );
      setSelected(new Set());
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStar(contact: ContactListItem): Promise<void> {
    try {
      await contactsApi.bulk([contact.id], {
        type: "star",
        starred: !contact.starred,
      });
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    }
  }

  const totalPages = Math.max(Math.ceil(result.total / result.pageSize), 1);
  const hasFilters =
    filters.query.length > 0 || filters.labelId !== null || filters.starred;

  return (
    <PageBody>
      <PageHeader
        title={t("pageTitle")}
        description={t("count", { count: result.total })}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setImportOpen(true)}
            >
              <Icon
                name="ri-upload-2-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("importButton")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setExportOpen(true)}
            >
              <Icon
                name="ri-download-2-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("exportButton")}
            </Button>
            <Button type="button" onClick={() => setFormOpen(true)}>
              <Icon
                name="ri-user-add-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("newContactButton")}
            </Button>
          </>
        }
      >
        <FilterBar>
          <Input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchLabel")}
            className="sm:max-w-xs"
          />
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSearchInput("");
                router.push("/contacts");
              }}
            >
              {t("resetSearchButton")}
            </Button>
          )}
        </FilterBar>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <ContactsSidebar
          labels={localLabels}
          filters={filters}
          onManageLabels={() => setLabelsOpen(true)}
        />

        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {selected.size > 0 && (
            <SelectionToolbar
              count={selected.size}
              labels={localLabels}
              busy={busy}
              onClear={() => setSelected(new Set())}
              onDelete={() => setDeleteTargets(selectedContacts)}
              onStar={(starred) => runBulk({ type: "star", starred })}
              onAddLabel={(labelId) => runBulk({ type: "addLabel", labelId })}
              onRemoveLabel={(labelId) =>
                runBulk({ type: "removeLabel", labelId })
              }
            />
          )}

          {result.contacts.length === 0 ? (
            <EmptyState
              icon="ri-contacts-book-line"
              title={hasFilters ? t("noResultsTitle") : t("emptyTitle")}
              description={
                hasFilters ? t("noResultsDescription") : t("emptyDescription")
              }
              action={
                hasFilters ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setSearchInput("");
                      router.push("/contacts");
                    }}
                  >
                    {t("resetSearchButton")}
                  </Button>
                ) : (
                  <Button type="button" onClick={() => setFormOpen(true)}>
                    {t("newContactButton")}
                  </Button>
                )
              }
            />
          ) : (
            <>
              <ContactsTable
                contacts={result.contacts}
                filters={filters}
                selected={selected}
                onSelectedChange={setSelected}
                onToggleStar={toggleStar}
                onDelete={(contact) => setDeleteTargets([contact])}
              />
              {totalPages > 1 && (
                <nav
                  aria-label={t("pageTitle")}
                  className="flex items-center justify-between gap-2"
                >
                  {result.page > 1 ? (
                    <Button
                      render={
                        <Link
                          href={contactsListHref(filters, {
                            page: result.page - 1,
                          })}
                        />
                      }
                      nativeButton={false}
                      variant="ghost"
                    >
                      <Icon
                        name="ri-arrow-left-s-line"
                        aria-hidden
                        data-icon="inline-start"
                      />
                      {result.page - 1}
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" disabled>
                      <Icon
                        name="ri-arrow-left-s-line"
                        aria-hidden
                        data-icon="inline-start"
                      />
                    </Button>
                  )}
                  <span className="text-sm text-muted-foreground">
                    {result.page} / {totalPages}
                  </span>
                  {result.page < totalPages ? (
                    <Button
                      render={
                        <Link
                          href={contactsListHref(filters, {
                            page: result.page + 1,
                          })}
                        />
                      }
                      nativeButton={false}
                      variant="ghost"
                    >
                      {result.page + 1}
                      <Icon
                        name="ri-arrow-right-s-line"
                        aria-hidden
                        data-icon="inline-end"
                      />
                    </Button>
                  ) : (
                    <Button type="button" variant="ghost" disabled>
                      <Icon
                        name="ri-arrow-right-s-line"
                        aria-hidden
                        data-icon="inline-end"
                      />
                    </Button>
                  )}
                </nav>
              )}
            </>
          )}
        </div>
      </div>

      <ContactFormDialog
        open={formOpen}
        contact={null}
        labels={localLabels}
        onOpenChange={setFormOpen}
        onSaved={() => {
          toast.success(t("createdToast"));
          router.refresh();
        }}
      />
      <ImportContactsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => router.refresh()}
      />
      <ExportContactsDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        selectedIds={[...selected]}
        filters={filters}
      />
      <ManageContactLabelsDialog
        open={labelsOpen}
        labels={localLabels}
        onOpenChange={setLabelsOpen}
        onChanged={refreshLabels}
      />
      <DeleteContactsDialog
        contacts={deleteTargets}
        onOpenChange={(open) => {
          if (!open) setDeleteTargets(null);
        }}
        onDeleted={() => {
          setSelected(new Set());
          setDeleteTargets(null);
          router.refresh();
        }}
      />
    </PageBody>
  );
}
