---
name: inspot-design
description: Use this skill to generate well-branded interfaces and assets for Inspot, either for production or throwaway prototypes/mocks/etc. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping.
user-invocable: true
---

Read the `readme.md` file within this skill, and explore the other available files.

Inspot is a dense, calm, operational **infrastructure control panel** (Russian-language). Its look:
warm-grey canvas, terracotta as the single brand action color, teal = "healthy", flat
**border-defined** surfaces (shadows only on menus/modals/toasts), small dense type
(Plus Jakarta Sans headings/numbers, Inter body, JetBrains Mono for IPs & logs), and
[Remix Icon](https://remixicon.com/) `-line` glyphs in tinted rounded tiles. No emoji, no gradients,
no illustrations.

Key files:
- `styles.css` — global entry; `@import`s all tokens & fonts. Link this one file.
- `tokens/` — oklch color ramps (light + `.dark`), typography, spacing, effects/motion.
- `components/` — `forms/`, `data-display/`, `feedback/` React primitives. Each has a `.d.ts`
  (props) and `.prompt.md` (usage). Load `_ds_bundle.js` and read from `window.InspotDesignSystem_*`.
- `ui_kits/inspot/` — interactive recreation of the control-panel shell + core screens.
- `readme.md` — full content, visual, and iconography guidelines.

If creating visual artifacts (slides, mocks, throwaway prototypes, etc), copy assets out and create
static HTML files for the user to view. If working on production code, copy assets and read the rules
here to become an expert in designing with this brand.

If the user invokes this skill without any other guidance, ask them what they want to build or
design, ask some questions, and act as an expert designer who outputs HTML artifacts _or_ production
code, depending on the need.
