"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CONTACT_FIELD_KINDS } from "@/lib/contacts/model";
import {
  contactsApi,
  type ContactAddressPayload,
  type ContactDetail,
  type ContactFieldPayload,
  type ContactLabelSummary,
  type ContactPayload,
} from "./api";
import { ContactAvatar } from "./contact-avatar";
import {
  inputTypeForKind,
  labelMessageKey,
  LABEL_OPTIONS_BY_KIND,
} from "./field-labels";

const NO_LABEL = "__none__";

function emptyPayload(): ContactPayload {
  return {
    prefix: null,
    firstName: null,
    middleName: null,
    lastName: null,
    suffix: null,
    phoneticFirst: null,
    phoneticMiddle: null,
    phoneticLast: null,
    nickname: null,
    fileAs: null,
    organization: null,
    jobTitle: null,
    department: null,
    birthday: null,
    notes: null,
    starred: false,
    fields: [],
    addresses: [],
    labelIds: [],
  };
}

function toPayload(contact: ContactDetail): ContactPayload {
  return {
    prefix: contact.prefix,
    firstName: contact.firstName,
    middleName: contact.middleName,
    lastName: contact.lastName,
    suffix: contact.suffix,
    phoneticFirst: contact.phoneticFirst,
    phoneticMiddle: contact.phoneticMiddle,
    phoneticLast: contact.phoneticLast,
    nickname: contact.nickname,
    fileAs: contact.fileAs,
    organization: contact.organization,
    jobTitle: contact.jobTitle,
    department: contact.department,
    birthday: contact.birthday,
    notes: contact.notes,
    starred: contact.starred,
    fields: contact.fields.map((field) => ({
      kind: field.kind,
      label: field.label,
      value: field.value,
      isPrimary: field.isPrimary,
    })),
    addresses: contact.addresses.map((address) => ({
      label: address.label,
      poBox: address.poBox,
      extended: address.extended,
      street: address.street,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      country: address.country,
      formatted: address.formatted,
    })),
    labelIds: contact.labels.map((label) => label.id),
  };
}

function emptyAddress(): ContactAddressPayload {
  return {
    label: "home",
    poBox: null,
    extended: null,
    street: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
    formatted: null,
  };
}

export interface ContactFormDialogProps {
  open: boolean;
  /** null creates; a detail record edits it. */
  contact: ContactDetail | null;
  labels: ContactLabelSummary[];
  onOpenChange: (open: boolean) => void;
  onSaved: (contact: ContactDetail) => void;
}

// One dialog for create and edit. Multi-value entries are rendered as rows an
// operator adds and removes, which is what makes "three phone numbers, one of
// them labelled by hand" expressible at all — the shape the whole section
// exists for.
export function ContactFormDialog({
  open,
  contact,
  labels,
  onOpenChange,
  onSaved,
}: ContactFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {/* Mounted only while open, and keyed by the contact being edited, so
            every opening starts from that contact's current values without an
            effect that copies props into state. */}
        {open && (
          <ContactForm
            key={contact?.id ?? "new"}
            contact={contact}
            labels={labels}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ContactForm({
  contact,
  labels,
  onOpenChange,
  onSaved,
}: Omit<ContactFormDialogProps, "open">) {
  const t = useTranslations("contacts");
  const [form, setForm] = useState<ContactPayload>(() =>
    contact === null ? emptyPayload() : toPayload(contact),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function patch(values: Partial<ContactPayload>): void {
    setForm((current) => ({ ...current, ...values }));
  }

  function text(value: string): string | null {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  function updateField(index: number, values: Partial<ContactFieldPayload>) {
    setForm((current) => ({
      ...current,
      fields: current.fields.map((field, position) =>
        position === index ? { ...field, ...values } : field,
      ),
    }));
  }

  function updateAddress(
    index: number,
    values: Partial<ContactAddressPayload>,
  ) {
    setForm((current) => ({
      ...current,
      addresses: current.addresses.map((address, position) =>
        position === index ? { ...address, ...values } : address,
      ),
    }));
  }

  async function handleSubmit(): Promise<void> {
    setSubmitting(true);
    setFieldErrors({});
    try {
      // Rows the operator added but left blank are dropped rather than
      // rejected — an empty row is an abandoned intent, not an error.
      const payload: ContactPayload = {
        ...form,
        fields: form.fields.filter((field) => field.value.trim().length > 0),
      };
      const saved =
        contact === null
          ? await contactsApi.create(payload)
          : await contactsApi.update(contact.id, payload);
      onOpenChange(false);
      onSaved(saved);
    } catch (error) {
      const apiError = error as {
        fieldErrors?: Record<string, string>;
        message?: string;
      };
      if (apiError.fieldErrors) setFieldErrors(apiError.fieldErrors);
      toast.error(apiError.message ?? t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  const formError = fieldErrors[""] ?? fieldErrors.fields;

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {contact === null ? t("createTitle") : t("editTitle")}
        </DialogTitle>
        <DialogDescription>{t("pageDescription")}</DialogDescription>
      </DialogHeader>

      <FieldGroup>
        {contact !== null && (
          <PhotoField
            contact={contact}
            onChanged={() => onSaved(contact)}
            disabled={submitting}
          />
        )}

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">
            {t("sectionName")}
          </legend>
          <TextField
            id="contact-prefix"
            label={t("prefixLabel")}
            value={form.prefix}
            onChange={(value) => patch({ prefix: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-first-name"
            label={t("firstNameLabel")}
            value={form.firstName}
            onChange={(value) => patch({ firstName: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-middle-name"
            label={t("middleNameLabel")}
            value={form.middleName}
            onChange={(value) => patch({ middleName: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-last-name"
            label={t("lastNameLabel")}
            value={form.lastName}
            onChange={(value) => patch({ lastName: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-suffix"
            label={t("suffixLabel")}
            value={form.suffix}
            onChange={(value) => patch({ suffix: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-nickname"
            label={t("nicknameLabel")}
            value={form.nickname}
            onChange={(value) => patch({ nickname: text(value) })}
            disabled={submitting}
          />
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="mb-2 text-sm font-medium">
            {t("sectionOrganization")}
          </legend>
          <TextField
            id="contact-organization"
            label={t("organizationLabel")}
            value={form.organization}
            onChange={(value) => patch({ organization: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-job-title"
            label={t("jobTitleLabel")}
            value={form.jobTitle}
            onChange={(value) => patch({ jobTitle: text(value) })}
            disabled={submitting}
          />
          <TextField
            id="contact-department"
            label={t("departmentLabel")}
            value={form.department}
            onChange={(value) => patch({ department: text(value) })}
            disabled={submitting}
          />
        </fieldset>

        <Field data-invalid={Boolean(formError)}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <FieldLabel>{t("sectionDetails")}</FieldLabel>
            <span className="flex flex-wrap gap-1">
              {CONTACT_FIELD_KINDS.map((kind) => (
                <Button
                  key={kind}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={submitting}
                  onClick={() =>
                    patch({
                      fields: [
                        ...form.fields,
                        {
                          kind,
                          label: LABEL_OPTIONS_BY_KIND[kind]?.[0] ?? null,
                          value: "",
                          isPrimary: false,
                        },
                      ],
                    })
                  }
                >
                  <Icon
                    name="ri-add-line"
                    aria-hidden
                    data-icon="inline-start"
                  />
                  {t(`kind${kind}` as "kindEMAIL")}
                </Button>
              ))}
            </span>
          </div>
          {form.fields.length === 0 ? (
            <FieldDescription>{t("noFieldsHint")}</FieldDescription>
          ) : (
            <div className="flex flex-col gap-2">
              {form.fields.map((field, index) => (
                <FieldRow
                  key={index}
                  field={field}
                  disabled={submitting}
                  onChange={(values) => updateField(index, values)}
                  onRemove={() =>
                    patch({
                      fields: form.fields.filter(
                        (_item, position) => position !== index,
                      ),
                    })
                  }
                />
              ))}
            </div>
          )}
          <FieldError>{formError}</FieldError>
        </Field>

        <Field>
          <div className="flex items-center justify-between gap-2">
            <FieldLabel>{t("sectionAddresses")}</FieldLabel>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() =>
                patch({ addresses: [...form.addresses, emptyAddress()] })
              }
            >
              <Icon name="ri-add-line" aria-hidden data-icon="inline-start" />
              {t("addAddressButton")}
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {form.addresses.map((address, index) => (
              <AddressRow
                key={index}
                address={address}
                disabled={submitting}
                onChange={(values) => updateAddress(index, values)}
                onRemove={() =>
                  patch({
                    addresses: form.addresses.filter(
                      (_item, position) => position !== index,
                    ),
                  })
                }
              />
            ))}
          </div>
        </Field>

        <fieldset className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-medium">
            {t("sectionOther")}
          </legend>
          <Field>
            <FieldLabel htmlFor="contact-birthday">
              {t("birthdayLabel")}
            </FieldLabel>
            <Input
              id="contact-birthday"
              value={form.birthday ?? ""}
              placeholder={t("birthdayPlaceholder")}
              onChange={(event) =>
                patch({ birthday: text(event.target.value) })
              }
              disabled={submitting}
            />
            <FieldDescription>{t("birthdayHint")}</FieldDescription>
          </Field>
          <TextField
            id="contact-file-as"
            label={t("fileAsLabel")}
            value={form.fileAs}
            onChange={(value) => patch({ fileAs: text(value) })}
            disabled={submitting}
          />
          <Field className="sm:col-span-2">
            <FieldLabel htmlFor="contact-notes">{t("notesLabel")}</FieldLabel>
            <Textarea
              id="contact-notes"
              rows={3}
              value={form.notes ?? ""}
              onChange={(event) => patch({ notes: text(event.target.value) })}
              disabled={submitting}
            />
          </Field>
        </fieldset>

        {labels.length > 0 && (
          <Field>
            <FieldLabel>{t("labelsLabel")}</FieldLabel>
            <div className="flex flex-wrap gap-3">
              {labels.map((label) => (
                <FieldLabel
                  key={label.id}
                  className="flex w-fit items-center gap-2 text-sm"
                >
                  <Checkbox
                    checked={form.labelIds.includes(label.id)}
                    disabled={submitting}
                    onCheckedChange={(checked) =>
                      patch({
                        labelIds:
                          checked === true
                            ? [...form.labelIds, label.id]
                            : form.labelIds.filter((id) => id !== label.id),
                      })
                    }
                  />
                  {label.name}
                </FieldLabel>
              ))}
            </div>
          </Field>
        )}

        <Field>
          <FieldLabel className="flex w-fit items-center gap-2 text-sm">
            <Checkbox
              checked={form.starred}
              disabled={submitting}
              onCheckedChange={(checked) =>
                patch({ starred: checked === true })
              }
            />
            {t("sidebarStarred")}
          </FieldLabel>
        </Field>
      </FieldGroup>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={submitting}
        >
          {t("cancelButton")}
        </Button>
        <Button type="button" onClick={handleSubmit} disabled={submitting}>
          {submitting ? t("savingButton") : t("saveButton")}
        </Button>
      </DialogFooter>
    </>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  disabled,
}: {
  id: string;
  label: string;
  value: string | null;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        value={value ?? ""}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      />
    </Field>
  );
}

function FieldRow({
  field,
  disabled,
  onChange,
  onRemove,
}: {
  field: ContactFieldPayload;
  disabled: boolean;
  onChange: (values: Partial<ContactFieldPayload>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("contacts");
  const options = LABEL_OPTIONS_BY_KIND[field.kind] ?? [];
  const labelItems: Record<string, string> = {
    [NO_LABEL]: t("labelNone"),
    ...Object.fromEntries(
      options.map((option) => [
        option,
        t(labelMessageKey(option) as "labelHome"),
      ]),
    ),
  };
  // A label an import invented is not in the option list; keeping it as an
  // option of its own is what stops the form from silently dropping it.
  if (field.label !== null && !(field.label in labelItems)) {
    labelItems[field.label] = field.label;
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-background-200 p-2">
      <span className="w-24 text-xs text-muted-foreground">
        {t(`kind${field.kind}` as "kindEMAIL")}
      </span>
      <div className="min-w-[8rem]">
        <Select
          value={field.label ?? NO_LABEL}
          onValueChange={(value) =>
            onChange({ label: value === NO_LABEL ? null : (value as string) })
          }
          items={labelItems}
          disabled={disabled}
        >
          <SelectTrigger size="sm" aria-label={t("fieldLabelLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {Object.entries(labelItems).map(([value, text]) => (
                <SelectItem key={value} value={value}>
                  {text}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Input
        type={inputTypeForKind(field.kind)}
        value={field.value}
        aria-label={t("fieldValueLabel")}
        onChange={(event) => onChange({ value: event.target.value })}
        disabled={disabled}
        className="min-w-[12rem] flex-1"
      />
      {(field.kind === "EMAIL" || field.kind === "PHONE") && (
        <FieldLabel className="flex w-fit items-center gap-2 text-xs whitespace-nowrap">
          <Checkbox
            checked={field.isPrimary}
            disabled={disabled}
            onCheckedChange={(checked) =>
              onChange({ isPrimary: checked === true })
            }
          />
          {t("primaryLabel")}
        </FieldLabel>
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={t("removeFieldLabel")}
        disabled={disabled}
        onClick={onRemove}
      >
        <Icon name="ri-close-line" aria-hidden />
      </Button>
    </div>
  );
}

function AddressRow({
  address,
  disabled,
  onChange,
  onRemove,
}: {
  address: ContactAddressPayload;
  disabled: boolean;
  onChange: (values: Partial<ContactAddressPayload>) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("contacts");

  return (
    <div className="rounded-md border border-background-200 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Input
          value={address.label ?? ""}
          aria-label={t("addressLabelLabel")}
          placeholder={t("fieldLabelPlaceholder")}
          onChange={(event) =>
            onChange({ label: event.target.value.trim() || null })
          }
          disabled={disabled}
          className="max-w-[12rem]"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={t("removeAddressLabel")}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="ri-close-line" aria-hidden />
        </Button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(
          [
            ["street", t("addressStreetLabel")],
            ["extended", t("addressExtendedLabel")],
            ["city", t("addressCityLabel")],
            ["region", t("addressRegionLabel")],
            ["postalCode", t("addressPostalCodeLabel")],
            ["country", t("addressCountryLabel")],
            ["poBox", t("addressPoBoxLabel")],
          ] as const
        ).map(([key, label]) => (
          <Input
            key={key}
            value={address[key] ?? ""}
            aria-label={label}
            placeholder={label}
            onChange={(event) =>
              onChange({ [key]: event.target.value.trim() || null })
            }
            disabled={disabled}
          />
        ))}
      </div>
    </div>
  );
}

function PhotoField({
  contact,
  onChanged,
  disabled,
}: {
  contact: ContactDetail;
  onChanged: () => void;
  disabled: boolean;
}) {
  const t = useTranslations("contacts");
  const [busy, setBusy] = useState(false);

  async function upload(file: File): Promise<void> {
    setBusy(true);
    try {
      await contactsApi.uploadPhoto(contact.id, file);
      toast.success(t("photoUploadedToast"));
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(): Promise<void> {
    setBusy(true);
    try {
      await contactsApi.removePhoto(contact.id);
      toast.success(t("photoRemovedToast"));
      onChanged();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field>
      <FieldLabel htmlFor="contact-photo">{t("photoLabel")}</FieldLabel>
      <div className="flex items-center gap-3">
        <ContactAvatar
          contactId={contact.id}
          displayName={contact.displayName}
          hasPhoto={contact.hasPhoto}
          size="lg"
        />
        <div className="flex flex-col gap-2">
          <Input
            id="contact-photo"
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            disabled={disabled || busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void upload(file);
            }}
          />
          {contact.hasPhoto && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-fit"
              disabled={disabled || busy}
              onClick={remove}
            >
              {t("removePhotoButton")}
            </Button>
          )}
        </div>
      </div>
      <FieldDescription>{t("photoHint")}</FieldDescription>
    </Field>
  );
}
