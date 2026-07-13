"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from "@/components/ui/sidebar";
import { SECTION_NAV_ITEMS, SETTINGS_NAV_ITEM } from "./nav-items";
import { LogoutButton } from "./logout-button";
import { WorkspaceSwitcher } from "./workspace-switcher";

// AC-SHELL-001/002/004 (design.md §3.2). Single <nav> landmark hosting the
// seven PRD sections plus Settings (design.md §9 C-1) — below `lg`/1024px
// (src/hooks/use-mobile.ts) the shadcn Sidebar renders this same content in
// an off-canvas Sheet instead of the persistent rail, with no separate
// markup needed.

export function AppSidebar({
  username,
  workspaceName,
  workspaceId,
}: {
  username: string;
  workspaceName: string;
  workspaceId: string;
}) {
  const pathname = usePathname();
  const isSectionActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3">
        <div
          role="img"
          aria-label="Inspot"
          className="flex h-8 items-center px-2"
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
        <nav aria-label="Основная навигация">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTION_NAV_ITEMS.map((item) => {
                  const active = isSectionActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        data-active={active ? "true" : "false"}
                        className="shell-nav-item"
                        render={<Link href={item.href} />}
                      >
                        <span className="shell-icon-tile">
                          <i
                            aria-hidden="true"
                            className={cn(item.icon, "text-base leading-none")}
                          />
                        </span>
                        <span>{item.label}</span>
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
                    tooltip={SETTINGS_NAV_ITEM.label}
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
                    <span>{SETTINGS_NAV_ITEM.label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-1 py-1 group-data-[collapsible=icon]:justify-center">
          <span className="min-w-0 truncate text-sm text-sidebar-foreground group-data-[collapsible=icon]:hidden">
            {username}
          </span>
          <LogoutButton />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
