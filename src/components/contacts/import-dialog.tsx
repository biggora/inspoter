"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { contactsApi, type ImportContactsSummary } from "./api";

type Strategy = "skip" | "update" | "create";

const STRATEGIES: Strategy[] = ["skip", "update", "create"];

function capitalize(value: string): string {
  return `${value[0].toUpperCase()}${value.slice(1)}`;
}

// The dialog does two jobs in sequence: pick a file and a duplicate policy,
// then show what the import actually did. Google imports silently and leaves
// you to discover the damage; the summary is the whole point of asking first.
export function ImportContactsDialog({
  open,
  onOpenChange,
  onImported,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations("contacts");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("importTitle")}</DialogTitle>
          <DialogDescription>{t("importDescription")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so the chosen file and the summary of the
            last run are gone the next time it is opened — no reset effect. */}
        {open && (
          <ImportForm onOpenChange={onOpenChange} onImported={onImported} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ImportForm({
  onOpenChange,
  onImported,
}: {
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}) {
  const t = useTranslations("contacts");
  const [file, setFile] = useState<File | null>(null);
  const [strategy, setStrategy] = useState<Strategy>("skip");
  const [submitting, setSubmitting] = useState(false);
  const [summary, setSummary] = useState<ImportContactsSummary | null>(null);

  async function handleImport(): Promise<void> {
    if (file === null) return;
    setSubmitting(true);
    try {
      const result = await contactsApi.import(file, strategy);
      setSummary(result);
      toast.success(
        t("importedToast", { count: result.created + result.updated }),
      );
      onImported();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {summary === null ? (
        <div className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="contacts-import-file">
              {t("importFileLabel")}
            </FieldLabel>
            <Input
              id="contacts-import-file"
              type="file"
              accept=".vcf,.vcard,.csv,.ldif,.txt,text/vcard,text/csv,text/plain"
              disabled={submitting}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </Field>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              {t("duplicateStrategyLabel")}
            </legend>
            {/* A single-select ToggleGroup rather than radios: the design
                  system has no radio control, and this is the same shape the
                  label color picker already uses. */}
            <ToggleGroup
              value={[strategy]}
              onValueChange={(values) => {
                const next = values[0];
                if (next) setStrategy(next as Strategy);
              }}
              orientation="vertical"
              variant="outline"
              loopFocus
              className="w-full"
            >
              {STRATEGIES.map((option) => (
                <ToggleGroupItem
                  key={option}
                  value={option}
                  disabled={submitting}
                  className="h-auto flex-col items-start gap-0.5 px-3 py-2 text-left"
                >
                  <span className="text-sm font-medium">
                    {t(`strategy${capitalize(option)}` as "strategySkip")}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {t(
                      `strategy${capitalize(option)}Hint` as "strategySkipHint",
                    )}
                  </span>
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </fieldset>
        </div>
      ) : (
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-medium">{t("importSummaryTitle")}</p>
          <p className="text-muted-foreground">
            {t("importSummaryFormat", { format: summary.format })}
          </p>
          <p>{t("importSummaryParsed", { count: summary.parsed })}</p>
          <p>{t("importSummaryCreated", { count: summary.created })}</p>
          <p>{t("importSummaryUpdated", { count: summary.updated })}</p>
          <p>{t("importSummarySkipped", { count: summary.skipped })}</p>
          {summary.created > 0 && (
            <FieldDescription>
              {t("importSummaryDuplicatesHint")}
            </FieldDescription>
          )}
        </div>
      )}

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          {summary === null ? t("cancelButton") : t("closeButton")}
        </Button>
        {summary === null && (
          <Button
            type="button"
            onClick={handleImport}
            disabled={submitting || file === null}
          >
            {submitting ? t("importingButton") : t("importConfirmButton")}
          </Button>
        )}
      </DialogFooter>
    </>
  );
}
