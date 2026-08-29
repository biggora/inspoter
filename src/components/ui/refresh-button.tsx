import * as React from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// The reload affordance for client-fetched pages: an outline button with the
// refresh glyph that disables itself while a reload is in flight. Extracted
// from the byte-identical blocks in servers/hosting/services views so the
// wording, icon, and disabled behaviour cannot drift apart again.

type RefreshButtonProps = React.ComponentProps<typeof Button> & {
  /** Disables the button while the caller's reload request is in flight. */
  loading?: boolean;
  /** Label override, e.g. a namespace's "Retry" wording. Defaults to `ui.refreshLabel`. */
  label?: string;
};

export function RefreshButton({
  loading = false,
  label,
  disabled,
  ...props
}: RefreshButtonProps) {
  const t = useTranslations("ui");
  return (
    <Button variant="outline" {...props} disabled={disabled || loading}>
      <Icon name="ri-refresh-line" aria-hidden data-icon="inline-start" />
      {label ?? t("refreshLabel")}
    </Button>
  );
}
