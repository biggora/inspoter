"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { ContactAvatar } from "./contact-avatar";
import { contactsApi, type DuplicateGroup } from "./api";

// Google's "Merge & fix". Each group is shown with the whole set of candidates
// and one of them chosen as the survivor — the operator decides which record
// leads, because that choice decides whose name and organization win.
export function DuplicatesView({ groups }: { groups: DuplicateGroup[] }) {
  const t = useTranslations("contacts");
  const router = useRouter();
  const [primaryByGroup, setPrimaryByGroup] = useState<Record<number, string>>(
    {},
  );
  const [mergingGroup, setMergingGroup] = useState<number | null>(null);

  async function merge(groupIndex: number): Promise<void> {
    const group = groups[groupIndex];
    const primaryId = primaryByGroup[groupIndex] ?? group.contacts[0].id;
    const otherIds = group.contacts
      .map((contact) => contact.id)
      .filter((id) => id !== primaryId);
    if (otherIds.length === 0) return;

    setMergingGroup(groupIndex);
    try {
      await contactsApi.merge(primaryId, otherIds);
      toast.success(t("mergeSuccessToast"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("genericError"));
    } finally {
      setMergingGroup(null);
    }
  }

  return (
    <PageBody>
      <PageHeader
        back={{ href: "/contacts", label: t("backToList") }}
        title={t("duplicatesTitle")}
        description={
          groups.length === 0
            ? t("duplicatesDescription")
            : t("duplicatesGroupCount", { count: groups.length })
        }
      />

      {groups.length === 0 ? (
        <EmptyState
          icon="ri-check-double-line"
          title={t("duplicatesEmptyTitle")}
          description={t("duplicatesEmptyDescription")}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {groups.map((group, index) => {
            const primaryId = primaryByGroup[index] ?? group.contacts[0].id;
            return (
              <section
                key={group.contacts.map((contact) => contact.id).join("-")}
                className="rounded-lg border border-background-200 p-4"
              >
                <h2 className="mb-3 text-sm font-medium">
                  {t("duplicatesKeepLabel")}
                </h2>
                <ToggleGroup
                  value={[primaryId]}
                  onValueChange={(values) => {
                    const next = values[0];
                    if (next) {
                      setPrimaryByGroup((current) => ({
                        ...current,
                        [index]: next,
                      }));
                    }
                  }}
                  orientation="vertical"
                  variant="outline"
                  loopFocus
                  className="w-full"
                >
                  {group.contacts.map((contact) => (
                    <ToggleGroupItem
                      key={contact.id}
                      value={contact.id}
                      disabled={mergingGroup === index}
                      className="h-auto justify-start gap-3 px-3 py-2 text-left"
                    >
                      <ContactAvatar
                        contactId={contact.id}
                        displayName={contact.displayName}
                        hasPhoto={contact.hasPhoto}
                        size="sm"
                      />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {contact.displayName || t("detailNoName")}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {[
                            contact.primaryEmail,
                            contact.primaryPhone,
                            contact.organization,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </span>
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <div className="mt-3 flex justify-end">
                  <Button
                    type="button"
                    disabled={mergingGroup !== null}
                    onClick={() => merge(index)}
                  >
                    <Icon
                      name="ri-git-merge-line"
                      aria-hidden
                      data-icon="inline-start"
                    />
                    {mergingGroup === index
                      ? t("mergingButton")
                      : t("mergeGroupButton", { count: group.contacts.length })}
                  </Button>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </PageBody>
  );
}
