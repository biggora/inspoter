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

interface SectionVisibilityFormProps {
  workspaceId: string;
  hiddenSections: string[];
}

// Section visibility (workspace-section-visibility). Owner-only per-workspace
// setting. Each checkbox is checked when the section is VISIBLE (i.e. its key
// is not in the hidden set). Follows rename-workspace-form.tsx's
// mutate-then-`router.refresh()` pattern so the sidebar (rendered in the
// dashboard layout) picks up the change without a full reload.
export function SectionVisibilityForm({
  workspaceId,
  hiddenSections,
}: SectionVisibilityFormProps) {
  const t = useTranslations("workspace");
  const tShell = useTranslations("shell");
  const router = useRouter();
  const idPrefix = useId();

  const initialHidden = useMemo(
    () => new Set(hiddenSections),
    [hiddenSections],
  );
  const [hidden, setHidden] = useState<Set<string>>(initialHidden);
  const [submitting, setSubmitting] = useState(false);

  const dirty = useMemo(() => {
    if (hidden.size !== initialHidden.size) return true;
    for (const key of hidden) {
      if (!initialHidden.has(key)) return true;
    }
    return false;
  }, [hidden, initialHidden]);

  function setVisible(key: string, visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await workspacesApi.setSections(workspaceId, [...hidden]);
      toast.success(t("sectionsSavedToast"));
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof ApiError ? err.message : t("sectionsSaveError"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <FieldGroup className="gap-3">
        {SECTION_NAV_ITEMS.map((item) => {
          const key = item.key as string;
          const fieldId = `${idPrefix}-${key}`;
          return (
            <Field key={key} orientation="horizontal">
              <Checkbox
                id={fieldId}
                checked={!hidden.has(key)}
                onCheckedChange={(value) => setVisible(key, value === true)}
              />
              <FieldLabel
                htmlFor={fieldId}
                className="flex cursor-pointer items-center gap-2 font-normal"
              >
                <Icon name={item.icon} className="text-muted-foreground" />
                {tShell(item.labelKey)}
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
