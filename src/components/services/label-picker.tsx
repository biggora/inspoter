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

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { LabelChip } from "@/components/ui/label-chip";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ServiceLabelDto } from "./api";

export interface ServiceLabelPickerProps {
  labels: ServiceLabelDto[];
  selectedIds: readonly string[];
  onChange: (ids: string[]) => void;
  triggerLabel: string;
  title: string;
  description: string;
  disabled?: boolean;
}

// Multi-select popover shared by the services filter bar and the service
// form dialog. Structure and keyboard handling follow
// mail/message-label-picker.tsx, minus its per-option pending state: here
// selection is purely local and only persisted when the caller saves.
export function ServiceLabelPicker({
  labels,
  selectedIds,
  onChange,
  triggerLabel,
  title,
  description,
  disabled = false,
}: ServiceLabelPickerProps) {
  const t = useTranslations("services");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

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

  function toggle(labelId: string) {
    const next = new Set(selected);
    if (next.has(labelId)) next.delete(labelId);
    else next.add(labelId);
    onChange([...next]);
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        ref={triggerRef}
        disabled={disabled}
        render={<Button type="button" variant="outline" size="sm" />}
      >
        <Icon name="ri-price-tag-3-line" aria-hidden data-icon="inline-start" />
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="max-h-[min(28rem,calc(100vh-2rem))] w-72 max-w-[calc(100vw-2rem)] overflow-hidden p-0"
      >
        <PopoverHeader className="px-3 pt-3">
          <PopoverTitle>{title}</PopoverTitle>
          <PopoverDescription>{description}</PopoverDescription>
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

        <div
          id={listboxId}
          role="listbox"
          aria-label={t("labelPickerListAriaLabel")}
          aria-multiselectable="true"
          className="min-h-20 overflow-y-auto px-2 pb-2"
        >
          {labels.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {t("labelPickerEmptyDescription")}
            </p>
          ) : filteredLabels.length === 0 ? (
            <p className="p-2 text-sm text-muted-foreground">
              {t("labelPickerNoResults")}
            </p>
          ) : (
            filteredLabels.map((label, index) => {
              const applied = selected.has(label.id);
              return (
                <Button
                  key={label.id}
                  ref={(node) => {
                    optionRefs.current[index] = node;
                  }}
                  type="button"
                  role="option"
                  aria-selected={applied}
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start"
                  onKeyDown={(event) => handleOptionKeyDown(event, index)}
                  onClick={() => toggle(label.id)}
                >
                  <Icon
                    name={applied ? "ri-check-line" : "ri-add-line"}
                    aria-hidden
                    data-icon="inline-start"
                  />
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
