"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslations } from "next-intl";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import type { MailLabelDto } from "./api";
import { LabelChip } from "./label-chip";

export interface MessageLabelPickerProps {
  labels: MailLabelDto[];
  appliedLabelIds: ReadonlySet<string>;
  loading: boolean;
  error: string | null;
  mutationError: string | null;
  pendingLabelIds: ReadonlySet<string>;
  onRetry: () => void;
  onToggle: (label: MailLabelDto) => void;
}

export function MessageLabelPicker({
  labels,
  appliedLabelIds,
  loading,
  error,
  mutationError,
  pendingLabelIds,
  onRetry,
  onToggle,
}: MessageLabelPickerProps) {
  const t = useTranslations("mail");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const lastToggledLabelIdRef = useRef<string | null>(null);
  const listboxId = useId();

  const filteredLabels = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return labels;
    return labels.filter((label) =>
      label.name.toLocaleLowerCase().includes(normalized),
    );
  }, [labels, query]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    const labelId = lastToggledLabelIdRef.current;
    if (!open || !labelId || pendingLabelIds.has(labelId)) return;
    const index = filteredLabels.findIndex((label) => label.id === labelId);
    if (index < 0) return;
    lastToggledLabelIdRef.current = null;
    const frame = requestAnimationFrame(() =>
      optionRefs.current[index]?.focus(),
    );
    return () => cancelAnimationFrame(frame);
  }, [filteredLabels, open, pendingLabelIds]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen) {
      setQuery("");
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  }

  function focusOption(index: number) {
    if (filteredLabels.length === 0) return;
    const wrapped = (index + filteredLabels.length) % filteredLabels.length;
    optionRefs.current[wrapped]?.focus();
  }

  function handleSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(filteredLabels.length - 1);
    }
  }

  function handleOptionKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusOption(index + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(index - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(filteredLabels.length - 1);
    }
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <Icon name="ri-price-tag-3-line" aria-hidden data-icon="inline-start" />
        {t("labelPickerButton")}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(28rem,calc(100vh-2rem))] w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <PopoverHeader className="px-3 pt-3">
          <PopoverTitle>{t("labelPickerTitle")}</PopoverTitle>
          <PopoverDescription>{t("labelPickerDescription")}</PopoverDescription>
        </PopoverHeader>

        <div className="px-3">
          <Input
            ref={searchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            aria-controls={listboxId}
            aria-label={t("labelPickerSearchAriaLabel")}
            placeholder={t("labelPickerSearchPlaceholder")}
          />
        </div>

        {mutationError && (
          <Alert variant="error" className="mx-3 w-auto">
            <AlertDescription>{mutationError}</AlertDescription>
          </Alert>
        )}

        <div
          id={listboxId}
          role="listbox"
          aria-label={t("labelPickerListAriaLabel")}
          aria-multiselectable="true"
          className="min-h-20 overflow-y-auto px-2 pb-2"
        >
          {loading ? (
            <div
              aria-label={t("loadingLabelsLabel")}
              className="space-y-1.5 p-1"
            >
              {[1, 2, 3].map((row) => (
                <Skeleton key={row} className="h-9 w-full" />
              ))}
            </div>
          ) : error ? (
            <div className="space-y-2 p-2">
              <p role="alert" className="text-sm text-[var(--error-text)]">
                {error}
              </p>
              <Button type="button" size="sm" onClick={onRetry}>
                <Icon
                  name="ri-refresh-line"
                  aria-hidden
                  data-icon="inline-start"
                />
                {t("retryButton")}
              </Button>
            </div>
          ) : labels.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {t("labelPickerEmptyDescription")}
            </p>
          ) : filteredLabels.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {t("labelPickerNoResults")}
            </p>
          ) : (
            filteredLabels.map((label, index) => {
              const applied = appliedLabelIds.has(label.id);
              const pending = pendingLabelIds.has(label.id);
              return (
                <Button
                  key={label.id}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={applied}
                  aria-busy={pending || undefined}
                  disabled={pending}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  onClick={() => {
                    lastToggledLabelIdRef.current = label.id;
                    onToggle(label);
                  }}
                >
                  {pending ? (
                    <Spinner aria-hidden data-icon="inline-start" />
                  ) : (
                    <Icon
                      name={applied ? "ri-check-line" : "ri-add-line"}
                      aria-hidden
                      data-icon="inline-start"
                    />
                  )}
                  <LabelChip label={label} className="max-w-44" />
                  <span className="sr-only">
                    {applied
                      ? t("labelPickerAppliedState")
                      : t("labelPickerNotAppliedState")}
                  </span>
                </Button>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
