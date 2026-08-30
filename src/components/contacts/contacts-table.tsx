"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Icon } from "@/components/ui/icon";
import { LabelChip } from "@/components/ui/label-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { LabelColor } from "@/lib/label-color";
import { ContactAvatar } from "./contact-avatar";
import { contactDetailHref, type ContactsFilters } from "./list-params";
import type { ContactListItem } from "./api";

interface ContactsTableProps {
  contacts: ContactListItem[];
  /** The list view this table belongs to, carried into every row link. */
  filters: ContactsFilters;
  selected: Set<string>;
  onSelectedChange: (next: Set<string>) => void;
  onToggleStar: (contact: ContactListItem) => void;
  onDelete: (contact: ContactListItem) => void;
}

export function ContactsTable({
  contacts,
  filters,
  selected,
  onSelectedChange,
  onToggleStar,
  onDelete,
}: ContactsTableProps) {
  const t = useTranslations("contacts");
  const allSelected =
    contacts.length > 0 &&
    contacts.every((contact) => selected.has(contact.id));

  function toggleAll(checked: boolean): void {
    // Only the page's own rows are affected — the header checkbox cannot
    // reach contacts the operator has not seen.
    const next = new Set(selected);
    for (const contact of contacts) {
      if (checked) next.add(contact.id);
      else next.delete(contact.id);
    }
    onSelectedChange(next);
  }

  function toggleOne(id: string, checked: boolean): void {
    const next = new Set(selected);
    if (checked) next.add(id);
    else next.delete(id);
    onSelectedChange(next);
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-background-200">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => toggleAll(checked === true)}
                aria-label={t("selectAllLabel")}
              />
            </TableHead>
            <TableHead>{t("columnName")}</TableHead>
            <TableHead className="hidden md:table-cell">
              {t("columnEmail")}
            </TableHead>
            <TableHead className="hidden lg:table-cell">
              {t("columnPhone")}
            </TableHead>
            <TableHead className="hidden xl:table-cell">
              {t("columnOrganization")}
            </TableHead>
            <TableHead className="hidden lg:table-cell">
              {t("columnLabels")}
            </TableHead>
            <TableHead className="w-24 text-right">
              <span className="sr-only">{t("columnActions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {contacts.map((contact) => {
            const name = contact.displayName || t("detailNoName");
            return (
              <TableRow key={contact.id}>
                <TableCell>
                  <Checkbox
                    checked={selected.has(contact.id)}
                    onCheckedChange={(checked) =>
                      toggleOne(contact.id, checked === true)
                    }
                    aria-label={t("selectRowLabel", { name })}
                  />
                </TableCell>
                <TableCell>
                  <Link
                    href={contactDetailHref(contact.id, filters)}
                    className="flex min-w-0 items-center gap-3 hover:underline"
                  >
                    <ContactAvatar
                      contactId={contact.id}
                      displayName={contact.displayName}
                      hasPhoto={contact.hasPhoto}
                      size="sm"
                    />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground">
                        {name}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground md:hidden">
                        {contact.primaryEmail ?? contact.primaryPhone ?? ""}
                      </span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="hidden max-w-[16rem] truncate md:table-cell">
                  {contact.primaryEmail ?? ""}
                </TableCell>
                <TableCell className="hidden whitespace-nowrap lg:table-cell">
                  {contact.primaryPhone ?? ""}
                </TableCell>
                <TableCell className="hidden max-w-[14rem] truncate xl:table-cell">
                  {contact.organization ?? ""}
                </TableCell>
                <TableCell className="hidden lg:table-cell">
                  <span className="flex flex-wrap gap-1">
                    {contact.labels.map((label) => (
                      <LabelChip
                        key={label.id}
                        label={{
                          name: label.name,
                          color: label.color as LabelColor,
                        }}
                      />
                    ))}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <span className="flex items-center justify-end gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label={
                        contact.starred
                          ? t("unstarLabel", { name })
                          : t("starLabel", { name })
                      }
                      onClick={() => onToggleStar(contact)}
                    >
                      <Icon
                        name={contact.starred ? "ri-star-line" : "ri-star-line"}
                        aria-hidden
                        className={contact.starred ? "text-amber-500" : ""}
                      />
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        render={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                          />
                        }
                        aria-label={t("rowActionsLabel", { name })}
                      >
                        <Icon name="ri-more-2-line" aria-hidden />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuGroup>
                          <DropdownMenuItem
                            render={
                              <Link
                                href={contactDetailHref(contact.id, filters)}
                              />
                            }
                          >
                            {t("openAction")}
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDelete(contact)}>
                            {t("deleteAction")}
                          </DropdownMenuItem>
                        </DropdownMenuGroup>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
