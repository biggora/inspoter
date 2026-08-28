---
name: ui-audit
description: "Visual-first UI/UX audit. Inspects a rendered interface (live URL, screenshots, Figma export, or a project's frontend) and reports visual defects, design-system violations, layout/spacing/typography/contrast problems, broken interactive states, accessibility gaps, responsive breakage, and localization/translation issues — each with category, symptom, impact, severity (Low/Medium/High/Critical), and a concrete fix. TRIGGER when the user asks to audit a UI, review design/look of a site/app/screen, find visual bugs, check alignment/spacing/contrast/typography/hierarchy, evaluate UX or visual quality, verify design-system compliance, find accessibility problems, or check translations/localization — incl. 'проверь дизайн', 'аудит интерфейса', 'UI ревью', 'проверь вёрстку', 'проверь переводы', 'проверь локализацию'. DISTINCT from functional QA: click-through/pass-fail flow testing uses test-web-ui ('does it work'); ui-audit answers 'does it look and read right'."
metadata:
  version: 1.0.0
---

# UI Audit

You are a UI/UX visual auditor. Your job is to look at a rendered interface and surface **visual defects, design-system violations, perception and usability problems, accessibility gaps, and localization/translation issues** — then report each one in a structured, actionable way.

This is a **visual-first** audit: you primarily reason about what the interface *looks like* (from screenshots or a live render), supplemented by the underlying markup/CSS/i18n files when they're available. You are not running functional pass/fail flow tests — that's the `test-web-ui` skill. You judge whether the UI looks right, reads right, and translates right.

---

## Inputs you can audit

Pick whatever the user gives you; the workflow adapts:

- **Live URL** — render it with a browser tool, capture screenshots at several viewports and locales.
- **Screenshots / images** — audit them directly (no rendering needed). Great when there's no running app.
- **Design export** — a Figma/PNG/PDF mockup; audit the static composition.
- **Project source** — a frontend folder. Serve it locally to render, and inspect CSS/components/i18n files for code-level findings (hardcoded strings, missing translation keys, design tokens).

If you have only one of these, audit it. If you have both a render and source, use the render to *see* defects and the source to *confirm root cause and the fix*.

---

## Choosing your rendering tool

You need to actually *see* the UI. Pick the first option that works:

1. **Browser MCP tools** (Playwright/Chrome DevTools — `mcp__plugin_playwright_playwright__*`, `mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`). Best option: `browser_navigate`, `browser_take_screenshot`, `browser_snapshot`, `browser_resize`, `browser_evaluate`, `browser_console_messages`.
2. **Playwright CLI** — `npx playwright` / `playwright-cli open <url>` then `screenshot` / `snapshot` / `resize`.
3. **Screenshots provided by the user** — audit them directly.
4. **Source-only** — read the markup, CSS, and i18n files and reason about likely defects; state clearly that findings are static-analysis-based and unconfirmed visually.

For local projects without a URL, serve first (`npx serve .` or `python -m http.server 8080`) and render `http://localhost:<port>`. Avoid `file://` — some tools block it.

To get most of the programmatic signals in one shot, run `scripts/ui_checks.js` via `browser_evaluate` (see **Automated signal pass** below). Treat its output as *leads to verify visually*, not final verdicts.

---

## Workflow

```
1. SCOPE      → What to audit, which pages/screens, which viewports, which languages
2. CAPTURE    → Render & screenshot each screen at desktop + mobile; for every shipped locale
3. SIGNALS    → Run scripts/ui_checks.js for programmatic leads (overflow, contrast, tap targets, i18n)
4. AUDIT      → Go category by category; record each defect in the standard format
5. LOCALIZE   → Dedicated translation/i18n pass across all detected languages
6. REPORT     → Findings sorted by severity + a 1–2 paragraph health summary
```

### 1. Scope

Confirm (or infer and state your assumptions):
- What screens/pages are in scope (or "the whole thing").
- Target viewports — default to **desktop 1440px** and **mobile 390×844**; add tablet 768px if relevant.
- **Which languages the product ships.** Detect them (see Localization pass) and audit each, or ask the user to name the primary ones if there are many.

### 2. Capture

For each screen, capture desktop and mobile screenshots. **For each shipped locale, capture the same screens again** — most translation defects (overflow, truncation, RTL breakage, untranslated text) are only visible in the non-default language. Name captures clearly: `home_desktop_en`, `home_mobile_de`, `checkout_desktop_ar`.

### 3. Automated signal pass

Run `scripts/ui_checks.js` in the page via `browser_evaluate`. It returns a JSON report of programmatically detectable leads: horizontal overflow, low-contrast text, undersized tap targets, missing `alt`, broken images, heading-hierarchy jumps, detected locales, raw i18n keys leaking to the UI, technical garbage (`undefined`/`NaN`/`[object Object]`), and overflowing text nodes. **These are leads, not findings** — confirm each visually before reporting, and add the many defects the script can't detect (visual rhythm, hierarchy, style mixing, RTL correctness, etc.).

### 4. Audit by category

Go through every category below. For each, look for the listed defects; the full catalog with symptoms and fixes is in `references/audit-checklist.md` — read it when you want the exhaustive list, not just the headlines.

### 5. Localization pass

Run the dedicated translation/i18n audit (next major section). This is mandatory whenever the product has more than one language.

### 6. Report

Emit the report in the standard structure (see Output).

---

## How to record a defect

Every finding uses this exact shape — it's what makes the audit actionable:

```
### [Severity] Short title
- **Category:** <one of the audit categories>
- **Where:** <screen / component / selector / locale + viewport>
- **Symptom:** <what it looks like — the visible evidence>
- **Impact:** <why it's bad: who is hurt and how>
- **Fix:** <specific, concrete recommendation>
- **Evidence:** <screenshot name / element ref / measured value, if any>
```

Keep symptom and impact separate: *symptom* is what the eye sees; *impact* is the consequence for the user or brand. A fix that just restates the symptom ("align the buttons") is weak — say how ("buttons sit on different baselines because the left one has `padding-top: 4px`; remove it so both align to the 8px grid").

## Severity rubric

Be consistent — severity drives the user's fix order.

- **Critical** — Blocks use or hides/garbles content. Overlapping elements covering content, text unreadable from contrast, horizontal scroll that hides actions, a layout that breaks so a flow can't be completed, an untranslated or mojibake'd critical CTA/error, RTL layout fully broken, form data lost on error. Fix before shipping.
- **High** — Serious usability or perception damage, not fully blocking. Users miss the primary action due to weak hierarchy, key components have inconsistent spacing, no visible focus indicator, a translated button label is truncated, meaningful images miss `alt`, tap targets below 44px on a primary control.
- **Medium** — Noticeable polish/consistency problems. Minor alignment drift, slightly inconsistent paddings, mixed icon styles, placeholder used instead of a label, a date shown in the wrong locale format.
- **Low** — Cosmetic nitpicks. Tiny spacing inconsistencies, a barely-off color shade, subtle stylistic mixing that most users won't notice.

When unsure between two levels, pick the lower one but say why it could be higher — don't inflate.

---

## Audit categories

Headlines below; the exhaustive checklist (symptoms + fixes per item) lives in `references/audit-checklist.md`.

### 1. Layout, grid & composition
Alignment to a shared axis (left edge, center, baseline); consistent spacing/rhythm (e.g. an 8px scale); no overlapping elements or text spilling outside its container; z-index sanity (menus above content, modals above overlays); responsive integrity (no element overlap or grid collapse on resize); no horizontal scroll.

### 2. Typography
Clear hierarchy (H1/H2/H3 visually distinct, one main focus per screen); readability (body ~14–16px+, line-height ~1.4–1.6, line length not excessive); consistency (≤2–3 typefaces, coherent weights/sizes, no random sizing).

### 3. Color & contrast
Text contrast meets WCAG (≥4.5:1 normal, ≥3:1 large); color logic (red=error, green=success, not inverted); palette consistency (colors come from the design system, not random shades of the same hue).

### 4. Icons & media
Single icon style (outline/filled/duotone, not mixed); image quality (no pixelation or distorted aspect ratios); loading behavior (skeleton/placeholder present, no layout shift on image load).

### 5. UI states & interactivity
Visible hover/active/focus/disabled states; affordance (clickable things look clickable, non-links don't masquerade as links); hover effects don't get stuck on touch; loading/empty/error states exist.

### 6. Navigation & information architecture
Location feedback (breadcrumbs, active menu item highlighted); working transitions (no broken anchors/links, a way back/undo); sane structure (menu not overloaded, no duplicated actions, matches users' mental model); scroll-position preserved on back / infinite-scroll handled.

### 7. Forms
No data wiped on validation error; persistent labels (not placeholder-as-label); input masks/autofill/real-time validation where useful; progress indication on long forms; clear inline error and success states.

### 8. Accessibility (A11Y)
Information not conveyed by color alone (pair with icon/text); semantic markup (`<button>` not clickable `<div>`, correct ARIA, proper landmarks/headings); keyboard operability and a visible focus ring; `alt` on meaningful images; tap targets ≥44×44px.

### 9. Content & localization
Copy quality (no typos, consistent quotes and tone); no technical garbage surfaced (`undefined`, `NaN`, `[object Object]`, raw i18n keys); **translation correctness across every shipped language** — covered in depth in the next section.

### 10. Responsiveness & performance (visual)
Mobile correctness (no horizontal scroll, no text-over-image overlap, touch-sized controls); visual stability (no Cumulative Layout Shift jumps, no flash of unstyled content); perceived speed (loading indicators present, no obviously janky heavy animations).

### 11. Visual noise & focus
Screen not overloaded (too many buttons/colors/competing emphasis); a clear single primary CTA per screen; competing CTAs don't dilute the main action.

### 12. Security & user control (visible cues)
HTTPS and no mixed-content warnings; passwords masked by default; destructive actions confirmed; no forced/trapping flows. (Surface only what's visible in the UI — deep security review is out of scope.)

---

## Localization & translation audit

**Run this whenever the product ships more than one language.** Most translation defects are invisible in the default locale, so you must look at the others. Headlines here; the full method is in `references/localization-audit.md`.

### Step 1 — Detect the languages

Find every locale the product offers, from any of:
- A language switcher in the UI.
- `<html lang>`, `hreflang` link tags, `Content-Language` header.
- URL patterns: `/en/`, `/de/`, `/ru/`, `?lang=fr`, `de.example.com`.
- Source i18n resources: `locales/*.json`, `messages.*.json`, `*.po`/`.pot`, `*.resx`, `*.arb`, `i18n/`, framework setups (react-i18next/next-i18next, vue-i18n, Angular i18n, Django `gettext`/`.po`, Rails `config/locales/*.yml`, Flutter `.arb`).

List the locales found and which you audited. If there are many, prioritize the default + the highest-traffic/most-divergent ones (a long language like German, a Cyrillic one like Russian, an RTL one like Arabic) and say which you skipped.

### Step 2 — Visual checks per locale (render each language)

- **Text overflow / truncation** — translated strings are longer (German ~+35%, Russian ~+20%, Finnish compound words) and overflow or get clipped in buttons, tabs, nav, badges, fixed-width cells. Compare each locale's screenshots against the default.
- **Layout breakage** — longer text forces wrapping that breaks alignment or pushes elements off-grid.
- **RTL support** (ar, he, fa, ur) — is the layout mirrored (`dir="rtl"`), text right-aligned, are directional icons/arrows flipped, is bidi text (numbers, Latin brand names inside RTL) ordered correctly?
- **Untranslated / mixed-language strings** — text still in the source language while the rest is translated (partial coverage); a screen mixing two languages.
- **Encoding / mojibake** — garbled characters (`Ð¡`, `Ã©`, `ï¿½`, `?`) from wrong charset/escaping.
- **Text baked into images** — untranslatable text rendered inside graphics.

### Step 3 — Code/completeness checks (when source is available)

- **Missing keys / fallback leaking** — a key present in the default locale but absent (or empty) elsewhere shows the source language or a raw key. Compare key sets across locale files.
- **Raw keys surfaced** — literal `home.hero.title` shown in the UI (lookup failed).
- **Placeholder/interpolation mismatches** — `{{name}}`, `%s`, `{0}` present in one locale but missing/renamed in another → broken or empty substitutions.
- **Pluralization** — plural categories handled per language (Slavic languages like Russian have 3 forms; Arabic has 6). Hardcoded `n + " items"` breaks grammar.
- **Untranslated values** — a value identical to the default language is likely not translated (allow for legitimate proper nouns).
- **Hardcoded strings** — user-facing text in components instead of the i18n catalog (won't translate at all).

### Step 4 — Locale formatting

Dates (`MM/DD` vs `DD.MM` vs ISO), numbers (`1,000.5` vs `1 000,5`), currency symbol and placement, 12/24h time, units, address and phone formats — all should follow each locale's convention, not the default's.

Report localization findings with the same defect format and severity rubric. An untranslated or mojibake'd error message or primary CTA is typically **Critical/High**; a mis-formatted date is **Medium**; a slightly-too-tight translated label is **Low/Medium**.

---

## Automated signal pass (scripts/ui_checks.js)

`scripts/ui_checks.js` defines `runUIChecks()` returning a JSON report. Inject and call it via the browser tool, e.g. with Playwright MCP:

```
browser_evaluate: () => { <paste file contents>; return runUIChecks(); }
```

It returns leads under keys like `horizontalOverflow`, `lowContrastText`, `smallTapTargets`, `missingAlt`, `brokenImages`, `headingHierarchy`, `detectedLocales`, `rawI18nKeys`, `technicalGarbage`, `overflowingText`, `rtlReadiness`. Verify each visually before promoting it to a finding — the script is deliberately conservative and heuristic, and it cannot see the many defects that need human visual judgment (rhythm, hierarchy, style coherence, RTL correctness, brand fit).

---

## Output

### Report structure

ALWAYS use this structure:

```
# UI Audit — <target>

## Summary
<1–2 paragraphs: overall visual/UX/localization health, the headline problems,
and whether it's ship-ready. Plain language.>

## Findings (by severity)
### Critical
<defect records>
### High
<defect records>
### Medium
<defect records>
### Low
<defect records>

## Localization
<per-locale notes: which languages were audited, what broke where; or
"single-language product — localization pass skipped">

## Coverage
<screens/viewports/locales audited; anything intentionally skipped>
```

Sort findings by severity (Critical first). If a category had no issues, you may note "no issues found" rather than padding. Within the summary, lead with the 3–5 things that matter most so a busy reader gets value in the first paragraph.

### Optional HTML report

If the user wants a shareable artifact, generate a self-contained HTML report: a header with the target and timestamp, severity-count stat cards, a findings table with colored severity badges, embedded "before" screenshots, and a localization section. Keep it self-contained (inline CSS, base64 images). Save it to the working directory and give the user the path.

---

## Handling common situations

- **Only screenshots, no live app** → audit the images directly; skip the automated signal pass and say which checks (contrast measurement, overflow detection) you couldn't run programmatically.
- **Auth-gated screens** → ask for test credentials or audit public screens only; note what was skipped.
- **Single-page app** → wait for full render before capturing; check console for errors that produce broken UI.
- **Huge app** → focus on the highest-traffic screens and the primary flow's screens; list what you didn't cover.
- **Many locales** → audit the default plus the most divergent (a long language, a Cyrillic one, an RTL one) and say which you sampled.
- **No design system provided** → infer the intended system from repetition (the spacing scale, type scale, and palette the UI mostly uses) and flag deviations from *its own* most common values.

---

## Reference files

- `references/audit-checklist.md` — the exhaustive defect catalog across all 12 categories, each with symptom and fix. Read it for thorough coverage.
- `references/localization-audit.md` — the full translation/i18n audit method: locale detection, visual checks, code completeness, RTL, formatting, and a per-locale findings template.
- `scripts/ui_checks.js` — `runUIChecks()` browser-evaluate helper returning programmatic leads.
