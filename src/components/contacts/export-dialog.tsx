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
import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { ContactExportFormat } from "@/lib/contacts/formats";
import { contactsApi } from "./api";
import type { ContactsFilters } from "./contacts-view";

type Scope = "all" | "filtered" | "selected";

export function ExportContactsDialog({
  open,
  onOpenChange,
  selectedIds,
  filters,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  filters: ContactsFilters;
}) {
  const t = useTranslations("contacts");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("exportTitle")}</DialogTitle>
          <DialogDescription>{t("exportDescription")}</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open so the default scope is computed from the
            selection as it is at that moment, without a reset effect. */}
        {open && (
          <ExportForm
            onOpenChange={onOpenChange}
            selectedIds={selectedIds}
            filters={filters}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ExportForm({
  onOpenChange,
  selectedIds,
  filters,
}: {
  onOpenChange: (open: boolean) => void;
  selectedIds: string[];
  filters: ContactsFilters;
}) {
  const t = useTranslations("contacts");
  const hasFilters =
    filters.query.length > 0 || filters.labelId !== null || filters.starred;

  const [format, setFormat] = useState<ContactExportFormat>("vcard-3.0");
  // The narrowest scope that has anything in it: exporting the whole book
  // when three rows are selected is almost never the intent.
  const [scope, setScope] = useState<Scope>(() =>
    selectedIds.length > 0 ? "selected" : hasFilters ? "filtered" : "all",
  );
  const [submitting, setSubmitting] = useState(false);

  async function handleExport(): Promise<void> {
    setSubmitting(true);
    try {
      const { blob, filename } = await contactsApi.export(
        format,
        scope === "selected"
          ? { contactIds: selectedIds }
          : scope === "filtered"
            ? {
                query: filters.query || undefined,
                labelId: filters.labelId ?? undefined,
                starred: filters.starred || undefined,
              }
            : {},
      );
      // The route needs the workspace header, so the file arrives as a blob
      // and is handed to the browser through an object URL.
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const formatItems: Record<string, string> = {
    "vcard-3.0": t("formatVcard30"),
    "vcard-4.0": t("formatVcard40"),
    "google-csv": t("formatGoogleCsv"),
    "outlook-csv": t("formatOutlookCsv"),
    ldif: t("formatLdif"),
  };

  const scopes: { value: Scope; label: string; available: boolean }[] = [
    { value: "all", label: t("scopeAll"), available: true },
    { value: "filtered", label: t("scopeFiltered"), available: hasFilters },
    {
      value: "selected",
      label: t("scopeSelected", { count: selectedIds.length }),
      available: selectedIds.length > 0,
    },
  ];

  return (
    <>
      <div className="flex flex-col gap-4">
        <Field>
          <FieldLabel>{t("exportFormatLabel")}</FieldLabel>
          <Select
            value={format}
            onValueChange={(value) =>
              setFormat((value as ContactExportFormat | null) ?? "vcard-3.0")
            }
            items={formatItems}
            disabled={submitting}
          >
            <SelectTrigger aria-label={t("exportFormatLabel")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {Object.entries(formatItems).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            {t("exportScopeLabel")}
          </legend>
          <ToggleGroup
            value={[scope]}
            onValueChange={(values) => {
              const next = values[0];
              if (next) setScope(next as Scope);
            }}
            orientation="vertical"
            variant="outline"
            loopFocus
            className="w-full"
          >
            {scopes
              .filter((option) => option.available)
              .map((option) => (
                <ToggleGroupItem
                  key={option.value}
                  value={option.value}
                  disabled={submitting}
                  className="h-auto justify-start px-3 py-2 text-left text-sm"
                >
                  {option.label}
                </ToggleGroupItem>
              ))}
          </ToggleGroup>
        </fieldset>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          {t("cancelButton")}
        </Button>
        <Button type="button" onClick={handleExport} disabled={submitting}>
          {submitting ? t("exportingButton") : t("exportConfirmButton")}
        </Button>
      </DialogFooter>
    </>
  );
}
