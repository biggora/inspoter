import Link from "next/link";
import { Building2, KeyRound, Mail, Webhook } from "lucide-react";
import { CardGrid } from "@/components/shell/card-grid";
import { PageBody } from "@/components/shell/page-body";
import { PageHeader } from "@/components/shell/page-header";

export default function SettingsPage() {
  return (
    <PageBody>
      <PageHeader title="Настройки" />
      <CardGrid columns={2}>
        <Link
          href="/settings/workspace"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300"
        >
          <Building2 className="size-5 text-muted-foreground" />
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
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300"
        >
          <Webhook className="size-5 text-muted-foreground" />
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
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300"
        >
          <KeyRound className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Провайдеры</p>
            <p className="text-sm text-muted-foreground">
              API-ключи для Cloudflare, Hetzner и GoDaddy
            </p>
          </div>
        </Link>
        <Link
          href="/settings/mail"
          className="flex items-center gap-3 rounded-lg border border-background-200 bg-background-50 p-4 transition-colors hover:border-background-300"
        >
          <Mail className="size-5 text-muted-foreground" />
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
