"use client";

import { useTransition } from "react";
import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { logout } from "@/app/login/actions";

// AC-AUTH-004 UI (design.md §3.2.3). Rendered as a directly visible, always
// -clickable button (not tucked behind a dropdown menu) — with the Slice 1
// theme toggle deferred (design.md §3.2.3 "*"), Log out is the sidebar
// footer's only action, so a menu would add a click with no benefit
// (Simplicity First). Calls the `logout` Server Action directly (not via a
// <form action>) so it can run inside a transition and disable itself
// while pending.
export function LogoutButton() {
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label="Log out"
      disabled={isPending}
      onClick={() => startTransition(() => logout())}
    >
      <LogOut aria-hidden className="size-4" />
    </Button>
  );
}
