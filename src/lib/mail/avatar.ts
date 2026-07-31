// Initials avatars for mail: the message list and the reading pane draw one per
// sender, the dashboard mail widget draws one per mailbox. Kept in a
// dependency-free module so a widget can reuse it without pulling the whole
// mail client into the dashboard bundle.

// Deterministic avatar color from the sender string (prototype
// specs/prototype/src/pages/mail/page.tsx stringToColor). Lightness is
// dropped from the prototype's 0.55 to 0.5: greenish hues at 0.55 sit just
// under the 4.5:1 WCAG AA contrast ratio against the near-white initials
// (axe color-contrast, e2e/mail-client.spec.ts).
export function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `oklch(0.5 0.16 ${hue})`;
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
