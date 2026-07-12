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

// AC-SHELL-001/002/004 (design.md §3.2). Single <nav> landmark hosting the
// seven PRD sections plus Settings (design.md §9 C-1) — below `lg`/1024px
// (src/hooks/use-mobile.ts) the shadcn Sidebar renders this same content in
// an off-canvas Sheet instead of the persistent rail, with no separate
// markup needed.
const SettingsIcon = SETTINGS_NAV_ITEM.icon;

export function AppSidebar({ username }: { username: string }) {
  const pathname = usePathname();
  const isSectionActive = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <span className="px-2 text-sm font-semibold text-sidebar-foreground group-data-[collapsible=icon]:hidden">
          inspot
        </span>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Main navigation">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {SECTION_NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = isSectionActive(item.href);
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={item.label}
                        className={cn(
                          "border-l-2 border-transparent",
                          active && "border-l-2 border-primary",
                        )}
                        render={<Link href={item.href} />}
                      >
                        <Icon aria-hidden className="size-4" />
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
                    render={<Link href={SETTINGS_NAV_ITEM.href} />}
                  >
                    <SettingsIcon aria-hidden className="size-4" />
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
