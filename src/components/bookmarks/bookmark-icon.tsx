// AC-BM-011: renders the configured icon when set; otherwise a deterministic
// fallback (initials tile, hue derived from the bookmark name) — never a
// broken image. `icon` is a plain reference value per PRD A-2/OQ-8 (emoji,
// short icon-name string, or an image URL) — no upload, no favicon fetch.

function isImageReference(value: string): boolean {
  return (
    /^(https?:)?\/\//i.test(value) ||
    value.startsWith("/") ||
    value.startsWith("data:")
  );
}

function hashHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
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
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={trimmedIcon}
        alt=""
        className="size-6 shrink-0 rounded object-cover"
      />
    );
  }

  if (trimmedIcon) {
    return (
      <span
        aria-hidden
        className="flex size-6 shrink-0 items-center justify-center rounded bg-muted text-sm"
      >
        {trimmedIcon}
      </span>
    );
  }

  const letter = name.trim().charAt(0).toUpperCase() || "?";
  const hue = hashHue(name);
  return (
    <span
      aria-hidden
      className="flex size-6 shrink-0 items-center justify-center rounded text-[11px] font-semibold text-white"
      style={{ backgroundColor: `hsl(${hue}, 55%, 38%)` }}
    >
      {letter}
    </span>
  );
}
