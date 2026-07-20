import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Icon } from "@/components/ui/icon";

export default async function SettingsPage() {
  const t = await getTranslations("settings");

  return (
    <PageBody>
      <PageHeader title={t("settingsTitle")} />
      <CardGrid columns={2}>
        <Link
          href="/settings/workspace"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon
            name="ri-building-2-line"
            className="text-lg text-muted-foreground"
          />
          <div>
            <p className="font-medium">{t("workspaceCardTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("workspaceCardDescription")}
            </p>
          </div>
        </Link>
        <Link
          href="/settings/webhooks"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon
            name="ri-webhook-line"
            className="text-lg text-muted-foreground"
          />
          <div>
            <p className="font-medium">{t("webhookTokensTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("webhookTokensCardDescription")}
            </p>
          </div>
        </Link>
        <Link
          href="/settings/providers"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon
            name="ri-key-2-line"
            className="text-lg text-muted-foreground"
          />
          <div>
            <p className="font-medium">{t("providersTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("providersCardDescription")}
            </p>
          </div>
        </Link>
        <Link
          href="/settings/mail"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon name="ri-mail-line" className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">{t("mailAccountsTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("mailAccountsCardDescription")}
            </p>
          </div>
        </Link>
        <Link
          href="/settings/outgoing-webhooks"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon
            name="ri-send-plane-line"
            className="text-lg text-muted-foreground"
          />
          <div>
            <p className="font-medium">{t("outgoingWebhooksTitle")}</p>
            <p className="text-sm text-muted-foreground">
              {t("outgoingWebhooksCardDescription")}
            </p>
          </div>
        </Link>
      </CardGrid>
    </PageBody>
  );
}
