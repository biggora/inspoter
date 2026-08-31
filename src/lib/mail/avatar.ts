// Initials avatars for mail: the message list and the reading pane draw one per
// sender, the dashboard mail widget draws one per mailbox, contacts draw one
// per person. Kept in a dependency-free module so a widget can reuse it
// without pulling the whole mail client into the dashboard bundle.

// Avatars pick from a fixed palette of opaque background/foreground pairs, not
// a free-form hue: every pair is verified ≥4.5:1 (WCAG AA) in BOTH themes
// (axe color-contrast, e2e/mail-client.spec.ts). The foreground must come from
// the pair — a theme-reactive class like text-background-50 flips to near-black
// in dark mode and drops every avatar below the ratio floor.
const AVATAR_FOREGROUND = "oklch(0.985 0.002 95)"; // light --background-50

const AVATAR_BACKGROUNDS = [
  "oklch(0.5 0.15 25)", // terracotta red
  "oklch(0.5 0.12 60)", // amber
  "oklch(0.5 0.08 95)", // olive sand
  "oklch(0.5 0.11 145)", // green
  "oklch(0.5 0.1 175)", // teal
  "oklch(0.5 0.1 230)", // blue
  "oklch(0.5 0.1 265)", // violet
  "oklch(0.5 0.12 330)", // rose
] as const;

export type AvatarStyle = {
  backgroundColor: string;
  color: string;
};

// Deterministic avatar colors from the sender string: the same name always
// maps to the same palette slot across the mail list, reading pane, widgets,
// and contacts.
export function avatarStyle(key: string): AvatarStyle {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash);
  }
  const background =
    AVATAR_BACKGROUNDS[Math.abs(hash) % AVATAR_BACKGROUNDS.length];
  return { backgroundColor: background, color: AVATAR_FOREGROUND };
}

export function getInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";
  return trimmed
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}
