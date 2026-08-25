"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import DOMPurify from "dompurify";
import { Button } from "@/components/ui/button";

interface MailBodyProps {
  bodyText: string;
  bodyHtml: string | null;
}

// DOMPurify needs a DOM (window), so sanitization is lazy: it only ever runs
// after hydration on the client — during SSR/pre-hydration the HTML container
// renders empty and fills in right after the hydration render (same
// useSyncExternalStore pattern as src/hooks/use-mobile.ts, avoiding both a
// hydration mismatch and a setState-in-effect). The link hook is registered
// once per page load.
let hookRegistered = false;

function isExternalUrl(value: string): boolean {
  return /^(?:https?:)?\/\//iu.test(value.trim());
}

function sanitizeHtml(
  dirty: string,
  allowExternal: boolean,
): { html: string; hasExternalContent: boolean } {
  if (!hookRegistered) {
    // Every link opens in a new tab without an opener reference — mail HTML
    // is untrusted third-party content (plan §6).
    DOMPurify.addHook("afterSanitizeAttributes", (node) => {
      if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      }
    });
    hookRegistered = true;
  }
  const sanitized = DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input"],
  });
  const template = document.createElement("template");
  template.innerHTML = sanitized;
  let hasExternalContent = false;
  for (const element of template.content.querySelectorAll("*")) {
    for (const attribute of ["src", "poster", "background"] as const) {
      const value = element.getAttribute(attribute);
      if (!value || !isExternalUrl(value)) continue;
      hasExternalContent = true;
      if (!allowExternal) element.removeAttribute(attribute);
    }
    const srcset = element.getAttribute("srcset");
    if (
      srcset &&
      srcset
        .split(",")
        .some((part) => isExternalUrl(part.trim().split(/\s+/u)[0]))
    ) {
      hasExternalContent = true;
      if (!allowExternal) element.removeAttribute("srcset");
    }
    const style = element.getAttribute("style");
    if (style && /url\(\s*['"]?(?:https?:)?\/\//iu.test(style)) {
      hasExternalContent = true;
      if (!allowExternal) element.removeAttribute("style");
    }
    if (
      allowExternal &&
      ["IMG", "VIDEO", "AUDIO", "SOURCE"].includes(element.tagName)
    ) {
      element.setAttribute("referrerpolicy", "no-referrer");
      element.removeAttribute("autoplay");
      if (element.tagName === "VIDEO" || element.tagName === "AUDIO") {
        element.setAttribute("preload", "metadata");
      }
    }
  }
  return { html: template.innerHTML, hasExternalContent };
}

function subscribeNoop() {
  return () => {};
}

export function MailBody({ bodyText, bodyHtml }: MailBodyProps) {
  const t = useTranslations("mail");
  const [allowExternal, setAllowExternal] = useState(false);
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const sanitizedHtml = useMemo(
    () =>
      isHydrated && bodyHtml ? sanitizeHtml(bodyHtml, allowExternal) : null,
    [isHydrated, bodyHtml, allowExternal],
  );

  if (bodyHtml) {
    if (sanitizedHtml === null) return null;
    return (
      <div className="space-y-3">
        {sanitizedHtml.hasExternalContent && !allowExternal && (
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto p-0"
            onClick={() => setAllowExternal(true)}
          >
            {t("loadExternalContent")}
          </Button>
        )}
        <div
          className="mail-body-content overflow-x-auto text-sm leading-relaxed break-words text-foreground-800 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-background-200 [&_blockquote]:pl-3 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:text-sm [&_ul]:list-disc [&_ul]:pl-5"
          dangerouslySetInnerHTML={{ __html: sanitizedHtml.html }}
        />
      </div>
    );
  }

  if (!bodyText.trim()) {
    return (
      <p className="text-sm text-foreground-400" role="status">
        {t("emptyBodyLabel")}
      </p>
    );
  }

  return (
    <pre
      className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground-800"
      tabIndex={0}
      role="region"
      aria-label={t("bodyLabel")}
    >
      {bodyText}
    </pre>
  );
}
