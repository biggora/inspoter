"use client";

import { useMemo, useSyncExternalStore } from "react";
import DOMPurify from "dompurify";

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

function removeForegroundStyles(styleText: string): string {
  const probe = document.createElement("span");
  probe.setAttribute("style", styleText);
  probe.style.removeProperty("color");
  probe.style.removeProperty("-webkit-text-fill-color");
  return probe.getAttribute("style")?.trim() ?? "";
}

function sanitizeHtml(dirty: string): string {
  if (!hookRegistered) {
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName === "color") {
        data.keepAttr = false;
      }
      if (data.attrName === "style") {
        data.attrValue = removeForegroundStyles(data.attrValue);
        data.keepAttr = data.attrValue.length > 0;
      }
    });

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
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["style", "form", "input"],
  });
}

function subscribeNoop() {
  return () => {};
}

export function MailBody({ bodyText, bodyHtml }: MailBodyProps) {
  const isHydrated = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const sanitizedHtml = useMemo(
    () => (isHydrated && bodyHtml ? sanitizeHtml(bodyHtml) : null),
    [isHydrated, bodyHtml],
  );

  if (bodyHtml) {
    if (sanitizedHtml === null) return null;
    return (
      <div
        className="mail-body-content overflow-x-auto text-sm leading-relaxed break-words text-foreground-800 [&_a]:text-accent-600 [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-background-200 [&_blockquote]:pl-3 [&_blockquote]:text-foreground-500 [&_img]:h-auto [&_img]:max-w-full [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-2 [&_table]:text-sm [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
      />
    );
  }

  return (
    <pre className="font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-foreground-800">
      {bodyText}
    </pre>
  );
}
