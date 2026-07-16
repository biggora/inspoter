import Link from "next/link";
import { Building2, KeyRound, Webhook } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader title="Настройки" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/workspace"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
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
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
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
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <KeyRound className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Провайдеры</p>
            <p className="text-sm text-muted-foreground">
              API-ключи для Cloudflare, Hetzner и GoDaddy
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
