"use client";

import { useId, useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { createAgentToken, type CreateTokenResult } from "./api";

interface MetricsAgentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverName: string;
  localServerId: string;
  onTokenCreated: () => void;
}

function installSnippet(token: string): string {
  const endpoint =
    typeof window !== "undefined"
      ? `${window.location.origin}/api/server-metrics`
      : "https://your-dashboard-url/api/server-metrics";

  return `# 1. Create the probe directory
install -d -m 0555 /var/lib/inspoter-metrics-agent/rootfs-probe

# 2. Create .env file with your settings
cat > .env << 'EOF'
METRICS_ENDPOINT=${endpoint}
METRICS_TOKEN=${token}
SERVER_IPS=<comma-separated-server-ips>
EOF

# 3. Start the agent
docker compose up -d`;
}

// Servers > enrollment — creates a pre-bound agent token for a single
// server and shows the one-time secret plus install instructions. Mirrors
// the create/reveal pattern in webhook-tokens-view.tsx: the raw secret must
// never round-trip after this render, so the dialog fully resets (and lets
// the parent reload the server list) whenever it closes.
export function MetricsAgentDialog({
  open,
  onOpenChange,
  serverName,
  localServerId,
  onTokenCreated,
}: MetricsAgentDialogProps) {
  const t = useTranslations("servers");
  const [name, setName] = useState(serverName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CreateTokenResult | null>(null);
  const [copied, setCopied] = useState(false);

  const nameId = useId();
  const nameErrorId = useId();

  function handleOpenChange(nextOpen: boolean) {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setName(serverName);
      setNameError(null);
      setSubmitting(false);
      setError(null);
      setResult(null);
      setCopied(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t("tokenNameLabel"));
      return;
    }
    setSubmitting(true);
    setNameError(null);
    setError(null);
    try {
      const created = await createAgentToken(trimmed, localServerId);
      setResult(created);
      onTokenCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("tokenError"));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCopy() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.token);
      setCopied(true);
      toast.success(t("copiedToken"));
    } catch {
      toast.error(t("tokenError"));
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        {!result ? (
          <>
            <DialogHeader>
              <DialogTitle>{t("enrollmentDialogTitle")}</DialogTitle>
              <DialogDescription>
                {t("enrollmentDialogDescription")}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={handleSubmit}
              noValidate
              className="flex flex-col gap-4"
            >
              <FieldGroup>
                <Field data-invalid={!!nameError || undefined}>
                  <FieldLabel htmlFor={nameId}>
                    {t("tokenNameLabel")}
                  </FieldLabel>
                  <Input
                    id={nameId}
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t("tokenNamePlaceholder")}
                    aria-required="true"
                    aria-invalid={!!nameError || undefined}
                    aria-describedby={nameError ? nameErrorId : undefined}
                    autoFocus
                  />
                  <FieldError id={nameErrorId}>{nameError}</FieldError>
                </Field>
              </FieldGroup>

              {error && (
                <Alert variant="error">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline" type="button" />}
                >
                  {t("cancelButton")}
                </DialogClose>
                <Button type="submit" disabled={submitting}>
                  {submitting ? (
                    <>
                      <Spinner data-icon="inline-start" aria-hidden />
                      {t("creatingToken")}
                    </>
                  ) : (
                    t("createTokenButton")
                  )}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t("tokenCreatedTitle")}</DialogTitle>
              <DialogDescription>
                {t("tokenCreatedDescription")}
              </DialogDescription>
            </DialogHeader>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t("tokenSecretLabel")}
                </span>
                <div className="rounded-md border border-border bg-(--bg-sunken) p-3">
                  <code className="block break-all font-mono text-sm text-foreground">
                    {result.token}
                  </code>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Icon
                      name="ri-check-line"
                      aria-hidden
                      data-icon="inline-start"
                    />
                  ) : (
                    <Icon
                      name="ri-file-copy-line"
                      aria-hidden
                      data-icon="inline-start"
                    />
                  )}
                  {copied ? t("copiedToken") : t("copyToken")}
                </Button>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-medium text-foreground">
                  {t("installationTitle")}
                </span>
                <pre className="rounded-md border border-border bg-(--bg-sunken) p-3 font-mono text-xs whitespace-pre-wrap break-words text-foreground">
                  {installSnippet(result.token)}
                </pre>
              </div>
            </div>
            <DialogFooter>
              <DialogClose render={<Button type="button" />}>
                {t("closeButton")}
              </DialogClose>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
