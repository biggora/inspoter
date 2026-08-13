"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import type { ContactLabelSummary } from "./api";

// Appears above the table only while rows are selected — the bulk actions
// have no meaning otherwise, and a permanently visible bar of disabled
// buttons reads as broken.
export function SelectionToolbar({
  count,
  labels,
  busy,
  onClear,
  onDelete,
  onStar,
  onAddLabel,
  onRemoveLabel,
}: {
  count: number;
  labels: ContactLabelSummary[];
  busy: boolean;
  onClear: () => void;
  onDelete: () => void;
  onStar: (starred: boolean) => void;
  onAddLabel: (labelId: string) => void;
  onRemoveLabel: (labelId: string) => void;
}) {
  const t = useTranslations("contacts");

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-background-200 bg-background-50 px-3 py-2">
      <span className="text-sm font-medium">
        {t("selectedCount", { count })}
      </span>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>
        {t("clearSelectionButton")}
      </Button>
      <span className="flex-1" />
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => onStar(true)}
      >
        <Icon name="ri-star-line" aria-hidden data-icon="inline-start" />
        {t("bulkStarButton")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => onStar(false)}
      >
        {t("bulkUnstarButton")}
      </Button>
      {labels.length > 0 && (
        <>
          <LabelMenu
            title={t("bulkAddLabelButton")}
            labels={labels}
            busy={busy}
            onPick={onAddLabel}
          />
          <LabelMenu
            title={t("bulkRemoveLabelButton")}
            labels={labels}
            busy={busy}
            onPick={onRemoveLabel}
          />
        </>
      )}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={onDelete}
      >
        <Icon name="ri-delete-bin-line" aria-hidden data-icon="inline-start" />
        {t("bulkDeleteButton")}
      </Button>
    </div>
  );
}

function LabelMenu({
  title,
  labels,
  busy,
  onPick,
}: {
  title: string;
  labels: ContactLabelSummary[];
  busy: boolean;
  onPick: (labelId: string) => void;
}) {
  const t = useTranslations("contacts");

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button type="button" variant="outline" size="sm" disabled={busy} />
        }
      >
        {title}
        <Icon name="ri-arrow-down-s-line" aria-hidden data-icon="inline-end" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {/* Menu.GroupLabel must live inside Menu.Group — Base UI throws
          "MenuGroupContext is missing" (production error #31) otherwise, so
          the header and the items share the one group. */}
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("bulkLabelPickerLabel")}</DropdownMenuLabel>
          {labels.map((label) => (
            <DropdownMenuItem key={label.id} onClick={() => onPick(label.id)}>
              {label.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
