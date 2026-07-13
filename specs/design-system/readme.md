# Inspot Design System

Design system for **Inspot** — a self-hosted **infrastructure control panel** (панель управления)
for small teams running their own servers. One operator ("admin / Оператор") watches a fleet of
VPS boxes and everything attached to them: servers, domains + DNS, mail, backups, uptime
monitoring, logs, alerts and quick bookmarks. The whole product is a single authenticated
dashboard web app, in **Russian**, light + dark.

The interface personality: **dense, calm, operational.** It's a tool you keep open all day. Lots
of small type, status dots, tinted icon tiles and thin resource meters; almost no decoration.
Terracotta is the single brand accent; teal means "healthy".

## Sources

- **Codebase:** `prototype/` — a Vite + React 19 + React Router + Tailwind app (mounted locally,
  read-only). The design system is reverse-engineered from it. Key files:
  - `prototype/src/index.css` — the oklch color ramps (light + dark) and keyframes.
  - `prototype/tailwind.config.ts` — color/family token wiring.
  - `prototype/src/components/feature/AppLayout.tsx` — sidebar + topbar shell, nav inventory.
  - `prototype/src/pages/*` — dashboard, servers, domains, monitoring (recharts), mail, messages,
    logs, alerts, backups, bookmarks, settings, login.
  - `prototype/src/pages/**/components/*` — StatCard, ServerCard, settings tabs, etc.
- No brand book, logo file, or Figma was provided. See **Iconography** for the logo situation.

There is **no logo asset** in the sources. The app renders the wordmark **“Inspot”** in Plus Jakarta
Sans bold as its mark (and a rounded `In` tile when the sidebar is collapsed). This system does the
same — it does **not** invent a logo.

---

## CONTENT FUNDAMENTALS

**Language.** All product copy is **Russian**. Technical nouns stay in English/lowercase where
that's how operators say them: `web-prod-01`, `nginx`, `postgresql`, `CPU`, `RAM`, `Disk`, `Ubuntu
24.04 LTS`, `MB/s`. Log levels are uppercase English: `DEBUG · INFO · WARN · ERROR · CRIT`.

**Voice.** Terse, factual, operator-to-operator. Labels are single words or short noun phrases:
_Дашборд, Серверы, Домены, Мониторинг, Бэкапы, Почта, Сообщения, Логи, Оповещения, Настройки._
Buttons are imperatives: _Войти, Обновить, Повторить, Подтвердить, Отмена, Сохранить изменения,
Сбросить._

**Address.** Neutral/impersonal — no "ты/вы" theatrics. Messages describe system state, not
feelings: _«Все системы работают штатно», «Нет активных оповещений», «Hetzner недоступен»,
«Не удалось запустить сервер. Проверьте доступность и попробуйте снова.»_ Confirmations name the
object in «ёлочки»: _«Сервер «web-prod-01» будет остановлен.»_

**Casing.** Sentence case for UI text. **UPPERCASE + letter-spacing** only for micro-labels: stat
labels (`СЕРВЕРЫ`), table column headers (`СТАТУС`), and log-level/service tags. Numbers use a muted
denominator: **4** `/6`, **42** `%`.

**Counts & pluralization.** Real Russian plural forms: _1 сервер · 2 сервера · 6 серверов; 1 запись
· 2 записи · 12 записей._ Relative time is abbreviated: _Только что, 5м, 3ч, 2дн,_ then a date.

**Emoji:** none, ever. Status is carried by colored dots, tinted badges and Remix icons — never emoji.

**Tone examples**

- Empty: _«Нет серверов» / «В вашем аккаунте Hetzner пока нет активных VPS…»_
- Error: _«Не удалось загрузить дашборд» / «Проверьте подключение и попробуйте снова.»_
- Success toast: _«Профиль успешно обновлён», «Скопировано в буфер обмена»._
- Alert: _«upstream timed out (110: Connection timed out)…»_ (raw log strings shown verbatim, mono).

---

## VISUAL FOUNDATIONS

**Color.** Everything is authored in **oklch** as 11-step ramps (50→950), light and dark, and every
ramp supports an alpha (`oklch(var(--primary-500) / 0.5)`).

- **Background** — warm near-neutral grey (hue ~80). App canvas is `background-50`; surfaces are the
  same, separated by borders. Dark mode inverts the ramp.
- **Foreground** — cool blue-grey ink (hue 260). `foreground-950` headings → `foreground-400` meta.
- **Primary** — warm **terracotta red** (hue 30). The one brand action color; also stands in for
  destructive/danger (the app has no separate red-CTA).
- **Accent** — **teal** (hue 175). Positive / online / healthy / "OK".
- **Secondary** — muted **olive-sand** (hue 85). Neutral tints, idle/stopped chips, neutral icon tiles.
- **Semantic** — Tailwind `amber` (warning) and `red` (error/critical) for status only.
  Color is used in **tints**: a `-100` fill under a `-600/-700` icon/text is the dominant device
  (icon tiles, badges). Saturated fills are reserved for the primary button and active pills.

**Type.** `Plus Jakarta Sans` for headings/display and all numbers (semibold–bold), `Inter` for body
& UI, `JetBrains Mono` for IPs, sizes, durations, and log detail. The scale is **small and dense** —
14px body, 11–12px meta, 24px stat numbers, rarely larger. Uppercase micro-labels get `0.04em`
tracking.

**Spacing & layout.** 4px base grid. Compact controls (8–10px vertical padding), 16–20px card
padding, `gap`-based rows. Fixed shell: **256px** sidebar (collapses to a **64px** rail), **56px**
sticky topbar, content in `p-6` (24px). Cards live in responsive `grid` with `gap:16–20px`.

**Backgrounds.** Flat solid fills only. **No** gradients (except tiny chart-area fills), **no**
images, illustrations, textures or patterns anywhere in the chrome. The canvas is a single warm-grey.

**Borders, radius, elevation.** The UI is **border-defined, not shadow-defined.** 1px borders
(`background-200` for cards/controls, `background-100` for row dividers, `background-300` for
hover/inputs) do the separating. Radii: 8px on buttons/inputs/nav, **12px on cards/panels/modals**,
full-round on pills/switches/dots/avatars, 16px on empty-state wells. **Shadows are reserved for
floating layers only** — dropdown menus (soft) and modals/toasts (a bit deeper). Resting surfaces
never cast a shadow.

**Motion.** Quick and ease-out, **no bounce**. `fadeIn` (4px rise), `scaleIn` (0.95→1 for menus,
modals, cards mounting), `slideInRight` (16px, toasts). ~150–250ms. Progress/chart transitions 500ms.
A `shimmer` skeleton covers loading. Live/transitional dots use a gentle `pulse`. Reduced decoration —
motion communicates state changes, it doesn't entertain.

**States.**

- _Hover_ — surfaces lighten (`background-100` fill) and/or borders strengthen (`background-300`);
  text darkens (`foreground-600→900`). Primary button darkens (`primary-500→600`).
- _Active/selected_ — tinted fill + colored text: nav `primary-100 / primary-700`; pills
  `primary-500 / background-50`; tabs get a `primary-500` underline.
- _Focus_ — 1px terracotta ring on inputs; 2px offset ring on buttons.
- _Disabled_ — 0.4–0.5 opacity, `not-allowed`.
  No shrink-on-press; feedback is color, not scale.

**Imagery.** There is essentially none. Avatars are **initial monograms** on a tinted circle
(`primary-100` / `secondary-100`). Data viz (monitoring) uses **recharts** with the brand ramp:
terracotta + teal + sand lines/areas, `strokeDasharray` grids in `background-200`, mono-ish 11px axis
labels in `foreground-400`, tooltips as bordered `background-50` cards.

---

## ICONOGRAPHY

- **Icon set: [Remix Icon 4.5.0](https://remixicon.com/)**, loaded from CDN
  (`https://cdnjs.cloudflare.com/ajax/libs/remixicon/4.5.0/remixicon.min.css`) and used via
  `<i class="ri-*-line">`. This is the primary, near-exclusive icon system. Cards and UI kits in this
  project link the same CDN. The prototype also loads Font Awesome 6.4.0 but effectively everything
  visible is Remix Icon `-line` (outline) weight.
- **Style:** outline (`-line` suffix), ~1.5px stroke, consistent 16–20px sizing, almost always
  wrapped in a tinted `IconTile`. Filled (`-fill`) variants appear only inside alert severity badges.
- **Common glyphs:** `ri-server-line, ri-global-line, ri-dashboard-line, ri-hard-drive-3-line,
ri-mail-line, ri-message-2-line, ri-file-list-3-line, ri-alert-line, ri-bookmark-line,
ri-settings-4-line, ri-refresh-line, ri-arrow-*-s-line, ri-check-line, ri-close-line,
ri-error-warning-line, ri-search-line, ri-filter-3-line, ri-loader-4-line` (spinner).
- **No emoji. No PNG/SVG icon assets** in the sources (nothing to copy in). **No custom brand mark** —
  the "logo" is the Plus-Jakarta wordmark _Inspot_ / a rounded `In` tile. Status dots are plain
  colored circles, not glyphs.
- If you need a glyph Remix Icon lacks, substitute the nearest Remix `-line` glyph rather than mixing
  icon families.

---

## Index / manifest

**Root**

- `styles.css` — global entry (only `@import`s). Link this one file.
- `tokens/` — `fonts.css` (Google Fonts), `colors.css` (oklch ramps + semantic aliases, light/dark),
  `typography.css`, `spacing.css`, `effects.css` (shadows, motion, keyframes).
- `readme.md` — this file. `SKILL.md` — portable skill wrapper.

**Components** (`window.InspotDesignSystem_abeb6a.<Name>`)

- `components/forms/` — **Button**, **IconButton**, **Input**, **Switch**, **SegmentedControl**
- `components/data-display/` — **Badge**, **IconTile**, **ProgressBar**, **Card**, **StatCard**,
  **EmptyState**
- `components/feedback/` — **Modal**, **Toast**, **Dropdown** (+ `DropdownItem`, `DropdownSep`,
  `DropdownLabel`)

Each component ships `<Name>.jsx`, `<Name>.d.ts` (props + JSDoc), `<Name>.prompt.md` (usage), and a
directory `@dsCard` HTML specimen.

**Foundations** — specimen cards in `foundations/` (Type, Colors, Spacing, Brand groups).

**UI kit** — `ui_kits/inspot/` — interactive recreation of the control-panel shell and core screens
(dashboard, servers, logs, settings), composed from the components above.

### Intentional additions

- **IconTile** — not a "component" in the codebase (it's an inline `div`), but it's the single most
  repeated visual atom, so it's promoted to a primitive here for consistency.
- **SegmentedControl** — unifies two source patterns (the pill time-range switcher and the underline
  settings tabs) under one API.

### Substitutions / caveats

- Fonts are the real families but pulled from **Google Fonts CDN** (no local font binaries were
  provided). If you have the licensed files, drop them in and swap `tokens/fonts.css` for
  `@font-face` rules.
