"use client";

import { useState } from "react";
import { useFormatter, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Link, useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { LabelChip } from "@/components/ui/label-chip";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import type { LabelColor } from "@/lib/label-color";
import { ContactAvatar } from "./contact-avatar";
import { ContactFormDialog } from "./contact-form-dialog";
import { DeleteContactsDialog } from "./delete-contacts-dialog";
import { labelMessageKey } from "./field-labels";
import type { ContactDetail, ContactLabelSummary } from "./api";

export function ContactDetailView({
  contact,
  labels,
}: {
  contact: ContactDetail;
  labels: ContactLabelSummary[];
}) {
  const t = useTranslations("contacts");
  const format = useFormatter();
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const name = contact.displayName || t("detailNoName");
  const subtitle = [contact.jobTitle, contact.department, contact.organization]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const hasDetails =
    contact.fields.length > 0 ||
    contact.addresses.length > 0 ||
    contact.birthday !== null ||
    contact.notes !== null;

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/contacts", label: t("backToList") }}
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(true)}
            >
              <Icon
                name="ri-pencil-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("editAction")}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleting(true)}
            >
              <Icon
                name="ri-delete-bin-line"
                aria-hidden
                data-icon="inline-start"
              />
              {t("deleteAction")}
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-6">
        <header className="flex items-center gap-4">
          <ContactAvatar
            contactId={contact.id}
            displayName={contact.displayName}
            hasPhoto={contact.hasPhoto}
            size="lg"
          />
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
              <span className="truncate">{name}</span>
              {contact.starred && (
                <Icon
                  name="ri-star-fill"
                  aria-label={t("sidebarStarred")}
                  className="text-amber-500"
                />
              )}
            </h1>
            {subtitle.length > 0 && (
              <p className="truncate text-sm text-muted-foreground">
                {subtitle}
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              {t("detailUpdatedAt", {
                date: format.dateTime(new Date(contact.updatedAt), {
                  dateStyle: "medium",
                  timeStyle: "short",
                }),
              })}
            </p>
          </div>
        </header>

        {contact.labels.length > 0 && (
          <section>
            <h2 className="mb-2 text-sm font-medium">{t("labelsLabel")}</h2>
            <div className="flex flex-wrap gap-1">
              {contact.labels.map((label) => (
                <LabelChip
                  key={label.id}
                  label={{ name: label.name, color: label.color as LabelColor }}
                />
              ))}
            </div>
          </section>
        )}

        {!hasDetails ? (
          <p className="text-sm text-muted-foreground">
            {t("detailNoDetails")}
          </p>
        ) : (
          <>
            {contact.fields.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-medium">
                  {t("sectionDetails")}
                </h2>
                <dl className="flex flex-col divide-y divide-background-100">
                  {contact.fields.map((field) => (
                    <div
                      key={field.id}
                      className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4"
                    >
                      <dt className="text-xs text-muted-foreground sm:w-40 sm:shrink-0">
                        {fieldCaption(field.kind, field.label, t)}
                      </dt>
                      <dd className="min-w-0 text-sm break-words">
                        <FieldValue kind={field.kind} value={field.value} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {contact.addresses.length > 0 && (
              <section>
                <h2 className="mb-2 text-sm font-medium">
                  {t("sectionAddresses")}
                </h2>
                <dl className="flex flex-col divide-y divide-background-100">
                  {contact.addresses.map((address) => (
                    <div
                      key={address.id}
                      className="flex flex-col gap-0.5 py-2 sm:flex-row sm:items-baseline sm:gap-4"
                    >
                      <dt className="text-xs text-muted-foreground sm:w-40 sm:shrink-0">
                        {address.label ?? t("labelNone")}
                      </dt>
                      <dd className="min-w-0 text-sm break-words whitespace-pre-line">
                        {formatAddress(address)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            {contact.birthday !== null && (
              <section>
                <h2 className="mb-2 text-sm font-medium">
                  {t("birthdayLabel")}
                </h2>
                <p className="text-sm">{contact.birthday}</p>
              </section>
            )}

            {contact.notes !== null && (
              <section>
                <h2 className="mb-2 text-sm font-medium">
                  {t("detailNotesTitle")}
                </h2>
                <p className="text-sm whitespace-pre-line">{contact.notes}</p>
              </section>
            )}
          </>
        )}
      </div>

      <ContactFormDialog
        open={editOpen}
        contact={contact}
        labels={labels}
        onOpenChange={setEditOpen}
        onSaved={() => {
          toast.success(t("updatedToast"));
          router.refresh();
        }}
      />
      <DeleteContactsDialog
        contacts={deleting ? [contact] : null}
        onOpenChange={(open) => {
          if (!open) setDeleting(false);
        }}
        onDeleted={() => {
          setDeleting(false);
          router.push("/contacts");
        }}
      />
    </PageBody>
  );
}

function fieldCaption(
  kind: string,
  label: string | null,
  t: ReturnType<typeof useTranslations<"contacts">>,
): string {
  const kindText = t(`kind${kind}` as "kindEMAIL");
  const key = labelMessageKey(label);
  if (key !== null) return `${kindText} · ${t(key as "labelHome")}`;
  return label === null ? kindText : `${kindText} · ${label}`;
}

// Emails, phones and sites become links; everything else is plain text.
// next-intl's Link passes an href that carries a protocol (mailto:, tel:,
// https:) straight through without trying to localize it, so one component
// covers all three. A URL value that is not http(s) stays as text rather than
// becoming a link to a scheme the browser should not follow from here.
function FieldValue({ kind, value }: { kind: string; value: string }) {
  const href = linkHref(kind, value);
  if (href === null) return <span>{value}</span>;

  return (
    <Link
      href={href}
      {...(kind === "URL"
        ? { target: "_blank", rel: "noopener noreferrer nofollow" }
        : {})}
      className="text-primary-600 hover:underline"
    >
      {value}
    </Link>
  );
}

function linkHref(kind: string, value: string): string | null {
  if (kind === "EMAIL") return `mailto:${value}`;
  if (kind === "PHONE") return `tel:${value.replace(/\s+/gu, "")}`;
  if (kind === "URL") return /^https?:\/\//iu.test(value) ? value : null;
  return null;
}

function formatAddress(address: {
  formatted: string | null;
  street: string | null;
  extended: string | null;
  poBox: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string | null;
}): string {
  if (address.formatted !== null) return address.formatted;
  return [
    address.street,
    address.extended,
    address.poBox,
    [address.postalCode, address.city].filter(Boolean).join(" "),
    address.region,
    address.country,
  ]
    .filter((part): part is string => Boolean(part && part.length > 0))
    .join("\n");
}
