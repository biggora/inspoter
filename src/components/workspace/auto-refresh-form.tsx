"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Spinner } from "@/components/ui/spinner";
import { SECTION_NAV_ITEMS } from "@/components/shell/nav-items";
import { ApiError, workspacesApi } from "./api";

interface AutoRefreshFormProps {
  workspaceId: string;
  disabledKinds: string[];
}

// Snapshot kind -> the nav item it belongs to, so the labels and icons here
// stay the ones the sidebar already uses.
const SECTION_KEY_BY_KIND: Array<{ kind: string; sectionKey: string }> = [
  { kind: "DNS_ZONES", sectionKey: "domains" },
  { kind: "HOSTING_ACCOUNTS", sectionKey: "hosting" },
  { kind: "SERVERS", sectionKey: "servers" },
];

const SECTIONS = SECTION_KEY_BY_KIND.flatMap(({ kind, sectionKey }) => {
  const item = SECTION_NAV_ITEMS.find((navItem) => navItem.key === sectionKey);
  return item ? [{ kind, icon: item.icon, labelKey: item.labelKey }] : [];
});

// Section-wide switch for the background provider-listing refresh. Each
// checkbox is checked when the section refreshes automatically (i.e. its kind
// is not in the disabled set) — same inverted-storage shape as
// section-visibility-form.tsx, whose mutate-then-router.refresh() pattern this
// follows.
//
// Switching a section off freezes its data; it never empties it. The manual
// refresh button on the section itself and the very first fetch still reach
// the provider.
export function AutoRefreshForm({
  workspaceId,
  disabledKinds,
}: AutoRefreshFormProps) {
  const t = useTranslations("workspace");
  const tShell = useTranslations("shell");
  const router = useRouter();
  const idPrefix = useId();

  const initialDisabled = useMemo(
    () => new Set(disabledKinds),
    [disabledKinds],
  );
  const [disabled, setDisabled] = useState<Set<string>>(initialDisabled);
  const [submitting, setSubmitting] = useState(false);

  const dirty = useMemo(() => {
    if (disabled.size !== initialDisabled.size) return true;
    for (const kind of disabled) {
      if (!initialDisabled.has(kind)) return true;
    }
    return false;
  }, [disabled, initialDisabled]);

  function setEnabled(kind: string, enabled: boolean) {
    setDisabled((prev) => {
      const next = new Set(prev);
      if (enabled) {
        next.delete(kind);
      } else {
        next.add(kind);
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await workspacesApi.setAutoRefresh(workspaceId, [...disabled]);
      toast.success(t("autoRefreshSavedToast"));
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("autoRefreshSaveError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3">
        {SECTIONS.map((section) => {
          const fieldId = `${idPrefix}-${section.kind}`;
          return (
            <Field key={section.kind} orientation="horizontal">
              <Checkbox
                id={fieldId}
                checked={!disabled.has(section.kind)}
                onCheckedChange={(value) =>
                  setEnabled(section.kind, value === true)
                }
              />
              <FieldLabel
                htmlFor={fieldId}
                className="flex cursor-pointer items-center gap-2 font-normal"
              >
                <Icon name={section.icon} className="text-muted-foreground" />
                {tShell(section.labelKey)}
              </FieldLabel>
            </Field>
          );
        })}
      </FieldGroup>
      <div>
        <Button type="submit" disabled={submitting || !dirty}>
          {submitting ? (
            <>
              <Spinner data-icon="inline-start" aria-hidden />
              {t("savingButton")}
            </>
          ) : (
            t("saveChangesButton")
          )}
        </Button>
      </div>
    </form>
  );
}
