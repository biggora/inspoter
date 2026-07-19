"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { setActiveWorkspaceId } from "@/lib/client/active-workspace";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { Icon } from "@/components/ui/icon";
import { SECTION_NAV_ITEMS, SETTINGS_NAV_ITEM } from "./nav-items";
import { WorkspaceSwitcher } from "./workspace-switcher";

// AC-SHELL-001/002/004 (design.md §3.2). Single <nav> landmark hosting the
// seven PRD sections plus Settings (design.md §9 C-1) — below `lg`/1024px
// (src/hooks/use-mobile.ts) the shadcn Sidebar renders this same content in
// an off-canvas Sheet instead of the persistent rail, with no separate
// markup needed.

export function AppSidebar({
  workspaceName,
  workspaceId,
}: {
  workspaceName: string;
  workspaceId: string;
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

  return (
    <Sidebar collapsible="icon" data-workspace-id={workspaceId}>
      <SidebarHeader className="gap-3">
        <div
          role="img"
          aria-label="Inspot"
          className="flex h-[var(--icon-tile-md)] items-center px-2"
        >
          <span
            aria-hidden="true"
            className="font-heading text-lg font-bold text-sidebar-foreground group-data-[collapsible=icon]:hidden"
          >
            Inspot
          </span>
          <span
            aria-hidden="true"
            className="hidden size-8 items-center justify-center rounded-md bg-primary-100 font-heading text-sm font-bold text-primary-700 group-data-[collapsible=icon]:inline-flex"
          >
            In
          </span>
        </div>
        <WorkspaceSwitcher
          currentName={workspaceName}
          currentId={workspaceId}
        />
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label={t("mainNavigationLabel")}>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTION_NAV_ITEMS.map((item) => {
                  const active = isSectionActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={t(item.labelKey)}
                        data-active={active ? "true" : "false"}
                        className="shell-nav-item"
                        render={<Link href={item.href} />}
                      >
                        <span className="shell-icon-tile">
                          <Icon name={item.icon} />
                        </span>
                        <span>{t(item.labelKey)}</span>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarSeparator />

          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={isSectionActive(SETTINGS_NAV_ITEM.href)}
                    tooltip={t(SETTINGS_NAV_ITEM.labelKey)}
                    data-active={
                      isSectionActive(SETTINGS_NAV_ITEM.href) ? "true" : "false"
                    }
                    className="shell-nav-item"
                    render={<Link href={SETTINGS_NAV_ITEM.href} />}
                  >
                    <span className="shell-icon-tile">
                      <i
                        aria-hidden="true"
                        className={cn(
                          SETTINGS_NAV_ITEM.icon,
                          "text-base leading-none",
                        )}
                      />
                    </span>
                    <span>{t(SETTINGS_NAV_ITEM.labelKey)}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  );
}
