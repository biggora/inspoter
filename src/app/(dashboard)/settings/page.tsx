import Link from "next/link";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";
import { Icon } from "@/components/ui/icon";

export default function SettingsPage() {
  return (
    <PageBody>
      <PageHeader title="Настройки" />
      <CardGrid columns={2}>
        <Link
          href="/settings/workspace"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon name="ri-building-2-line" className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">Рабочее пространство</p>
            <p className="text-sm text-muted-foreground">
              Управление названием рабочего пространства, участниками и создание
              новых пространств
            </p>
          </div>
        </Link>
        <Link
          href="/settings/webhooks"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon name="ri-webhook-line" className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">Webhook-токены</p>
            <p className="text-sm text-muted-foreground">
              Управление токенами для внешних систем, отправляющих почту,
              сообщения, логи и оповещения
            </p>
          </div>
        </Link>
        <Link
          href="/settings/providers"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon name="ri-key-2-line" className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">Провайдеры</p>
            <p className="text-sm text-muted-foreground">
              API-ключи для Cloudflare, Hetzner и GoDaddy
            </p>
          </div>
        </Link>
        <Link
          href="/settings/mail"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300 focus-visible:border-[var(--focus-ring)] focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
        >
          <Icon name="ri-mail-line" className="text-lg text-muted-foreground" />
          <div>
            <p className="font-medium">Почтовые аккаунты</p>
            <p className="text-sm text-muted-foreground">
              Подключение IMAP/SMTP-ящиков для приёма и отправки почты
            </p>
          </div>
        </Link>
      </CardGrid>
    </PageBody>
  );
}
