"use client";

import { useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

import { cn } from "@/lib/utils";
import { setActiveWorkspaceId } from "@/lib/client/active-workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/ui/icon";
import { InspoterIcon } from "@/components/ui/inspoter-logo";
import { StatusIndicator } from "@/components/ui/status-indicator";
import type { SidebarHealth } from "@/lib/services/notification-counts";
import { NavPending } from "./route-progress";
import {
  HELP_NAV_ITEM,
  MANAGEMENT_NAV_ITEM,
  NAV_GROUPS,
  SETTINGS_NAV_ITEM,
  type NavItem,
} from "./nav-items";
import { WorkspaceSwitcher } from "./workspace-switcher";

// Additive nav items rendered below the main sections, in a separate group —
// always visible, never part of Workspace.hiddenSections.
const ADDITIVE_NAV_ITEMS = [SETTINGS_NAV_ITEM, HELP_NAV_ITEM];
const NAV_ITEM_CLASS_NAME = cn(
  "shell-nav-item",
  "group-data-[collapsible=icon]:mx-auto",
  "group-data-[collapsible=icon]:justify-center",
  "group-data-[collapsible=icon]:p-0!",
);

// AC-SHELL-001/002/004 (design.md §3.2). Single <nav> landmark hosting the
// clustered sections plus Settings (design.md §9 C-1) — below `lg`/1024px
// (src/hooks/use-mobile.ts) the shadcn Sidebar renders this same content in
// an off-canvas Sheet instead of the persistent rail, with no separate
// markup needed.

function NavMenuList({
  items,
  hiddenSections,
  isSectionActive,
}: {
  items: NavItem[];
  hiddenSections: string[];
  isSectionActive: (href: string) => boolean;
}) {
  const t = useTranslations("shell");
  return (
    <SidebarMenu>
      {items
        .filter((item) => !item.key || !hiddenSections.includes(item.key))
        .map((item) => {
          const active = isSectionActive(item.href);
          return (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                isActive={active}
                tooltip={t(item.labelKey)}
                data-active={active ? "true" : "false"}
                className={NAV_ITEM_CLASS_NAME}
                render={<Link href={item.href} />}
              >
                <span className="shell-icon-tile">
                  <Icon name={item.icon} />
                </span>
                <span>{t(item.labelKey)}</span>
                <NavPending />
              </SidebarMenuButton>
            </SidebarMenuItem>
          );
        })}
    </SidebarMenu>
  );
}

export function AppSidebar({
  workspaceName,
  workspaceId,
  hiddenSections = [],
  health,
}: {
  workspaceName: string;
  workspaceId: string;
  hiddenSections?: string[];
  health: SidebarHealth;
}) {
  const t = useTranslations("shell");
  const pathname = usePathname();
  const isSectionActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  // Sync the per-tab active workspace id (read by every api.ts fetch
  // wrapper's X-Inspoter-Workspace header) on every render, including the
  // re-render `router.refresh()` triggers after a workspace switch. Runs
  // during render rather than an effect so it's set before any child's
  // effect (e.g. WorkspaceSwitcher's list-fetch on mount) can fire.
  setActiveWorkspaceId(workspaceId);

  const providersVariant =
    health.providersErrored > 0 ? "error" : health.providersOk > 0 ? "success" : "secondary";
  const providersLabel =
    health.providersErrored > 0
      ? t("statusProvidersErrors", { count: health.providersErrored })
      : health.providersOk > 0
        ? t("statusProvidersOk", { count: health.providersOk })
        : t("statusProvidersNone");

  return (
    <Sidebar collapsible="icon" data-workspace-id={workspaceId}>
      <SidebarHeader className="gap-3">
        <div
          role="img"
          aria-label="InSpoter"
          className="flex h-[var(--icon-tile-md)] items-center gap-2 px-2"
        >
          <InspoterIcon aria-hidden className="size-7 shrink-0" />
          <span
            aria-hidden="true"
            className="font-heading text-lg font-bold group-data-[collapsible=icon]:hidden"
          >
            <span className="text-sidebar-foreground">In</span>
            <span className="text-[#e60000]">Spoter</span>
          </span>
        </div>
        <WorkspaceSwitcher
          currentName={workspaceName}
          currentId={workspaceId}
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("mainNavigationLabel")}>
          {/* Management is the workspace home — unclustered and always
              visible, even when an owner hides every configurable section. */}
          <SidebarGroup>
            <SidebarGroupContent>
              <NavMenuList
                items={[MANAGEMENT_NAV_ITEM]}
                hiddenSections={hiddenSections}
                isSectionActive={isSectionActive}
              />
            </SidebarGroupContent>
          </SidebarGroup>

          {NAV_GROUPS.map((group) => (
            <SidebarGroup key={group.labelKey}>
              <SidebarGroupLabel className="text-2xs font-medium uppercase tracking-wide text-foreground-400 group-data-[collapsible=icon]:pointer-events-none">
                {t(group.labelKey)}
              </SidebarGroupLabel>
              <SidebarGroupContent>
                <NavMenuList
                  items={group.items}
                  hiddenSections={hiddenSections}
                  isSectionActive={isSectionActive}
                />
              </SidebarGroupContent>
            </SidebarGroup>
          ))}

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupContent>
              <NavMenuList
                items={ADDITIVE_NAV_ITEMS}
                hiddenSections={hiddenSections}
                isSectionActive={isSectionActive}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      {/* System status summary (design.md §3.2): provider sync health and
          open critical alerts, server-computed in the dashboard layout from
          the same columns the refresh loop maintains. Hidden on the collapsed
          icon rail — a 64px rail has no room for words. */}
      <SidebarFooter className="border-t border-[var(--border-subtle)] group-data-[collapsible=icon]:hidden">
        <div className="px-2 pb-1 pt-2 text-2xs font-medium uppercase tracking-wide text-foreground-400">
          {t("statusSummaryLabel")}
        </div>
        <ul className="flex flex-col gap-1 px-2 pb-2">
          <li>
            <Link
              href="/settings/providers"
              className="flex min-h-6 items-center rounded-md hover:bg-[var(--surface-hover)]"
            >
              <StatusIndicator variant={providersVariant} label={providersLabel} />
            </Link>
          </li>
          <li>
            <Link
              href="/alerts"
              className="flex min-h-6 items-center rounded-md hover:bg-[var(--surface-hover)]"
            >
              <StatusIndicator
                variant={health.openCriticalAlerts > 0 ? "critical" : "success"}
                label={
                  health.openCriticalAlerts > 0
                    ? t("statusCriticalAlertsOpen", {
                        count: health.openCriticalAlerts,
                      })
                    : t("statusCriticalAlertsNone")
                }
              />
            </Link>
          </li>
        </ul>
      </SidebarFooter>
    </Sidebar>
  );
}
