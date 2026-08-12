"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { normalizeEmail } from "@/lib/contacts/normalize";
import { contactsApi } from "./api";

// "Add to contacts" for a message's sender. Deliberately one click with no
// dialog: the address and the display name are all a mail header carries, and
// the operator can fill in the rest on the contact's own page — which is where
// the toast's action sends them.
export function AddToContactsButton({
  address,
  displayName,
}: {
  /** Raw From header value; "Anna Petrova <anna@example.com>" is accepted. */
  address: string;
  displayName?: string;
}) {
  const t = useTranslations("contacts");
  const [submitting, setSubmitting] = useState(false);

  const email = normalizeEmail(address);
  if (email === null) return null;

  async function handleClick(): Promise<void> {
    if (email === null) return;
    setSubmitting(true);
    try {
      const name = (displayName ?? "").trim();
      // A display name that is just the address again would produce a contact
      // whose "first name" is an email address.
      const parts = name.length > 0 && name !== email ? name.split(/\s+/u) : [];
      await contactsApi.create({
        prefix: null,
        firstName: parts[0] ?? null,
        middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
        lastName: parts.length > 1 ? parts[parts.length - 1] : null,
        suffix: null,
        phoneticFirst: null,
        phoneticMiddle: null,
        phoneticLast: null,
        nickname: null,
        // With no usable name the display name falls back to the address,
        // so there is nothing worth pinning as a "file as".
        fileAs: null,
        organization: null,
        jobTitle: null,
        department: null,
        birthday: null,
        notes: null,
        starred: false,
        fields: [{ kind: "EMAIL", label: null, value: email, isPrimary: true }],
        addresses: [],
        labelIds: [],
      });
      toast.success(t("addedToContactsToast"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={submitting}
      onClick={handleClick}
    >
      <Icon name="ri-user-add-line" aria-hidden data-icon="inline-start" />
      {t("addToContactsAction")}
    </Button>
  );
}
