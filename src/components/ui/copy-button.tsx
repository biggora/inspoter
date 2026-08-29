import * as React from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

// The one copy-to-clipboard control. Owns the copied flag (icon + label swap,
// reset after 2s), the clipboard call, and the result toast, so a feature only
// supplies what to copy. Before this existed, every dialog hand-rolled the same
// try/clipboard/toast dance with its own drifted wording.

/** How long the button shows its "Copied" state before reverting. */
const COPIED_RESET_MS = 2000;

type CopyButtonProps = React.ComponentProps<typeof Button> & {
  /** Text handed to the clipboard. */
  value: string;
  /**
   * Label pair override for context-specific wording ("Copy URL" /
   * "URL copied"). Defaults come from the `ui` namespace.
   */
  labels?: { idle?: string; copied?: string };
  /**
   * Toast wording override. Defaults come from the `ui` namespace.
   */
  toasts?: { copied?: string; failed?: string };
  onCopied?: () => void;
  /**
   * Clipboard writes can fail (insecure context, locked-down permissions).
   * Use this to run a manual-copy fallback, e.g. focusing + selecting the
   * read-only field the value came from so Ctrl+C still works.
   */
  onCopyFailed?: () => void;
};

export function CopyButton({
  value,
  labels,
  toasts,
  onCopied,
  onCopyFailed,
  ...props
}: CopyButtonProps) {
  const t = useTranslations("ui");
  const [copied, setCopied] = React.useState(false);
  const resetTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    return () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      setCopied(true);
      resetTimer.current = setTimeout(() => setCopied(false), COPIED_RESET_MS);
      toast.success(toasts?.copied ?? t("copiedToClipboardToast"));
      onCopied?.();
    } catch {
      setCopied(false);
      toast.error(toasts?.failed ?? t("copyFailedToast"));
      onCopyFailed?.();
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      {...props}
      onClick={handleCopy}
    >
      <Icon
        name={copied ? "ri-check-line" : "ri-file-copy-line"}
        aria-hidden
        data-icon="inline-start"
      />
      {copied ? (labels?.copied ?? t("copiedLabel")) : (labels?.idle ?? t("copyLabel"))}
    </Button>
  );
}
