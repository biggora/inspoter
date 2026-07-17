"use client";

import { useTransition } from "react";
import { ChevronDown, LogOut } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { logout } from "@/app/login/actions";

// Top-bar operator menu (design.md §4.2 "operator menu, and Russian logout
// action"). Replaces the former sidebar-footer username + standalone
// LogoutButton with a single dropdown, matching the prototype's topbar
// pattern (specs/prototype/src/components/feature/AppLayout.tsx).
export function OperatorMenu({ username }: { username: string }) {
  const [isPending, startTransition] = useTransition();
  const initial = username.charAt(0).toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex min-h-[var(--control-sm)] items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-foreground hover:bg-[var(--surface-hover)] focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2 focus-visible:ring-0">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary-100">
          <span className="text-xs font-semibold text-primary-700">
            {initial}
          </span>
        </span>
        <span className="hidden font-medium sm:inline">{username}</span>
        <ChevronDown aria-hidden className="size-4 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-1.5 py-1.5">
          <p className="truncate text-sm font-medium text-foreground">
            {username}
          </p>
          <p className="text-xs text-muted-foreground">Оператор</p>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem
            variant="destructive"
            disabled={isPending}
            onClick={() => startTransition(() => logout())}
          >
            <LogOut aria-hidden className="size-4" />
            Выйти
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
