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
  const words = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);

  if (words.length === 0) {
    return "?";
  }

  return words
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
}

export function BookmarkIcon({
  icon,
  name,
}: {
  icon?: string | null;
  name: string;
}) {
  const trimmedIcon = icon?.trim();

  if (trimmedIcon && isImageReference(trimmedIcon)) {
    // Arbitrary operator-supplied external hosts; next/image would require
    // per-host remotePatterns config in next.config.ts, out of scope here.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trimmedIcon}
        alt=""
        className="size-10 shrink-0 rounded-lg object-cover"
      />
    );
  }

  const toneClasses = [
    "bg-primary-100 text-primary-700",
    "bg-accent-100 text-accent-700",
    "bg-secondary-100 text-secondary-700",
  ] as const;
  const toneClass = toneClasses[hashValue(name) % toneClasses.length];

  if (trimmedIcon) {
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
