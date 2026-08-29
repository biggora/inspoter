"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import { Spinner } from "@/components/ui/spinner";
import { Link } from "@/i18n/navigation";
import {
  applyMailTemplateVariables,
  type AppliedMailTemplate,
} from "@/lib/mail-template-variables";
import {
  fetchMailTemplate,
  fetchMailTemplates,
  type MailTemplateDetailDto,
  type MailTemplateSummaryDto,
} from "./api";

export function MailTemplatePickerDialog({
  open,
  hasExistingContent,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  hasExistingContent: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (template: AppliedMailTemplate) => void;
}) {
  return open ? (
    <TemplatePicker
      hasExistingContent={hasExistingContent}
      onOpenChange={onOpenChange}
      onApply={onApply}
    />
  ) : null;
}

function TemplatePicker({
  hasExistingContent,
  onOpenChange,
  onApply,
}: Omit<Parameters<typeof MailTemplatePickerDialog>[0], "open">) {
  const t = useTranslations("mail");
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<MailTemplateSummaryDto[]>([]);
  const [selected, setSelected] = useState<MailTemplateDetailDto | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, setPending] = useState<AppliedMailTemplate | null>(null);

  async function load(search = ""): Promise<void> {
    setLoading(true);
    try {
      const result = await fetchMailTemplates({
        query: search || undefined,
        pageSize: 100,
      });
      setTemplates(result.items);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("templateGenericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    fetchMailTemplates({ pageSize: 100 })
      .then((result) => {
        if (active) setTemplates(result.items);
      })
      .catch((error: unknown) => {
        if (active) {
          toast.error(
            error instanceof Error ? error.message : t("templateGenericError"),
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [t]);

  async function choose(template: MailTemplateSummaryDto): Promise<void> {
    setLoading(true);
    try {
      const detail = await fetchMailTemplate(template.id);
      setSelected(detail);
      setValues(Object.fromEntries(detail.variables.map((name) => [name, ""])));
      setFieldError(null);
      if (detail.variables.length === 0) {
        requestApply({
          subject: detail.subject,
          bodyText: detail.bodyText,
          bodyHtml: detail.bodyHtml,
        });
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("templateGenericError"),
      );
    } finally {
      setLoading(false);
    }
  }

  function requestApply(template: AppliedMailTemplate): void {
    if (hasExistingContent) setPending(template);
    else finishApply(template);
  }

  function finishApply(template: AppliedMailTemplate): void {
    onApply(template);
    toast.success(t("templateAppliedToast"));
    onOpenChange(false);
  }

  function applySelected(): void {
    if (!selected) return;
    if (selected.variables.some((name) => !values[name]?.trim())) {
      setFieldError(t("templateVariableRequired"));
      return;
    }
    try {
      const completed = applyMailTemplateVariables(selected, values);
      if (
        completed.subject.length > 500 ||
        completed.bodyText.length > 500_000 ||
        completed.bodyHtml.length > 500_000
      ) {
        setFieldError(t("templateApplyTooLongError"));
        return;
      }
      requestApply(completed);
    } catch {
      setFieldError(t("templateVariableRequired"));
    }
  }

  function submitSearch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setSelected(null);
    void load(query.trim());
  }

  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {selected
                ? t("templateVariablesTitle")
                : t("chooseTemplateTitle")}
            </DialogTitle>
            <DialogDescription>
              {selected
                ? t("templateVariablesDescription")
                : t("chooseTemplateDescription")}
            </DialogDescription>
          </DialogHeader>

          {selected && selected.variables.length > 0 ? (
            <div className="min-h-0 space-y-4 overflow-y-auto py-1">
              <div className="rounded-lg border border-background-200 bg-background-50 p-3">
                <p className="font-medium">{selected.name}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {selected.subject || t("templateNoSubject")}
                </p>
              </div>
              {selected.variables.map((name, index) => (
                <Field key={name} data-invalid={Boolean(fieldError)}>
                  <FieldLabel htmlFor={`mail-template-variable-${index}`}>
                    {t("templateVariableLabel", { name })}
                  </FieldLabel>
                  <Input
                    id={`mail-template-variable-${index}`}
                    value={values[name] ?? ""}
                    maxLength={10_000}
                    autoFocus={index === 0}
                    onChange={(event) => {
                      setValues((current) => ({
                        ...current,
                        [name]: event.target.value,
                      }));
                      setFieldError(null);
                    }}
                  />
                </Field>
              ))}
              <FieldError>{fieldError}</FieldError>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <form onSubmit={submitSearch} className="flex gap-2">
                <Input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={t("templateSearchPlaceholder")}
                  aria-label={t("templateSearchLabel")}
                />
                <Button type="submit" variant="outline" size="icon">
                  <Icon name="ri-search-line" aria-hidden />
                  <span className="sr-only">{t("templateSearchLabel")}</span>
                </Button>
              </form>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {loading ? (
                  <div className="grid min-h-40 place-items-center">
                    <Spinner aria-label={t("loadingLabel")} />
                  </div>
                ) : templates.length === 0 ? (
                  <EmptyState
                    bordered={false}
                    size="sm"
                    icon="ri-file-copy-2-line"
                    title={t("chooseTemplateEmpty")}
                  />
                ) : (
                  <ul className="space-y-2">
                    {templates.map((template) => (
                      <li key={template.id}>
                        <Button
                          type="button"
                          variant="outline"
                          className="h-auto w-full items-start justify-start gap-3 whitespace-normal p-3 text-left"
                          onClick={() => void choose(template)}
                        >
                          <Icon
                            name={
                              template.starred
                                ? "ri-star-line"
                                : "ri-file-text-line"
                            }
                            className={
                              template.starred
                                ? "mt-0.5 text-amber-500"
                                : "mt-0.5"
                            }
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium">
                              {template.name}
                            </span>
                            <span className="block truncate text-sm text-muted-foreground">
                              {template.subject || t("templateNoSubject")}
                            </span>
                            {template.tags.length > 0 && (
                              <span className="mt-2 flex flex-wrap gap-1">
                                {template.tags.map((tag) => (
                                  <LabelChip key={tag.id} label={tag} />
                                ))}
                              </span>
                            )}
                          </span>
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            {selected && selected.variables.length > 0 ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setSelected(null)}
                >
                  {t("backToListButton")}
                </Button>
                <Button type="button" onClick={applySelected}>
                  {t("applyTemplateButton")}
                </Button>
              </>
            ) : (
              <Button
                render={<Link href="/mail/templates" />}
                nativeButton={false}
                variant="outline"
              >
                {t("manageTemplatesLink")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("replaceTemplateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("replaceTemplateDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancelButton")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pending) finishApply(pending);
              }}
            >
              {t("replaceTemplateConfirmButton")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
