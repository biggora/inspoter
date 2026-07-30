"use client";

import { startTransition, useEffect, useOptimistic, useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Link, useRouter } from "@/i18n/navigation";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { cn } from "@/lib/utils";
import type { Dashboard, DashboardWidget } from "@/generated/prisma/client";
import type { GridItem } from "@/lib/dashboards/grid";
import type { WidgetDataMap } from "@/lib/dashboards/widget-payloads";
import type { WidgetTargets } from "@/lib/services/dashboard-widget-targets";
import type { DashboardWithWidgets } from "@/lib/services/dashboards";
import { dashboardsApi, widgetsApi } from "./api";
import { DashboardGrid, type DashboardGridEntry } from "./dashboard-grid";
import { DashboardDialog, type DashboardDialogState } from "./dashboard-dialog";
import { DashboardWidgetFrame } from "./dashboard-widget-frame";
import { DeleteDashboardDialog } from "./delete-dashboard-dialog";
import { WidgetConfigDialog } from "./widget-config-dialog";
import { WidgetPickerDialog } from "./widget-picker-dialog";
import { catalogEntry } from "./widget-catalog";
import { WidgetBody } from "./widgets/widget-body";

// How often the board re-reads its widget payloads. One request per dashboard,
// paused while the tab is hidden — a dashboard left open on a wall display
// should stay current, but a backgrounded tab should not keep polling.
const REFRESH_INTERVAL_MS = 60_000;

interface DashboardViewProps {
  dashboard: DashboardWithWidgets;
  dashboards: Dashboard[];
  widgetData: WidgetDataMap;
  targets: WidgetTargets;
}

// A widget's stored config is validated server-side; here it is only read for
// the optional custom title.
function widgetTitle(widget: DashboardWidget): string | undefined {
  const config = widget.config as { title?: unknown } | null;
  return typeof config?.title === "string" ? config.title : undefined;
}

function applyLayout(
  widgets: DashboardWidget[],
  layout: GridItem[],
): DashboardWidget[] {
  const byId = new Map(layout.map((item) => [item.id, item]));
  return widgets.map((widget) => {
    const placed = byId.get(widget.id);
    return placed ? { ...widget, ...placed } : widget;
  });
}

export function DashboardView({
  dashboard,
  dashboards,
  widgetData,
  targets,
}: DashboardViewProps) {
  const t = useTranslations("dashboards");
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [dashboardDialog, setDashboardDialog] =
    useState<DashboardDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Dashboard | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [configTarget, setConfigTarget] = useState<DashboardWidget | null>(
    null,
  );

  // Widget payloads refresh on a timer without a full page re-render, so a
  // dashboard shows current data while the operator is reading it. The layout
  // and the widget list still come from the server component.
  const [liveData, setLiveData] = useState(widgetData);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  const [prevWidgetData, setPrevWidgetData] = useState(widgetData);
  if (widgetData !== prevWidgetData) {
    setPrevWidgetData(widgetData);
    setLiveData(widgetData);
  }

  // Drag and resize must repaint the instant the pointer settles; a server
  // round-trip cannot. `optimisticWidgets` resets to the prop as soon as
  // router.refresh() delivers real rows, and reverts if the save fails.
  const [optimisticWidgets, applyOptimisticLayout] = useOptimistic(
    dashboard.widgets,
    applyLayout,
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const result = await dashboardsApi.fetchData(dashboard.id);
        setLiveData(result.widgetData);
        setRefreshedAt(new Date());
      } catch {
        // A failed poll is not worth a toast: the tile keeps its last value and
        // the next tick tries again.
      }
    }, REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [dashboard.id]);

  function persistLayout(layout: GridItem[]) {
    startTransition(async () => {
      applyOptimisticLayout(layout);
      try {
        await dashboardsApi.saveLayout(dashboard.id, layout);
      } catch {
        toast.error(t("layoutError"));
      }
      router.refresh();
    });
  }

  async function handleSetDefault() {
    try {
      await dashboardsApi.setDefault(dashboard.id);
      toast.success(t("setDefaultSuccess"));
      router.refresh();
    } catch {
      toast.error(t("setDefaultError"));
    }
  }

  const entries: DashboardGridEntry[] = optimisticWidgets.map((widget) => ({
    id: widget.id,
    x: widget.x,
    y: widget.y,
    w: widget.w,
    h: widget.h,
    kind: widget.kind,
    title: widgetTitle(widget) ?? t(catalogEntry(widget.kind).titleKey),
    render: (dragHandle) => (
      <DashboardWidgetFrame
        kind={widget.kind}
        title={widgetTitle(widget)}
        dragHandle={dragHandle}
        editing={editing}
        onConfigure={() => setConfigTarget(widget)}
        onRemove={() => handleRemoveWidget(widget)}
      >
        <WidgetBody widget={widget} payload={liveData[widget.id]} />
      </DashboardWidgetFrame>
    ),
  }));

  async function handleRemoveWidget(widget: DashboardWidget) {
    try {
      await widgetsApi.remove(dashboard.id, widget.id);
      router.refresh();
    } catch {
      toast.error(t("widgetRemoveError"));
    }
  }

  return (
    <PageBody>
      <PageHeader
        title={dashboard.name}
        description={
          refreshedAt
            ? t("updatedAt", {
                time: refreshedAt.toLocaleTimeString(),
              })
            : undefined
        }
        actions={
          <>
            {editing && (
              <Button variant="outline" onClick={() => setPickerOpen(true)}>
                <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
                {t("addWidgetButton")}
              </Button>
            )}
            <Button
              variant={editing ? "default" : "outline"}
              onClick={() => setEditing((current) => !current)}
            >
              <Icon
                name={editing ? "ri-check-line" : "ri-edit-line"}
                aria-hidden
                data-icon="inline-start"
              />
              {editing ? t("editDoneButton") : t("editButton")}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button type="button" variant="ghost" size="icon" />}
                aria-label={t("dashboardMenuLabel")}
              >
                <Icon name="ri-more-2-line" aria-hidden />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onClick={() => setDashboardDialog({ mode: "create" })}
                  >
                    {t("newDashboardButton")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() =>
                      setDashboardDialog({ mode: "rename", dashboard })
                    }
                  >
                    {t("renameAction")}
                  </DropdownMenuItem>
                  {!dashboard.isDefault && (
                    <DropdownMenuItem onClick={handleSetDefault}>
                      {t("setDefaultAction")}
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => setDeleteTarget(dashboard)}
                  >
                    {t("deleteAction")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        {dashboards.length > 1 && (
          <nav aria-label={t("tabsLabel")} className="flex flex-wrap gap-1.5">
            {dashboards.map((entry) => {
              const active = entry.id === dashboard.id;
              return (
                <Button
                  key={entry.id}
                  render={<Link href={`/dashboards/${entry.id}`} />}
                  nativeButton={false}
                  variant={active ? "secondary" : "ghost"}
                  size="sm"
                  aria-current={active ? "page" : undefined}
                  className={cn(active && "font-medium")}
                >
                  {entry.name}
                  {entry.isDefault && (
                    <Icon
                      name="ri-home-4-line"
                      aria-label={t("defaultBadge")}
                      aria-hidden={false}
                      className="text-muted-foreground"
                    />
                  )}
                </Button>
              );
            })}
          </nav>
        )}
      </PageHeader>

      {editing && (
        <p className="text-xs text-muted-foreground">
          <span className="hidden sm:inline">{t("editHintDesktop")}</span>
          <span className="sm:hidden">{t("editHintMobile")}</span>
        </p>
      )}

      {optimisticWidgets.length === 0 ? (
        <EmptyState
          icon="ri-layout-grid-line"
          title={t("emptyBoardTitle")}
          description={t("emptyBoardDescription")}
          action={
            <Button onClick={() => setPickerOpen(true)}>
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addFirstWidgetButton")}
            </Button>
          }
        />
      ) : (
        <DashboardGrid
          items={entries}
          editable={editing}
          onLayoutChange={persistLayout}
          renderResizeHandle={(item, handlers) => (
            <ResizeHandle
              label={t("resizeHandleLabel", {
                widget: t(catalogEntry(item.kind).titleKey),
              })}
              onResizeStart={handlers.onResizeStart}
              onResizeStep={handlers.onResizeStep}
            />
          )}
        />
      )}

      <DashboardDialog
        state={dashboardDialog}
        onOpenChange={(open) => !open && setDashboardDialog(null)}
        onSaved={(saved) => {
          const created = dashboardDialog?.mode === "create";
          setDashboardDialog(null);
          if (created) router.push(`/dashboards/${saved.id}`);
          else router.refresh();
        }}
      />
      <DeleteDashboardDialog
        dashboard={deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onDeleted={() => {
          setDeleteTarget(null);
          // Let the section index decide where to go next: another dashboard if
          // one is left, the create prompt otherwise.
          router.push("/dashboards");
        }}
      />
      <WidgetPickerDialog
        dashboardId={dashboard.id}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdded={(widget) => {
          setPickerOpen(false);
          // Open the new tile's settings right away: a widget that needs input
          // to be useful (weather coordinates, a bookmark category) should ask
          // for it now rather than sit on the board as an error card.
          setConfigTarget(widget);
          router.refresh();
        }}
      />
      <WidgetConfigDialog
        dashboardId={dashboard.id}
        widget={configTarget}
        targets={targets}
        onOpenChange={(open) => !open && setConfigTarget(null)}
        onSaved={() => {
          setConfigTarget(null);
          router.refresh();
        }}
      />
    </PageBody>
  );
}
