"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import { Icon } from "@/components/ui/icon";
import { getInitials, avatarStyle } from "@/lib/mail/avatar";
import { cn } from "@/lib/utils";
import type { MailEntry, MailPayload } from "@/lib/dashboards/widget-payloads";
import { useWidgetRelativeTime } from "./use-widget-time";

// The latest messages, subject plus sender. Unread rows are bolder and carry a
// dot — the same "unread is heavier" convention the mail list uses.
//
// Each row starts with an initials chip for the mailbox that received it (the
// same avatar treatment senders get in the mail list) and links straight into
// the mail client with that account selected and the message open, so a tile
// aggregating several mailboxes stays readable.
export function MailWidget({ data }: { data: MailPayload }) {
  const t = useTranslations("dashboards");
  const relativeTime = useWidgetRelativeTime();

  if (data.items.length === 0) {
    return <p className="text-xs text-muted-foreground">{t("mail.empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {data.items.map((item) => {
        const accountLabel = accountLabelFor(item);
        return (
          <li key={item.id}>
            <Link
              href={{
                pathname: "/mail",
                query: { account: item.accountId, message: item.id },
              }}
              className="flex min-w-0 items-start gap-1.5 rounded-md px-1 py-0.5 -mx-1 text-xs no-underline transition-colors hover:bg-[var(--surface-hover)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
            >
              <span
                aria-hidden
                title={accountLabel}
                className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full text-2xs font-semibold"
                style={avatarStyle(
                  item.accountEmail || item.accountName || item.accountId,
                )}
              >
                {getInitials(item.accountName || item.accountEmail)}
              </span>
              <span className="sr-only">
                {t("mail.accountAriaLabel", { account: accountLabel })}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate",
                    item.isRead
                      ? "text-foreground-700"
                      : "font-medium text-foreground-900",
                  )}
                >
                  {item.subject.trim() || t("mail.noSubject")}
                </span>
                <span className="block truncate text-muted-foreground">
                  {item.fromName?.trim() || item.from}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-muted-foreground">
                {relativeTime(item.receivedAt)}
                {!item.isRead && (
                  <Icon
                    name="ri-circle-fill"
                    aria-hidden
                    className="text-2xs text-primary-500"
                  />
                )}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

// "Name · address" when both are known; a mailbox deleted between the query and
// the render leaves neither, and the row still has to say something.
function accountLabelFor(item: MailEntry): string {
  return (
    [item.accountName, item.accountEmail].filter(Boolean).join(" · ") ||
    item.accountId
  );
}
