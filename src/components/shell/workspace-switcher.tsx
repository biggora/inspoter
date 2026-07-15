"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { toast } from "sonner";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/generated/prisma/client";
import { ApiError, workspacesApi } from "@/components/workspace/api";

interface WorkspaceSwitcherProps {
  currentName: string;
  currentId: string;
}

// Sidebar-header workspace switcher: lists every workspace the operator is a
// member of and lets them switch active workspace, or create a new one, from
// a single dropdown (task spec: "Workspace Switcher"). Mirrors the Bookmarks
// dialogs' fetch-then-`router.refresh()` pattern — no client-held list state
// beyond what this dropdown fetched for itself.
export function WorkspaceSwitcher({
  currentName,
  currentId,
}: WorkspaceSwitcherProps) {
  const router = useRouter();
  const nameId = useId();

  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workspacesApi
      .list()
      .then((data) => {
        if (!cancelled) setWorkspaces(data);
      })
      .catch(() => {
        if (!cancelled) toast.error("Не удалось загрузить рабочие пространства.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSwitch(workspaceId: string) {
    if (workspaceId === currentId || switchingId) return;
    setSwitchingId(workspaceId);
    try {
      await workspacesApi.switchTo(workspaceId);
      router.refresh();
    } catch {
      toast.error("Не удалось переключить рабочее пространство. Попробуйте снова.");
    } finally {
      setSwitchingId(null);
    }
  }

  function openCreate() {
    setName("");
    setError(null);
    setCreateOpen(true);
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Название рабочего пространства обязательно.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const workspace = await workspacesApi.create(trimmed);
      toast.success("Рабочее пространство создано.");
      setCreateOpen(false);
      await handleSwitch(workspace.id);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError
            ? err.message
            : "Не удалось создать рабочее пространство.",
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-full justify-between px-2 group-data-[collapsible=icon]:hidden",
          )}
        >
          <span className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground">
            {currentName}
          </span>
          <ChevronsUpDown
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--anchor-width) min-w-56"
        >
          {workspaces === null ? (
            <div className="px-1.5 py-1 text-sm text-muted-foreground">
              Загрузка…
            </div>
          ) : (
            workspaces.map((workspace) => (
              <DropdownMenuItem
                key={workspace.id}
                disabled={switchingId !== null}
                onClick={() => handleSwitch(workspace.id)}
              >
                <span className="min-w-0 flex-1 truncate">
                  {workspace.name}
                </span>
                {workspace.id === currentId && (
                  <Check aria-hidden className="size-4" />
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={openCreate}>
            <Plus aria-hidden className="size-4" />
            Создать рабочее пространство
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Создать рабочее пространство</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleCreate}
            noValidate
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={nameId}>Название</Label>
              <Input
                id={nameId}
                value={name}
                onChange={(event) => setName(event.target.value)}
                aria-required="true"
                aria-invalid={error ? true : undefined}
                autoFocus
              />
              {error && <p className="text-sm text-(--error-text)">{error}</p>}
            </div>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                Отмена
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? "Создание…" : "Создать"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
