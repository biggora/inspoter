"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { useLinkStatus } from "next/link";
import { useTranslations } from "next-intl";
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { Workspace } from "@/generated/prisma/client";
import { ApiError, workspacesApi } from "@/components/workspace/api";

interface WorkspaceSwitcherProps {
  currentName: string;
  currentId: string;
}

// Rendered inside each workspace link: Next reports the link's navigation as
// pending until the target page renders, and the whole shell then remounts.
function SwitchPending() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner aria-hidden className="shrink-0" /> : null;
}

// Sidebar-header workspace switcher: lists every workspace the operator is a
// member of and links each one to the same section of that workspace
// (`/w/<slug>/<section>`, design.md §4.2), or creates a new one, from a single
// dropdown (task spec: "Workspace Switcher"). The workspace lives in the URL,
// so switching only navigates this tab and entries open in a new tab like any
// link. No client-held list state beyond what this dropdown fetched for itself.
export function WorkspaceSwitcher({
  currentName,
  currentId,
}: WorkspaceSwitcherProps) {
  const t = useTranslations("shell");
  const router = useRouter();
  // Section root of the page being viewed (`/notes/42` -> `/notes`); the
  // wrapper's usePathname already strips `/w/<slug>`.
  const section = usePathname().split("/")[1];
  const sectionRoot = `/${section || "management"}`;
  const nameId = useId();
  const errorId = useId();

  const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    workspacesApi
      .list()
      .then((data) => {
        if (!cancelled) {
          setWorkspaces(data.workspaces);
          setDefaultId(data.defaultWorkspaceId);
        }
      })
      .catch(() => {
        if (!cancelled) toast.error(t("loadWorkspacesError"));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  // A plain click on another workspace keeps the menu open so its pending
  // spinner stays visible until the shell remounts on the new workspace. A
  // click on the current workspace (no remount) or a modified/middle click
  // (the browser opens a new tab) leaves this tab where it is, so close.
  function closeUnlessSwitching(event: React.MouseEvent, workspaceId: string) {
    const modified =
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey;
    if (modified || workspaceId === currentId) setMenuOpen(false);
  }

  async function handleToggleDefault(workspaceId: string) {
    const isDefault = defaultId === workspaceId;
    try {
      if (isDefault) {
        await workspacesApi.clearDefault();
        setDefaultId(null);
      } else {
        await workspacesApi.setDefault(workspaceId);
        setDefaultId(workspaceId);
      }
      toast.success(t("defaultWorkspaceSet"));
    } catch {
      toast.error(t("defaultWorkspaceError"));
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
      setError(t("createWorkspaceNameRequired"));
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const workspace = await workspacesApi.create(trimmed);
      toast.success(t("workspaceCreated"));
      setCreateOpen(false);
      router.push(`/w/${workspace.slug}/management`);
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors?.name) {
        setError(err.fieldErrors.name);
      } else {
        toast.error(
          err instanceof ApiError ? err.message : t("createWorkspaceError"),
        );
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          data-workspace-id={currentId}
          aria-label={t("workspaceLabel", { name: currentName })}
          className={cn(
            buttonVariants({ variant: "ghost" }),
            "w-full justify-between px-2 group-data-[collapsible=icon]:hidden",
          )}
        >
          <span className="min-w-0 truncate text-sm font-semibold text-sidebar-foreground">
            {currentName}
          </span>
          <Icon
            name="ri-expand-up-down-line"
            aria-hidden
            className="shrink-0 text-muted-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-(--anchor-width) min-w-56"
        >
          {workspaces === null ? (
            <div className="px-1.5 py-1 text-sm text-muted-foreground">
              {t("loadingWorkspaces")}
            </div>
          ) : (
            <DropdownMenuGroup>
              {workspaces.map((workspace) => (
                // The default-workspace star is a sibling menu item, not a
                // child of the link: interactive content must not nest in <a>.
                <div
                  key={workspace.id}
                  role="presentation"
                  className="flex items-center gap-0.5"
                >
                  <DropdownMenuItem
                    aria-label={workspace.name}
                    className="min-w-0 flex-1"
                    closeOnClick={false}
                    onClick={(event) =>
                      closeUnlessSwitching(event, workspace.id)
                    }
                    // A middle click fires auxclick, not click.
                    onAuxClick={(event) =>
                      closeUnlessSwitching(event, workspace.id)
                    }
                    render={
                      <Link
                        href={`/w/${workspace.slug}${sectionRoot}`}
                        prefetch={false}
                      />
                    }
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {workspace.name}
                    </span>
                    {workspace.id === currentId && (
                      <Icon name="ri-check-line" aria-hidden />
                    )}
                    <SwitchPending />
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    aria-label={
                      defaultId === workspace.id
                        ? t("removeDefaultWorkspace")
                        : t("setDefaultWorkspace")
                    }
                    closeOnClick={false}
                    onClick={() => handleToggleDefault(workspace.id)}
                    className="size-7 shrink-0 justify-center p-0 text-muted-foreground"
                  >
                    <Icon
                      name="ri-star-line"
                      aria-hidden
                      className={cn(
                        defaultId === workspace.id && "text-amber-500",
                      )}
                    />
                  </DropdownMenuItem>
                </div>
              ))}
            </DropdownMenuGroup>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={openCreate}>
              <Icon name="ri-add-line" aria-hidden />
              {t("createWorkspace")}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("createWorkspace")}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={handleCreate}
            noValidate
            className="flex flex-col gap-4"
          >
            <FieldGroup>
              <Field data-invalid={!!error || undefined}>
                <FieldLabel htmlFor={nameId}>
                  {t("workspaceNameFieldLabel")}
                </FieldLabel>
                <Input
                  id={nameId}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  aria-required="true"
                  aria-invalid={!!error || undefined}
                  aria-describedby={error ? errorId : undefined}
                  autoFocus
                />
                <FieldError id={errorId}>{error}</FieldError>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <DialogClose render={<Button variant="outline" type="button" />}>
                {t("cancel")}
              </DialogClose>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Spinner data-icon="inline-start" aria-hidden />
                    {t("creating")}
                  </>
                ) : (
                  t("create")
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
