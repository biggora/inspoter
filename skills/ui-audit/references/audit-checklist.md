# UI Audit — Full Defect Catalog

The exhaustive checklist behind the category headlines in `SKILL.md`. Each item lists what to **check**, the typical **defect**, the visible **symptom**, and a direction for the **fix**. Use it to make a pass thorough rather than to recite — report only what you actually observe, in the standard defect format.

## Table of contents
1. Layout, grid & composition
2. Typography
3. Color & contrast
4. Icons & media
5. UI states & interactivity
6. Navigation & information architecture
7. Forms
8. Accessibility (A11Y)
9. Content & localization
10. Responsiveness & performance (visual)
11. Visual noise & focus
12. Security & user control (visible cues)

---

## 1. Layout, grid & composition

### 1.1 Alignment & grid
- **Check:** elements share an axis (left edge, center, baseline); related controls sit on one line.
- **Defects:** an element "jumps" relative to neighbors; buttons not on one line; text blocks with different left indents; elements overlapping each other; text spilling outside its container.
- **Symptom:** the interface looks crooked, unstable, "off."
- **Fix:** align to the underlying grid; remove stray per-element padding/margins; give overlapping elements correct flow or positioning.

### 1.2 Spacing & rhythm
- **Check:** spacing is consistent (e.g. an 8px scale: 8/16/24/32); repeated components have identical internal/external spacing.
- **Defects:** different gaps between identical cards; elements crammed together or floating too far apart.
- **Symptom:** broken visual rhythm; the layout reads as "dirty."
- **Fix:** standardize on a spacing scale; apply the same spacing token to every instance of a repeated component.

### 1.3 Layering (z-index)
- **Check:** menus sit above content; modals sit above their overlay; nothing important is hidden behind another layer.
- **Defects:** dropdown rendered under the next section; modal beneath its dimming overlay; sticky header covering content.
- **Symptom:** content is clipped or unclickable; "ghost" overlaps.
- **Fix:** establish a stacking context order; fix `z-index`/positioning so interactive layers win.

### 1.4 Responsive integrity
- **Check:** on resize, elements don't overlap and the grid doesn't collapse.
- **Defects:** text runs onto an image; buttons pushed off-screen; horizontal scrollbar appears.
- **Symptom:** the UI looks broken on mobile/tablet.
- **Fix:** fluid/responsive containers, wrapping rules, min/max widths; test at 390px and 768px.

---

## 2. Typography

### 2.1 Hierarchy
- **Check:** H1/H2/H3 are visually distinct; there's a clear visual priority and a single focal point per screen.
- **Defects:** a heading looks like body text; everything is the same size.
- **Symptom:** the user doesn't know where to look first.
- **Fix:** a real type scale with distinct sizes/weights; emphasize the primary element.

### 2.2 Readability
- **Check:** body ~14–16px or larger; line-height ~1.4–1.6; line length not excessively long.
- **Defects:** lines too tight; dense text walls; over-long measure.
- **Symptom:** text is hard to read.
- **Fix:** raise size/line-height; cap line length (~60–80 chars); add paragraph spacing.

### 2.3 Consistency
- **Check:** ≤2–3 typefaces; coherent weights and sizes.
- **Defects:** fonts mixed without logic; arbitrary sizes scattered around.
- **Symptom:** the typography looks unsystematic.
- **Fix:** consolidate to the design system's families and scale.

---

## 3. Color & contrast

### 3.1 Contrast
- **Check:** text contrast meets WCAG — ≥4.5:1 for normal text, ≥3:1 for large/bold text and UI/graphic elements.
- **Defects:** gray text on a gray background; pale, washed-out buttons; low-contrast placeholder used as content.
- **Symptom:** poor legibility, especially in sunlight or for low-vision users.
- **Fix:** darken/lighten to pass the ratio; never rely on hairline contrast for important text.

### 3.2 Color logic
- **Check:** color maps to meaning (red = error/destructive, green = success, etc.).
- **Defects:** success shown in red, errors in a neutral color; inconsistent semantic colors.
- **Symptom:** users misread state.
- **Fix:** a semantic color set applied consistently.

### 3.3 Palette consistency
- **Check:** colors come from the design system.
- **Defects:** "random" hues; several near-identical shades of the same color used interchangeably.
- **Symptom:** the UI looks unbranded/patchwork.
- **Fix:** restrict to the token palette; collapse near-duplicate shades.

---

## 4. Icons & media

### 4.1 Icon style
- **Check:** one icon style throughout (outline / filled / duotone), consistent stroke and size.
- **Defects:** styles mixed; mismatched icon sizes in one row.
- **Fix:** a single icon set/style and a fixed icon sizing scale.

### 4.2 Image quality
- **Check:** correct resolution and preserved aspect ratio.
- **Defects:** pixelation/blur; stretched or squashed images; irrelevant stock photos.
- **Fix:** ship 2x assets, use `object-fit` to preserve ratio, pick meaningful imagery.

### 4.3 Loading behavior
- **Check:** placeholder/skeleton while media loads; reserved space for the image.
- **Defects:** layout shift as images pop in; UI "jumps."
- **Symptom:** content jumps under the cursor/finger.
- **Fix:** set width/height or aspect-ratio; use skeletons.

---

## 5. UI states & interactivity

### 5.1 Element states
- **Check:** hover, active, focus, disabled are all visible and distinct.
- **Defects:** no reaction on hover; no focus ring; disabled looks enabled.
- **Symptom:** the interface feels "dead" or unresponsive.
- **Fix:** define all interactive states; keep focus visible for keyboard users.

### 5.2 Affordance / clickability
- **Check:** clickable things look clickable; non-interactive things don't look like links/buttons.
- **Defects:** text styled like a link but inert; a button that looks like a label.
- **Symptom:** users click dead text or miss real actions.
- **Fix:** reserve link/button styling for real interactives; give true actions clear affordance.

### 5.3 Touch behavior
- **Check:** hover effects don't get "stuck" on touch devices after tap.
- **Defect:** a hover style sticks on a card after tapping on mobile.
- **Fix:** gate hover styles behind `@media (hover: hover)`.

---

## 6. Navigation & information architecture

### 6.1 Location feedback
- **Check:** breadcrumbs and/or an active/highlighted menu item show where the user is.
- **Defect:** no current-section indication.
- **Symptom:** users lose track of where they are.
- **Fix:** highlight the active nav item; add breadcrumbs on deep pages.

### 6.2 Transitions & links
- **Check:** anchors/links work; there's a way back and an undo for reversible actions.
- **Defects:** broken or jarring anchor jumps; dead links; no undo.
- **Fix:** fix link targets, soften scroll jumps, add back/undo affordances.

### 6.3 Structure
- **Check:** the menu isn't overloaded; actions aren't duplicated across sections; structure matches users' mental model.
- **Defects:** sprawling menu; same action in several places with different labels.
- **Fix:** simplify and group; one canonical place per action.

### 6.4 Scroll behavior
- **Check:** scroll position is preserved on back/refresh; infinite scroll has a fallback/pagination.
- **Defect:** scroll position lost on return, dumping the user at the top.
- **Fix:** restore scroll position; provide pagination or a footer escape for infinite lists.

---

## 7. Forms

### 7.1 Data preservation
- **Check:** a validation error does not wipe entered data.
- **Defect:** fields cleared on error.
- **Symptom:** the user must retype everything — a top frustration.
- **Fix:** preserve all valid inputs; only flag the offending field.

### 7.2 Labels
- **Check:** persistent labels, not placeholder-as-label.
- **Defect:** the only "label" is placeholder text that vanishes on input.
- **Symptom:** users forget what a half-filled field is for.
- **Fix:** visible persistent labels (a floating label is fine).

### 7.3 Input affordances
- **Check:** input masks (phone/date/card), autofill attributes, and real-time validation where helpful.
- **Defects:** no masks; autofill disabled; errors only surface on submit.
- **Fix:** add masks/`autocomplete`; validate inline as the user goes.

### 7.4 Length & progress
- **Check:** long/multi-step forms show progress.
- **Defect:** a giant single form with no sense of how much is left.
- **Fix:** step indicators or grouped sections.

### 7.5 Error & success states
- **Check:** clear inline errors near the field; a clear success confirmation.
- **Defect:** a generic top-of-page error with no pointer to the field.
- **Fix:** field-level messages; an unmistakable success state.

---

## 8. Accessibility (A11Y)

### 8.1 Don't rely on color alone
- **Check:** state/meaning is conveyed by icon/text too, not just color.
- **Defect:** an error field shown only by a red border.
- **Symptom:** invisible to color-blind users.
- **Fix:** pair color with an icon and text.

### 8.2 Semantic & assistive markup
- **Check:** semantic elements (`<button>`, `<nav>`, `<main>`), correct ARIA, `alt` on meaningful images, sensible heading order.
- **Defects:** clickable `<div>`s; missing/incorrect ARIA; missing `alt`; skipped heading levels.
- **Symptom:** screen readers misread or can't operate the UI.
- **Fix:** use native semantics first; add ARIA only where needed; one `h1`, no level skips.

### 8.3 Keyboard operability
- **Check:** everything works without a mouse; focus order is logical; the focus ring is visible.
- **Defects:** unreachable controls via Tab; invisible focus; focus traps.
- **Fix:** ensure tab order and visible focus; no traps.

### 8.4 Target size
- **Check:** tap/click targets ≥44×44px (≥24px minimum per WCAG 2.2, 44 recommended), with spacing between them.
- **Defect:** tiny touch targets crammed together.
- **Fix:** enlarge hit areas and add spacing.

---

## 9. Content & localization

### 9.1 Copy quality
- **Check:** no typos; consistent quotation marks; consistent tone of voice.
- **Defects:** spelling errors; mixed `"`/`«»`/`""`; tone lurching between formal and casual.
- **Fix:** proofread; pick one quote style and one voice.

### 9.2 Technical garbage
- **Check:** no raw system values surfaced to users.
- **Defects:** `undefined`, `null`, `NaN`, `[object Object]`, `Invalid Date`, a literal i18n key like `cart.empty.title`.
- **Symptom:** the product looks broken/unfinished.
- **Fix:** guard rendering with fallbacks; fix the data/format/lookup at the source.

### 9.3 Translation & localization
- See `references/localization-audit.md` for the full method. Headlines: translated text overflows controls; regional formats (dates/numbers/currency) unsupported; partial/missing translations; RTL breakage; encoding/mojibake.

---

## 10. Responsiveness & performance (visual)

### 10.1 Mobile correctness
- **Check:** no horizontal scroll; no text-over-image overlap; controls are touch-sized.
- **Defects:** content wider than the viewport; overlapping layers; tiny tap targets.
- **Fix:** responsive layout, wrapping, touch sizing; test at 360–414px widths.

### 10.2 Visual stability
- **Check:** no layout shift (CLS) as the page loads; no flash of unstyled content (FOUC).
- **Defects:** content jumps as images/ads/fonts load; an unstyled flash before CSS applies.
- **Fix:** reserve space (dimensions/aspect-ratio); preload critical CSS/fonts.

### 10.3 Perceived speed
- **Check:** loading indicators for slow operations; animations aren't janky/heavy.
- **Defects:** long blank waits (>3s) with no feedback; stuttering heavy animations.
- **Fix:** spinners/skeletons; lighten or GPU-accelerate animations.

---

## 11. Visual noise & focus

### 11.1 Overload
- **Check:** a reasonable number of elements/colors/emphasis competing per screen.
- **Defect:** too many buttons, colors, or bold elements all shouting.
- **Symptom:** the eye has nowhere to rest.
- **Fix:** reduce, group, and demote secondary elements.

### 11.2 Focal point / primary CTA
- **Check:** a single clear primary action per screen.
- **Defects:** no visual accent; or several equally-loud CTAs competing.
- **Symptom:** users hesitate, unsure what to do.
- **Fix:** one prominent primary CTA; make others secondary/tertiary.

---

## 12. Security & user control (visible cues)

Surface only what's visible in the UI; deep security review is out of scope.

- **HTTPS / mixed content** — the page is served over HTTPS with no insecure-content or certificate warnings.
- **Password masking** — passwords are masked by default (a reveal toggle is fine).
- **Destructive confirmation** — delete/irreversible actions ask for confirmation.
- **No forced/trapping flows** — the user isn't locked into a path with no exit; no dark patterns coercing the action.
- **Competing CTAs** — not so many loud calls-to-action that the safe/intended path is obscured.
