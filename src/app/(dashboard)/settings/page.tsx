import Link from "next/link";
import { Building2, Webhook } from "lucide-react";

export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/settings/workspace"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <Building2 className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Workspace</p>
            <p className="text-sm text-muted-foreground">
              Manage workspace name, members, and create new workspaces
            </p>
          </div>
        </Link>
        <Link
          href="/settings/webhooks"
          className="flex items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
        >
          <Webhook className="size-5 text-muted-foreground" />
          <div>
            <p className="font-medium">Webhooks</p>
            <p className="text-sm text-muted-foreground">
              Manage tokens for external systems pushing mail, messages,
              logs, and alerts
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
