# Localization & Translation Audit

The full method behind the Localization pass in `SKILL.md`. Run it whenever a product ships more than one language. The core insight: **translation defects hide in the non-default locales**, so you must render and inspect each language — auditing only the default tells you almost nothing about whether localization works.

## Table of contents
1. Detect the languages
2. Visual checks per locale
3. Code & completeness checks
4. RTL (right-to-left) audit
5. Locale formatting
6. Technical i18n smells
7. Severity guidance for localization findings
8. Per-locale findings template

---

## 1. Detect the languages

Enumerate every locale the product offers. Look across all of these — different stacks expose locales differently:

**From the rendered UI / HTTP layer**
- A language switcher / locale dropdown in the header, footer, or settings.
- `<html lang="…">` on each rendered locale.
- `hreflang` `<link rel="alternate" hreflang="…">` tags in `<head>` (also list the `x-default`).
- `Content-Language` response header.
- URL patterns: path prefix `/en/`, `/de/`, `/ru/`; query `?lang=fr` / `?locale=fr`; subdomain `de.example.com`; ccTLD `example.fr`.

**From source (when you have the project)**
- Resource files: `locales/<lang>/*.json`, `messages.<lang>.json`, `<lang>.json`, `*.po` / `*.pot` (gettext), `*.resx` (.NET), `*.arb` (Flutter), `*.xliff`/`.xlf`, `*.strings` (iOS), `strings.xml` per `values-<lang>/` (Android).
- Framework config: `react-i18next` / `next-i18next` (`i18n` block in `next.config.js`, `next-i18next.config.js`), `vue-i18n`, `@angular/localize` (`angular.json` i18n locales), Django `LANGUAGES` + `locale/<lang>/LC_MESSAGES/django.po`, Rails `config/locales/<lang>.yml`, `formatjs`/`react-intl`.

**Output of this step:** a list of detected locales, the default/source locale, and which you will actually audit. With many locales, sample strategically — always the default plus:
- a **long** language (German, Finnish) to expose overflow,
- a **non-Latin** language (Russian/Cyrillic, Chinese, Japanese, Thai) to expose font/wrapping issues,
- an **RTL** language (Arabic, Hebrew) to expose mirroring issues.
State which locales you sampled and which you skipped.

---

## 2. Visual checks per locale

Render the same screens in each audited locale and compare against the default. Capture screenshots named `<screen>_<viewport>_<locale>`.

- **Text overflow / truncation** — translated strings are usually longer than English (rough expansion: German +35%, Russian/Romance +15–30%, Finnish compound words can be extreme; CJK is shorter but taller). Watch fixed-width or single-line controls: buttons, tabs, nav items, chips/badges, table headers, truncating table cells, segmented controls, tooltips. Symptoms: text clipped with/without ellipsis, spilling past the control border, pushing siblings out of line, or wrapping to a second line that breaks the component's height.
- **Layout breakage from wrapping** — longer text wraps and shoves the grid off, misaligns cards, or collides with adjacent elements.
- **Truncated meaning** — an ellipsis that hides the actionable part of a label (e.g., a button reading "Confirm purcha…").
- **Untranslated / mixed-language** — some strings remain in the source language while the surrounding UI is translated (partial coverage); a single screen showing two languages.
- **Encoding / mojibake** — garbled glyphs from wrong charset or double-encoding: `Ð¡Ð»Ð¾Ð²Ð¾`, `Ã©`, `â€"`, the replacement char `ï¿½`/`�`, or boxes/`?` where a glyph is missing from the font.
- **Font coverage** — the chosen font lacks glyphs for the script (common with Cyrillic, CJK, Arabic, Devanagari) → tofu boxes or a jarring fallback font.
- **Text baked into images** — text rendered inside a raster graphic can't be translated; flag any in-image UI copy.

---

## 3. Code & completeness checks (when source is available)

Compare locale resource files against the default/source locale.

- **Missing keys → fallback leaking** — a key present in the default but absent in another locale. Depending on config this renders the source-language fallback (a mixed-language screen) or the **raw key**. Diff the key sets of each locale against the default; list keys missing per locale.
- **Empty values** — the key exists but its value is `""` → blank UI where text should be.
- **Raw keys surfaced** — a literal lookup string shown to the user (`home.hero.title`, `cart.empty`). In the render, any visible token matching `word.word(.word)+` with no spaces is a strong signal the lookup failed.
- **Placeholder / interpolation mismatch** — variables must match across locales. If the default has `Hello, {{name}}` (or `%s`, `{0}`, `${count}`, `%1$s`) and a locale drops/renames the placeholder, substitution breaks or shows the literal token. Check each framework's syntax: `{{var}}` (i18next/Handlebars), `{var}` (ICU/react-intl), `%s`/`%1$s` (gettext/Android), `%@`/`%1$@` (iOS), `${var}` (template literals).
- **Pluralization** — plural rules differ by language. English has 2 forms (one/other); Russian and other Slavic languages have **3** (one/few/many); Arabic has **6** (zero/one/two/few/many/other); Japanese/Chinese have 1. Hardcoded `count + " items"` or a naive `if (n === 1)` breaks grammar in most languages. Check that plurals use ICU `plural`/`select` or the framework's plural API and that each locale defines the categories it needs.
- **Untranslated values** — a value byte-identical to the default language is probably untranslated. Allow legitimate exceptions (brand names, proper nouns, codes like "OK", "Email" where it's the loanword). Flag the rest.
- **Hardcoded strings** — user-facing text written directly in components/templates instead of going through the i18n catalog; it will never translate. Look for literal sentences in JSX/Vue templates/HTML rather than `t('key')` calls.
- **Stale / orphan keys** — keys in a locale that no longer exist in the default (dead translations) — minor, but worth a note.

---

## 4. RTL (right-to-left) audit

For Arabic (`ar`), Hebrew (`he`), Persian (`fa`), Urdu (`ur`):

- **Direction** — `dir="rtl"` set on `<html>` or the locale root; the whole layout mirrors (navigation, sidebars, progress flows move right→left).
- **Text alignment** — body text right-aligned; logical properties (`margin-inline-start`, `padding-inline-end`, `text-align: start`) used so spacing mirrors instead of staying stuck to the left.
- **Directional icons** — arrows, chevrons, back/forward, "next", progress, carousels, and breadcrumb separators flip horizontally. Icons with no inherent direction (search, settings) must **not** flip.
- **Bidi text** — numbers, Latin-script brand names, code, URLs, and prices embedded in RTL text keep correct order (no scrambled "‪123‬ مثال"). Currency/sign placement correct.
- **Mixed-direction inputs** — fields accepting both scripts handle caret and alignment sanely.
- **No leftovers** — nothing remains hard-left-aligned or with hardcoded `left:`/`margin-left:` that should be logical.

Symptom of failure: an RTL locale that looks like the LTR layout with merely right-aligned text — a sign mirroring was never implemented.

---

## 5. Locale formatting

Each locale should use its own conventions, not the default's:

- **Dates** — `MM/DD/YYYY` (US) vs `DD.MM.YYYY` (much of Europe) vs `YYYY-MM-DD` (ISO/East Asia); month names translated; correct first day of week in pickers.
- **Numbers** — decimal and grouping separators differ: `1,234.56` (US/UK) vs `1.234,56` (DE) vs `1 234,56` (FR/RU). A raw `toString()` or hardcoded format is wrong for some locale.
- **Currency** — symbol, its placement (`$1,000` vs `1 000 €`), and code; don't just swap the symbol while keeping the source number format.
- **Time** — 12h (AM/PM) vs 24h.
- **Units** — metric vs imperial where the product localizes measurements.
- **Names, addresses, phone** — field order and formats vary; phone input masks should match the locale/region.

Prefer platform formatters (`Intl.NumberFormat`, `Intl.DateTimeFormat`, ICU `MessageFormat`, CLDR data) over hand-rolled formatting — flag hand-rolled formatting as the likely root cause.

---

## 6. Technical i18n smells

Quick tells that localization is breaking, in the render or logs:
- Visible `undefined`, `null`, `NaN`, `[object Object]`, `Invalid Date` inside otherwise-translated UI.
- Raw keys (`profile.settings.title`) shown literally.
- Sentences assembled by **concatenating** translated fragments (`t('you have') + count + t('messages')`) — grammar/word-order breaks in other languages; flag concatenation in favor of full interpolated strings.
- A single English word stuck in an otherwise translated sentence (a missing sub-key).
- Console warnings from the i18n library ("missing key", "missing pluralization").

---

## 7. Severity guidance for localization findings

Apply the standard rubric, calibrated for localization:
- **Critical** — an untranslated or mojibake'd **error message, legal text, or primary CTA**; RTL layout fully broken so the locale is unusable; a wrong number/currency format on prices or payments.
- **High** — a truncated/overflowing label on a primary control; large sections untranslated; broken pluralization producing wrong grammar on visible counts; missing keys leaking raw tokens on a main screen.
- **Medium** — wrong date/number format in non-critical places; placeholder-as-label not translated; a secondary label slightly clipped; inconsistent terminology between screens.
- **Low** — minor wording inconsistency, a barely-tight translated label, an orphan/stale key.

---

## 8. Per-locale findings template

Summarize the localization pass with one block per audited locale, then fold individual defects into the main report using the standard defect format.

```
### Locale: <code> (<language name>)  — dir: <ltr|rtl>
- Source available: <yes/no>  | Screens rendered: <list>
- Completeness: <e.g. "12 keys missing vs default (listed below)"> 
- Overflow/truncation: <where>
- RTL: <n/a | pass | issues: …>
- Formatting: <dates/numbers/currency issues>
- Untranslated/mixed: <where>
- Encoding: <ok | mojibake at …>
- Notable defects: <ids/titles, detailed in main Findings>
```

If the product is single-language, state that and skip the pass — but first confirm there really is only one locale (no switcher, single `hreflang`, one resource file), since "no localization at all" can itself be a finding if the product targets multiple markets.
