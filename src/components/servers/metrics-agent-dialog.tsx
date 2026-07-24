"use client";

import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface MetricsAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
}

function installSnippet(): string {
  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/server-metrics`
      : "https://your-dashboard-url/api/server-metrics";

  return `# 1. Create the probe directory
install -d -m 0555 /var/lib/inspoter-metrics-agent/rootfs-probe

# 2. Create .env file with your settings
cat > .env << 'EOF'
METRICS_ENDPOINT=${endpoint}
METRICS_TOKEN=<your-api-token>
SERVER_IPS=<comma-separated-server-ips>
EOF

# 3. Start the agent
docker compose up -d`;
}

// Servers > enrollment helper — no longer creates a per-server token
// (agent tokens are gone; the metrics agent now authenticates with a
// universal API token managed under Settings > API Tokens). This dialog
// is purely informational: install snippet plus a link to the token page.
export function MetricsAgentDialog({
  open,
  onOpenChange,
  serverName,
}: MetricsAgentDialogProps) {
  const t = useTranslations("servers");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("enrollmentDialogTitle")}</DialogTitle>
          <DialogDescription>
            {t("enrollmentDialogDescription", { name: serverName })}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              {t("installationTitle")}
            </span>
            <pre className="max-h-64 overflow-auto rounded-md border border-border bg-(--bg-sunken) p-3 font-mono text-xs whitespace-pre-wrap text-foreground">
              {installSnippet()}
            </pre>
          </div>
          <p className="text-sm text-muted-foreground">
            {t.rich("manageTokensHint", {
              link: (chunks) => (
                <Link href="/settings/webhooks" className="underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </div>
        <DialogFooter>
          <DialogClose render={<Button type="button" />}>
            {t("closeButton")}
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
