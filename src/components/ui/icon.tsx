/**
 * Icon — thin wrapper around Remix Icon `-line` glyphs (loaded from the CDN
 * `<link>` in `app/layout.tsx`). This is the project's single icon system
 * (see `.agents/skills/inspot-design`): outline weight, ~16–20px, almost
 * always wrapped in a tinted `IconTile`.
 *
 * Why a wrapper instead of bare `<i className="ri-…">`:
 *  - centralizes the default `aria-hidden` (the visible label sits next to
 *    the icon; the icon itself is decorative for AT)
 *  - matches the call-site ergonomics of the lucide components it replaces
 *    (`<Plus />` → `<Icon name="ri-add-line" />`), so consumers can spread
 *    standard HTML attributes incl. `className`, `data-*`, `onClick`
 *  - keeps a single seam to touch if we ever self-host the font
 *
 * Sizing convention (mirrors primary nav): the glyph is sized via font-size,
 * so use Tailwind text-size utilities — `text-base` (16px), `text-lg` (18px),
 * `text-xl` (20px). Do NOT use `size-*` (those set width/height and have no
 * effect on a font-icon). The default is `text-base leading-none`.
 *
 * The `inline-block` + `min-width:1em` defaults give the `<i>` a non-zero
 * box even before the Remix Icon CSS arrives (or in test envs where the CDN
 * is blocked) — this keeps Playwright's visibility checks and layout
 * assertions honest. The CDN layer then layers `font-family: remixicon` on
 * top to actually paint the glyph.
 *
 * Accessibility: the icon is `aria-hidden` by default (decorative). Pass an
 * explicit `aria-hidden={false}` together with `aria-label` / `role` if the
 * icon must be announced (e.g. a status spinner, a standalone icon button).
 */
import { cn } from "@/lib/utils";

export type IconProps = React.HTMLAttributes<HTMLSpanElement> & {
  /** Remix Icon class, e.g. `"ri-add-line"`. */
  name: string;
};

export function Icon({ name, className, "aria-hidden": ariaHidden = true, ...props }: IconProps) {
  return (
    <i
      aria-hidden={ariaHidden}
      className={cn(
        name,
        "inline-flex min-w-[1em] min-h-[1em] items-center justify-center text-center text-base leading-none",
        className,
      )}
      {...props}
    />
  );
}
