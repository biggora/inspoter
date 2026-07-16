"use client";

import { useState } from "react";

// AC-BM-011: renders the configured icon when set; otherwise a deterministic
// fallback (initials tile with token-derived tint) — never a broken image.
// `icon` is a plain reference value per PRD A-2/OQ-8 (emoji, short icon-name
// string, or an image URL) — no upload, no favicon fetch.

function isImageReference(value: string): boolean {
  return (
    /^(https?:)?\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("data:")
  );
}

function hashValue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);

  if (words.length === 0) {
    return "?";
  }

  return words.map((word) => word.charAt(0).toUpperCase()).join("");
}

// AC-BM-015/016: an explicit `color` token overrides the deterministic
// hash-derived tone below with the matching brand family. Keys mirror
// bookmarkColorTokens (src/lib/validation/bookmarks.ts).
const COLOR_TOKEN_TONE_CLASSES: Record<string, string> = {
  primary: "bg-primary-100 text-primary-700",
  accent: "bg-accent-100 text-accent-700",
  secondary: "bg-secondary-100 text-secondary-700",
};

export function BookmarkIcon({
  icon,
  name,
  color,
}: {
  icon?: string | null;
  name: string;
  color?: string | null;
}) {
  const trimmedIcon = icon?.trim();
  const isImage = Boolean(trimmedIcon && isImageReference(trimmedIcon));

  // A failed image load (e.g. a suggested favicon URL 404ing or timing out)
  // falls back to the same deterministic tile as "no icon set" — reset via
  // React's "adjust state while rendering on prop change" idiom (mirrors
  // bookmark-dialog.tsx's prevState pattern) rather than an effect, so a new
  // `icon` value (different bookmark, or a newly picked favicon) always gets
  // a fresh attempt to load.
  const [imageFailed, setImageFailed] = useState(false);
  const [prevIcon, setPrevIcon] = useState(icon);
  if (icon !== prevIcon) {
    setPrevIcon(icon);
    setImageFailed(false);
  }

  if (trimmedIcon && isImage && !imageFailed) {
    // Arbitrary operator-supplied external hosts; next/image would require
    // per-host remotePatterns config in next.config.ts, out of scope here.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trimmedIcon}
        alt=""
        className="size-10 shrink-0 rounded-lg object-cover"
        onError={() => setImageFailed(true)}
      />
    );
  }

  const toneClasses = [
    "bg-primary-100 text-primary-700",
    "bg-accent-100 text-accent-700",
    "bg-secondary-100 text-secondary-700",
  ] as const;
  const toneClass =
    (color && COLOR_TOKEN_TONE_CLASSES[color]) ||
    toneClasses[hashValue(name) % toneClasses.length];

  if (trimmedIcon && !isImage) {
    return (
      <span
        aria-hidden
        className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold ${toneClass}`}
      >
        {trimmedIcon}
      </span>
    );
  }

  return (
    <span
      aria-hidden
      className={`flex size-10 shrink-0 items-center justify-center rounded-lg text-xs font-semibold ${toneClass}`}
    >
      {getInitials(name)}
    </span>
  );
}
