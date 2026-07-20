# Design Specification — inspoter

**Version:** v2.10
**Status:** Draft channel-webhook and Messages interaction amendment — source inspected; runtime revalidation pending
**Owner:** UI/UX Designer
**Date:** 2026-07-20
**Source of truth for:** frontend implementor and test engineer
**Consumes:** docs/prd.md v3.9, docs/architecture.md v1.6, and all three Q-3 inputs: specs/prototype/, specs/inspot-design/, specs/ui.md

---

## 0. Authority and use

This document is the executable visual and interaction contract for remediation 1.2. Implementors build to it; testers derive route, state, responsive, localization, keyboard, and visual assertions from it.

Precedence, highest first:

1. docs/prd.md v3.2 governs product scope, acceptance criteria, explicit Q decisions, and D-21/Q-13.
2. specs/inspot-design/ governs tokens, fonts, components, icon family, density, and motion.
3. specs/prototype/ governs demonstrated geometry and composition when it does not conflict with items 1–2.
4. specs/ui.md governs routes, flows, responsive transformations, and shared states, subject to the exceptions below.
5. The previous design specification v1.1 is historical fallback only. It may fill a gap only when all authorities above are silent and it does not change scope.

Unexplained divergence is not allowed. If an implementation constraint prevents conformance, record the affected rule and PRD ID before changing behavior.

### 0.1 Binding exceptions to the Q-3 inputs

- Q-1 (superseded by v2.10): Russian remains fully supported, but English is now the default UI locale, and both are operator-selectable via a top-bar language switcher (§4.2), next to the theme switcher and operator menu. The finite non-translatable allowlist in §3 still applies to both supported languages. See the Changelog for the activation decision.
- Q-2 (superseded by v2.2): light theme remains the default experience, but dark theme and a manual theme switcher are now in scope. The switcher lives in the shared shell top bar (§4.2), next to the operator menu; theme selection is class-based (`.dark` on `<html>`) and persists per browser. See Appendix A for the token source and the Changelog for the activation decision.
- Q-4: Messages includes a real authenticated-operator compose flow; the read-only legacy statement is superseded.
- Q-5 (superseded by Q-14, 2026-07-18): Mail is a full multi-account IMAP/SMTP client — three-pane layout, folders, read/unread, delete/archive, attachments, and plain-text compose/reply/forward (§5.4). Rich-text compose, attachment forwarding, and OAuth remain excluded.
- Q-6: Servers permits inventory/status plus start, stop, and restart only.
- Q-7 and AC-ALR-008: Alerts permits confirmed deletion; acknowledge and resolve controls do not exist.
- D-21/Q-13: Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts, Settings, webhook tokens, selected detail, exclusive local provider-resource bindings, mock state, caches, and cursors follow the active workspace. Provider credentials alone remain deployment-global `.env` secrets. Removing a local binding or workspace never deletes an upstream provider resource. D-20 is superseded and non-normative.
- Provider modes are independent. One provider may be real, another mock, and another errored without changing the others.

### 0.2 Source inventory

This inventory classifies evidence. It does not change the precedence above, the approved PRD, or the §0.1 exceptions.

| Source                                                                    | Role                                                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| specs/ui.md                                                               | Q-3 routes, flows, responsive transformations, and shared states, subject to PRD exceptions.                                                                                                                     |
| specs/prototype/                                                          | Working-prototype geometry and composition.                                                                                                                                                                      |
| specs/inspot-design/                                                      | Tokens, fonts, components, Remix icons, density, and motion.                                                                                                                                                     |
| specs/bookmarks-page.png; specs/servers-page.png; specs/messages-page.png | Canonical visual snapshots only for the captured Bookmarks, Servers, and Messages composition. They are subordinate to the PRD, design system, and §0.1; they add neither product scope nor a fourth Q-3 source. |
| specs/project-11944291.zip; specs/design-system.zip                       | Nonnormative archives and reference copies; never implementation authority.                                                                                                                                      |

### 0.3 Live documentation and checkpoint workflow

- **P-RULE-5:** A code change that affects requirements, design, or architecture updates the corresponding document in the same change. A change to a normative spec updates this Design specification in the same change.
- **P-RULE-3:** At each phase checkpoint, the team demonstrates updates to normative specs or this Design specification in the working app. Before work continues, it records user feedback as decisions in docs/progress.md and corrects affected documents.

The precedence above, approved PRD decisions, and §0.1 exceptions still govern. This workflow neither creates nor reorders authority.

## 1. Product and navigation model

Exactly seven product sections exist, in this order: Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts.

Settings is a separated utility destination, not an eighth product section. Login and Shell are shared surfaces, not product sections. There is no separate product home route; successful login and the root protected entry resolve to /bookmarks.

Desktop navigation places the seven sections in the main group and Settings at the bottom. Mobile uses the same order in an off-canvas sheet. Active navigation uses color, text weight, and aria-current; color alone is insufficient.

## 2. Foundations

### 2.1 Brand and visual character

The interface is dense, calm, operational, and warm. It is flat and border-defined. Terracotta is the action accent; teal means healthy; sand means idle/neutral; amber means warning; red means critical/error.

Prohibited: gradients, decorative emoji, illustrations, glass effects, ornamental blobs, oversized marketing type, and card shadows. Shadows are reserved for floating menus, dialogs, sheets, and toasts.

The wordmark is the typographic lowercase text inspoter. Do not invent a logo mark, emblem, monogram, or alternate spelling/case.

### 2.2 Color tokens

Use the exact OKLCH anchors from specs/inspot-design/tokens/colors.css:

| Ramp       | Required anchors                                                                              |
| ---------- | --------------------------------------------------------------------------------------------- |
| background | 50: 0.985 0.002 95; 100: 0.97 0.004 90; 200: 0.94 0.006 88; 300: 0.90 0.008 85                |
| foreground | 950: 0.09 0.01 260; 900: 0.13 0.012 260; 600: 0.32 0.009 260; 400: 0.50 0.007 260             |
| primary    | 100: 0.91 0.06 30; 400: 0.68 0.16 30; 500: 0.58 0.19 30; 600: 0.50 0.17 30; 700: 0.42 0.14 30 |
| accent     | 100: 0.88 0.06 175; 500: 0.50 0.14 175; 700: 0.36 0.10 175                                    |
| secondary  | 100: 0.90 0.02 85; 400: 0.62 0.035 85; 700: 0.36 0.03 85                                      |
| state      | amber-500: 0.77 0.16 70; red-500: 0.58 0.22 27                                                |

Required semantic aliases:

- Surfaces: surface-app, surface-card, surface-sunken, surface-hover.
- Borders: border-subtle, border-default, border-strong.
- Text: text-primary, text-body, text-secondary, text-muted.
- Actions: action-primary and action-primary-hover.
- Focus: primary-400.
- State mappings: healthy/success → accent; idle/neutral → secondary; warning → amber; critical/error/destructive → red or the specified terracotta destructive token.

Never hardcode a state color in a feature component. Status always combines token color with visible Russian text and, where useful, an outline icon.

### 2.3 Typography

- Body and controls: Inter, weights 400/500/600/700.
- Headings and wordmark: Plus Jakarta Sans, weights 500/600/700/800.
- Technical identifiers, env names, IP, URL, API and JSON snippets: JetBrains Mono, weights 400/500.
- Type sizes: 10, 11, 12, 14, 16, 18, 20, 24, 30px.
- Default body: 14px. Metadata: 11–12px. Page title: 20px. Primary statistic: 24px.
- Line heights: 1.2, 1.35, 1.5, 1.65. Uppercase metadata may use 0.04em tracking; normal prose does not.

### 2.4 Grid, density, controls, and shape

Use a 4px base grid. Spacing tokens are 2, 4, 6, 8, 10, 12, 14, 16, 20, 24, 32, 40, 48px. Page padding is 24px desktop and 16px mobile. Cards use 16–20px internal padding.

Control heights are 30px compact, 38px default, and 42px prominent. Icon tiles are 28, 32, or 36px.

Radii are 4, 6, 8, 12, 16px and full. Use 1px borders. Avoid nested containers with duplicate padding.

Shell geometry is fixed:

- Desktop sidebar: 256px wide.
- Collapsed sidebar: 64px wide.
- Top bar: 56px high.
- At 1440px the sidebar is persistent; at 375px it is off-canvas and page content has no body-level horizontal overflow.

### 2.5 Icons and effects

Use Remix Icon 4.5 outline glyphs only. Default glyph size is 16–20px. Every icon-only control has an accessible Russian name and tooltip where the purpose is not obvious. Do not mix Lucide or filled icon families.

Flat surfaces use shadow-none. Floating layers use only:

- shadow-menu: 0 4px 12px -2px foreground-950/12%, 0 2px 4px -2px foreground-950/8%.
- shadow-modal: 0 12px 32px -8px foreground-950/18%, 0 4px 8px -4px foreground-950/10%.
- Modal scrim: black at 30%.

### 2.6 Motion, focus, contrast, and keyboard

Motion durations are 150ms fast, 200ms base, 250ms slow, and 500ms chart. Easing is cubic-bezier(0,0,0.2,1) or cubic-bezier(0.4,0,0.2,1). Allowed entrances are fade with 4px rise, scale from 0.95, and 16px right slide. No bounce.

Reduced-motion mode removes translate, scale, slide, pulse, and shimmer; skeletons become static and all state changes remain understandable.

Across all product surfaces, every interactive control is keyboard operable and has an accessible name. Keyboard order follows visual order. Menus support arrows, Home/End, Enter/Space, and Escape. Dialogs and sheets trap focus, close on Escape, label title/description, and restore focus to the trigger.

For the binding Slice 1 baseline—Login, Shell, and Bookmarks—interactive elements expose a 2px primary-400 focus ring with offset.

Binding acceptance follows NFR-A11Y-001: Login, Shell, and Bookmarks meet WCAG 2.1 AA for color contrast and focus visibility, and automated axe checks report no critical violations on these Slice 1 screens. Extending the same WCAG, focus, and axe checks to other routes is recommended and non-blocking unless the approved test plan later makes them release gates. Status is never color-only.

### 2.7 Responsive transformation

- Below 640px: off-canvas navigation, one-column content, stacked records, full-width filters/actions, and sheets or full-screen detail where specified.
- 640–1023px: off-canvas navigation and up to two columns where content remains legible.
- 1024px and above: persistent sidebar and desktop grids/tables.
- Required test viewports are 375px and 1440px.
- Wide tables transform into stacked labeled records on mobile; do not rely on page-level horizontal scrolling.
- Dialogs become bottom sheets or near-full-screen sheets on narrow screens while preserving focus and Escape behavior.

## 3. Russian visible-copy contract

The complete allowlist of operator-visible non-translated terms — unchanged regardless of the active English or Russian locale (§0.1 Q-1) — is exactly: inspoter, Cloudflare, Hetzner Cloud, Hetzner DNS, GoDaddy, DNS, VPS, IP, URL, TTL, HTTP, HTTPS, API, JSON.

Technical identifiers, environment-variable names, and API snippets are exempt only when presented as code or monospace. Every other visible navigation label, heading, button, field label, placeholder, validation message, loading state, empty state, error, toast, tooltip, dialog, status, date label, and pagination label is Russian.

Dates use ru-RU formatting and 24-hour time. Do not expose raw English enum values; map them to Russian labels while retaining raw identifiers only in monospace technical detail.

## 4. Shared product model

### 4.1 Login

Route: /login.

Centered, compact light-theme form with typographic inspoter wordmark, Russian username and password labels, a primary sign-in button, inline validation, a non-destructive authentication error, and disabled/pending submit state. No registration, social login, recovery, theme control, illustration, or invented brand mark.

After success, navigate to /bookmarks. Invalid credentials preserve the username, clear or retain the password according to security implementation, focus the error summary, and expose it with role=alert. Unauthenticated protected routes redirect here; logout returns here.

### 4.2 Shell

The shared protected shell contains the 256/64px sidebar, 56px top bar, workspace switcher, seven-section navigation, separated Settings link, page title/context action, operator menu, and Russian logout action. The workspace switcher sits in the sidebar header; the top bar's right side hosts the theme switcher (v2.2, §0.1 Q-2) and the operator menu — an avatar-initial-plus-username trigger opening a dropdown with the operator's username, a fixed "Оператор" label, and the Russian logout action.

Workspace switching updates all seven sections, Settings, webhook tokens, selected detail, local provider-resource bindings, mock state, caches, and cursors without a full-page reload. A switch aborts prior requests, discards late responses, clears the previous workspace's selected binding/detail and client state, remounts the keyed workspace boundary, and refetches destination content. The switcher shows pending, failure/retry, and empty-membership handling. The top bar action belongs to the current page and collapses to a labeled or icon-plus-label mobile control without losing its accessible name.

### 4.3 Settings utility

Routes: /settings, /settings/workspace, and /settings/webhooks.

/settings remains a compact utility hub with two active cards/links: Workspace → /settings/workspace and Webhooks → /settings/webhooks. Neither card is disabled or a placeholder.

Workspace settings provide complete CRUD and membership management: create, rename, delete, list members, add an existing operator, create an invite-only operator, and remove a member. Workspace deletion sits in a visually separated danger zone, requires explicit confirmation, states that workspace-scoped database content is removed, and states that provider/external resources are not removed. If the active workspace is deleted, the shell resolves another membership or returns to the permitted selection/login flow.

Workspace-wide webhook-token settings are active, not a placeholder. They retain the legacy null-channel list/create/one-time reveal/copy/revoke flow and never expose channel-scoped credentials. Channel-scoped webhooks are managed inside the owning channel's settings (§5.5). Never reveal a stored secret again. Use Russian labels; token values and API examples are monospace. Both token families follow the active workspace.

### 4.4 Shared states

Every data surface implements:

- Initial loading: layout-matched skeleton, aria-busy on the region, Russian status text for assistive technology.
- Empty dataset: explanation and only an in-scope next action.
- No results: distinct from empty; preserve filters and provide clear/reset action.
- Error: concise Russian cause when known and an explicit Повторить action.
- Partial provider error: local error and retry beside that provider; healthy providers remain usable.
- Mutation pending: disable only the affected control/record, retain confirmed data, and expose progress.
- Success: concise Russian toast after confirmed persistence.
- Mutation failure: inline or toast error near the action; no false optimistic success.
- Disabled: visible reason when non-obvious.
- Pagination: bounded server page, current-page semantics, disabled ends, and Russian count/position text.

## 5. Product-section specifications

Each following chapter is complete and normative. Its acceptance checks supplement, and never replace, the cited PRD ACs.

## 5.1 Bookmarks

**Route and scope:** /bookmarks; active-workspace content. Trace: AC-BM-001..034, AC-WS-010..011.

**Layout/content:** page header plus primary Добавить закладку action; below it, a labeled search input (visible only once at least one category exists) filters the loaded categories/bookmarks client-side; category sections with name, count, category menu, and bookmark grid. Each card shows an outline Remix icon or deterministic non-emoji fallback, name, description when present, and domain/URL context. Empty description must not reserve a blank block. A bookmark may optionally carry one of three brand accent-color tones (applied to its icon tile in place of the deterministic fallback tone); an accessible swatch picker in the create/edit form includes a "no color" option that reverts to the fallback. A category may also act as a group containing one level of nested subcategories — see §5.1.1.

**Actions:** create/rename/delete category; create/edit/move/delete bookmark; confirmed destructive actions; activating a bookmark opens its valid HTTP/HTTPS URL in a new tab; filter the visible bookmarks by a client-only, case-insensitive text query matched against name, description, and URL, with a one-click action to clear the query and restore the full list. Forms validate required name and URL before submit. A category or bookmark can be reordered via a dedicated drag handle, by pointer drag or by keyboard (focus the handle, pick up, move, drop); dragging a bookmark across categories both repositions and reassigns it. In the create/edit form, an optional favicon-suggest control queries a fixed third-party favicon service using only the entered URL's hostname and, on success, populates the icon field with the suggestion (still editable/clearable before submit); on failure it leaves the icon field unchanged and shows a non-blocking notice. The category create/edit form also carries a "Родительская категория" select for assigning/clearing one level of subcategory nesting — see §5.1.1.

**States:** matched skeleton; first-category empty state (no categories at all); explicit initial-load error with Повторить; local form validation; local pending; success toast; mutation failure without removing confirmed cards; distinct no-results state when an active search query matches zero bookmarks (separate from the first-category empty state, with a "Сбросить поиск" action that clears the query). The search input itself is only rendered once at least one category exists.

**Mobile:** one-column category and card stack at 375px; category actions remain visible and operable; the search input remains visible above the fold at both 375px and 1440px without scrolling; create/edit dialogs become sheets; long URLs wrap or truncate without body overflow. Nested subcategory sections stack in the same single-column flow — see §5.1.1.

**Accessibility:** category headings structure the page; card link and edit/menu controls are separate focus stops; destructive dialogs trap/restore focus; fallback icon has no redundant spoken text; the search input has a real associated `<label>` ("Поиск закладок"); an `aria-live="polite"` `role="status"` region announces the filtered result count (e.g. "Найдено 3 закладки" / "Ничего не найдено") while a query is active and stays silent when the query is empty. Each category and bookmark exposes a separate, keyboard-operable drag-handle focus stop (distinct from the card link and the action-menu trigger) with a non-generic Russian accessible name; drag handles are inert (no pointer or keyboard operation) while a search query is active, since reordering a filtered subset would corrupt the true order of hidden items. Subcategory headings are one rank below their parent category's heading — see §5.1.1.

**Acceptance:** CRUD and cascade behavior satisfy AC-BM-001..010; icon/fallback satisfies AC-BM-011 without decorative emoji; grouping/new-tab behavior satisfies AC-BM-012..014; optional accent-color selection, tile rendering, clear-to-fallback, and non-color-only swatch names satisfy AC-BM-015..018; client-only search filtering, the no-results state with its clear action, and the no-search-input-when-empty rule satisfy AC-BM-019..021; drag-and-drop reordering of categories and of bookmarks within and across categories, including full keyboard operability, satisfies AC-BM-022..025; opt-in favicon suggestion sourced from a fixed third-party service and the broken-icon-URL fallback (never a broken image) satisfy AC-BM-026..028; one level of nested category groups, its parent-select constraints, and cascade-delete behavior satisfy AC-BM-029..034 (see §5.1.1); Russian-copy, Remix-only, 375px, and 1440px checks succeed; initial fetch failure exposes a working retry.

**Exclusions:** bulk actions, sharing controls, decorative emoji, and more than one level of category nesting (a subcategory can never itself have subcategories).

### 5.1.1 Nested category groups (Phase 4)

A category may optionally act as a group containing one level of subcategories (group → subcategory → bookmarks); a subcategory can never itself contain further subcategories — nesting is capped at exactly one level, enforced server-side and mirrored client-side.

**Layout and heading hierarchy:** a subcategory renders inside its parent category's own section, after the parent's own direct bookmark grid, under its own heading one rank below the parent's — the parent category heading is `<h2>`, each subcategory heading is `<h3>` — with its own Добавить action, its own rename/delete menu, and its own bookmark grid. No heading level is skipped between a parent and its subcategory.

**Reparenting:** assigning or clearing a subcategory's parent happens only through the category create/edit form's "Родительская категория" native select, which defaults to "— Нет (группа верхнего уровня) —" (top-level, no parent). A subcategory is never itself offered as a parent option (only top-level categories are eligible parents). A top-level category that already has one or more subcategories remains a normal, selectable parent option when creating or editing a _different_ category — the depth cap only restricts the category being edited: if it already has subcategories of its own, its own parent-category field is disabled (with an explanatory note) so it cannot be turned into someone else's subcategory, which would otherwise create a three-level chain.

**Drag-and-drop interaction:** subcategories are not drag-reorderable in this phase (no drag handle on a subcategory heading); reordering/reparenting a subcategory happens only via the parent-select above. Bookmarks nested inside a subcategory remain individually draggable/movable by pointer or keyboard exactly like any other category's bookmarks, including moves across the top-level/subcategory boundary.

**Cascade delete:** deleting a category that has subcategories warns with the combined count — its own direct bookmark count, its subcategory count, and their nested bookmark count — and confirming cascades to remove the category, its subcategories, and all bookmarks at both levels, leaving no orphans.

**Mobile:** nested subcategory sections stack in the same single-column flow as top-level categories at 375px, with a visible left indent and top divider distinguishing a subcategory's block from its parent's own content immediately above it; the extra nesting level introduces no additional horizontal scrolling or body overflow at either 375px or 1440px.

**Acceptance:** AC-BM-029..034.

## 5.2 Domains

**Route and scope:** /domains; exclusive local provider-resource bindings owned by the active workspace. DNS detail is selected state keyed to that workspace until routing architecture names a path. Trace: AC-DOM-001..009, AC-PROV-001..003, AC-WS-010..011, D-21/Q-13.

**Layout/content:** provider-aware inventory showing only domains bound to the active workspace, with domain name and Cloudflare, Hetzner DNS, or GoDaddy source. Selecting a domain opens that binding's DNS records with type, name, value, and TTL. Provider identity and mode/error are visible without exposing credentials.

**Actions:** select domain; refresh one provider; create/edit/delete a DNS record with confirmation for delete. Validate type-specific name/value and TTL before provider submission. Refresh and mutation errors are provider-local.

**States:** inventory skeleton; no configured/returned domains; DNS empty state; per-provider error with Повторить; healthy-provider content retained; record form pending/error; provider-rejected mutations retain confirmed state.

**Mobile:** inventory and DNS records become stacked labeled records. DNS detail uses a full-height sheet or replacement view with a clear Назад control. Values wrap safely; no table forces body overflow.

**Accessibility:** provider error is announced once and linked to its retry; record labels remain associated after stacking; type and status are text, not color-only; dialogs meet shared focus rules.

**Acceptance:** inventory/provider behavior satisfies AC-DOM-001..003; DNS CRUD/validation/failure satisfies AC-DOM-004..009; switching workspace loads destination-workspace bindings and clears the prior DNS selection; each provider can independently be real, mock, or errored. Foreign or missing local bindings disclose no resource and trigger no provider call.

**Exclusions:** domain registration/transfer/renewal, nameserver lifecycle, provider credential entry, bulk DNS editing, and deletion of upstream resources when a local binding or workspace is removed.

## 5.3 Servers

**Route and scope:** /servers; exclusive local provider-resource bindings owned by the active workspace. Selected server detail and pending state are keyed to that workspace. Trace: AC-SRV-001..008, AC-PROV-001..003, AC-WS-010..011, D-21/Q-13.

**Layout/content:** compact summary followed by a responsive grid showing only servers bound to the active workspace. Each card shows name, Hetzner Cloud provider, VPS type/configuration, IP, power status, and only information returned by the provider. Use semantic status tokens and Russian labels.

**Actions:** start a stopped server; stop or restart a running server; refresh inventory. Every power action opens a real modal confirmation with action, server name, consequence, cancel, and confirm. Only the affected card enters pending/polling state.

**States:** skeleton; empty inventory; full provider error with Повторить; action pending; deterministic status polling; timeout/failure with confirmed provider status; success after target status is observed.

**Mobile:** one-column cards, no duplicate wrapper/card padding, action menu contained within viewport, confirmation rendered as an accessible sheet/dialog.

**Accessibility:** action menu is keyboard-operable; confirmation traps focus, closes on Escape, restores trigger focus, and announces pending/result; status includes text.

**Acceptance:** inventory/mock/error satisfies AC-SRV-001..003; start/stop/restart and 30/30/60-second status checks satisfy AC-SRV-004..008; switching workspace loads destination-workspace bindings and clears prior selected/pending state; no other lifecycle controls render. Foreign or missing local bindings disclose no resource and trigger no provider call.

**Exclusions:** create, delete, rebuild, resize, reinstall, rescue, snapshots, volumes, networking changes, provider credential entry, and deletion of upstream servers when a local binding or workspace is removed.

## 5.4 Mail (Q-14 multi-account client)

**Route and scope:** /mail (three-pane client) and /settings/mail (owner account management); active-workspace accounts, folders, messages, and attachments. Trace: AC-MAIL-001..030, AC-WS-011.

**Layout/content (lg and up):** three columns — a 220px sidebar, a 420px message list, and a flexible reading pane.

- **Sidebar:** «Написать» primary action; account switcher («Почтовый аккаунт» select; the webhook mailbox carries a «Системный» badge); «Синхронизировать» with pending state «Синхронизация…» and error state «Ошибка синхронизации»; «Папки» list with Russian special-use names (Входящие, Отправленные, Черновики, Корзина, Спам, Архив) and unread badges (aria-label «Непрочитанных: N»); footer link «Управление аккаунтами» → /settings/mail. Workspaces without an IMAP account show the hint «Добавьте IMAP-аккаунт, чтобы писать письма».
- **Message list:** search («Поиск по теме или отправителю...»), «Только непрочитанные» toggle, sort order («Сначала новые» / «Сначала старые»), keyset pagination footer. Rows show an initials avatar (deterministic oklch hash tone), sender, relative ru-RU time, subject (bold + unread dot for unread, indicator «Непрочитанное»), snippet, and an attachment glyph («Есть вложения»).
- **Reading pane:** header with subject, sender, recipients, ru-RU timestamp; action bar Ответить / Переслать / В архив / Удалить / Прочитано; attachment chips with size and download; sanitized body. Empty selection shows «Выберите письмо» / «Нажмите на письмо слева, чтобы прочитать его».

**Key behavior:**

- Opening an unread message optimistically marks it read (auto-PATCH) and decrements the folder badge (AC-MAIL-018/021).
- «Удалить» is trash-first; inside Корзина it opens the confirm dialog «Удалить навсегда?» with Отмена/Удалить (AC-MAIL-019).
- HTML bodies render only through DOMPurify sanitization (no styles/forms/inputs; links open in a new tab with rel=noopener); otherwise plain text in a preformatted block.
- Attachment download goes fetch-as-blob through the feature api.ts (the workspace header cannot be sent via a bare `<a>`), with the toast «Не удалось скачать вложение. Попробуйте снова.» on failure.
- Compose dialog (по образцу provider-credential-dialog): titles «Новое письмо» / «Ответить» / «Переслать письмо»; fields Кому (chips, placeholder «адрес@example.ru, адрес2@example.ru»), Копия, Скрытая копия, Тема, Текст письма (plain-text textarea); validation «Укажите хотя бы одного получателя.», «Тема обязательна.», «Текст письма обязателен.»; submit «Отправить»; success toast «Письмо отправлено», failure «Не удалось отправить письмо. Попробуйте снова.». Reply prefills Re: + цитату, forward — Fwd: + цитату.
- Action/sync toasts: «Синхронизация завершена.», «Синхронизация уже выполняется.», «Письмо перемещено в корзину», «Письмо удалено», «Письмо перемещено в архив», and matching «Не удалось …. Попробуйте снова.» failures for load/read/move/delete/sync.

**/settings/mail (owner-only mutations):** card on /settings («Почтовые аккаунты»); page header «Почтовые аккаунты» with «Назад к настройкам»; accounts table (name, email, host, status, last sync) with Изменить/Удалить (confirm «Удалить»/«Удаление…»); dialog «Добавить аккаунт» with Название, Рабочая почта, IMAP/SMTP servers and Порт fields (validation «Порт должен быть в диапазоне 1–65535.»), Логин, password (edit placeholder «Оставьте пустым, чтобы не менять»), the hint «Используйте пароль приложения, а не основной пароль почты.», «Проверить подключение» (per-protocol errors «Не удалось подключиться к IMAP-серверу.» / «Не удалось подключиться к SMTP-серверу.»), and «Сохранить» with toasts «Аккаунт сохранён.» / «Аккаунт удалён.». Empty state: «Нет почтовых аккаунтов» + «Подключите IMAP/SMTP-ящик, чтобы получать и отправлять почту из панели.». Trace: AC-MAIL-007..011.

**States:** skeletons for sidebar/list/pane; empty webhook mailbox with a webhook curl hint («Входящая почта пока отсутствует» / «Отправьте первое письмо через webhook:»); empty folder («Нет писем» / «В этой папке пока пусто.»); no filter results («Ничего не найдено» / «Нет писем, соответствующих текущим фильтрам.»); load errors with Повторить («Не удалось загрузить почту», «Не удалось загрузить письма. Попробуйте снова.», «Не удалось загрузить папки. Попробуйте снова.», «Не удалось загрузить почтовые аккаунты. Попробуйте снова.»); sync busy → 409 toast; pagination boundaries.

**Mobile:** panels swap in place (list ↔ reading pane) without new routes; the sidebar moves into a left Sheet titled «Аккаунты и папки»; the reading pane provides a Назад control back to the list; controls wrap without body overflow at 375px.

**Accessibility:** each list row is one named activation target; unread state is conveyed by text («Непрочитанное»), not color alone; the list region is labeled «Список писем»; folder badges expose «Непрочитанных: N»; dialogs (compose, delete-confirm, account form) trap and restore focus; attachment downloads expose «Скачивание вложения»; dates use ru-RU 24-hour text; axe reports no serious/critical violations on /mail (e2e/mail-client.spec.ts).

**Acceptance:** list/detail/filter/sort/pagination satisfy AC-MAIL-001..005; webhook ingest visibility satisfies AC-MAIL-006 (system mailbox); account management satisfies AC-MAIL-007..011; sync behavior satisfies AC-MAIL-012..017; actions satisfy AC-MAIL-018..021; compose/reply/forward satisfy AC-MAIL-022..025; attachments satisfy AC-MAIL-026..028; folders/account switching satisfy AC-MAIL-029..030.

**Exclusions:** rich-text (HTML) composition, forwarding attachments, OAuth account linking, POP3, and any mail administration surface beyond /settings/mail (PRD §3.4 Known Limitations).

## 5.5 Messages

**Route and scope:** /messages; active-workspace content. Trace: AC-MSG-001..007, AC-MSG-009..014; AC-MSG-008 is inactive.

**Layout/content:** desktop uses category/channel navigation, a selected-channel header, a chronological server-paginated feed, and a composer anchored after the feed. When the current selection is missing, select the first available channel. Each record renders one text label: `OPERATOR` → «Оператор», `WEBHOOK` → «Внешний источник», `LEGACY`/missing → «Источник не определён»; author is the immutable display-name snapshot.

**Actions:** create and rename categories/channels; delete either only after explicit confirmation; select channel; prepend older pages through «Загрузить предыдущие» while preserving scroll position; submit non-empty operator text to an existing channel. A confirmed send explicitly refetches the feed and clears the draft; a failed send retains the draft. The composer uses a labeled multiline textarea and Отправить button; Ctrl+Enter submits while Enter inserts a newline. No attachment affordance exists.

**Channel settings:** both the channel-row action menu and selected-channel header expose «Настройки канала». The dialog has «Обзор» for rename/delete and «Вебхуки» with independent loading, empty, error/retry, create, list, and revoke states. Creation accepts a 1–80-character name and transiently shows the same-origin tokenized URL plus ready cURL; copy success/fallback is explicit and the warning states that closing the dialog destroys the only reveal. The URL is never placed in toast text or browser storage. Revocation requires destructive confirmation, is irreversible, and updates only the affected row. Closing settings restores focus to a settings trigger for that channel.

**States:** navigation/feed skeletons; no categories; category with no channels; selected empty channel; no selection; page loading; compose pending; empty-content validation; missing-channel rejection; persistence failure. Do not insert a sent record until persistence is confirmed; on failure retain draft and confirmed feed.

**Mobile:** category/channel navigation is one Sheet (no duplicate Select); selected channel occupies the page; compose remains visible without covering content. Feed records and controls wrap without overflow. Row actions are visible on touch sizes and keyboard-reachable rather than hover-only.

**Accessibility:** category disclosures expose aria-expanded and controls; selected channel uses aria-current; new confirmed messages use a polite live region without stealing focus; origin is text, not color-only; composer has label, error association, and keyboard submission help.

**Acceptance:** structure/feed/pagination satisfy AC-MSG-001..007; real compose, exactly-one persistence, attribution, origin visibility, validation, missing channel, and failure behavior satisfy AC-MSG-009..014. Ingested and operator records are distinguishable in the same feed. No auto-create, attachment, or emoji UI renders.

**Exclusions:** auto-created channels, file attachments, reactions, decorative emoji, typing indicators/presence, message edit/delete, threads, realtime push, calls, Discord wire compatibility, and false demo submission.

## 5.6 Logs

**Route and scope:** /logs; active-workspace, read-only records created by ingest. Trace: AC-LOG-001..005, AC-WS-011.

**Layout/content:** compact filters above a server-paginated chronological list/table with timestamp, level, source, and message. A row may disclose structured detail; JSON and identifiers are monospace. Severity uses semantic tokens.

**Actions:** filter by level, source, and text; sort timestamp ascending/descending; paginate; expand/collapse detail; clear filters. No record mutation.

**States:** skeleton; empty log store; no results; fetch error with Повторить; page/filter pending; expandable detail unavailable. Newly ingested records become observable after refresh/navigation.

**Mobile:** table transforms to stacked labeled records; filters stack; long source/message/JSON wraps inside the record; expansion does not shift focus unexpectedly.

**Accessibility:** expansion is a button with aria-expanded and controlled-region linkage; every row action has a visible focus ring; level is visible text; updated result count is announced politely.

**Acceptance:** view/filter/sort/pagination satisfies AC-LOG-001..004; ingested record visibility satisfies AC-LOG-005 without a new ingest-management UI; critical color comes only from semantic tokens; Russian-copy and focus checks cover collapsed and expanded states.

**Exclusions:** live tail, saved searches, export, deletion, retention controls, and ingest administration.

## 5.7 Alerts

**Route and scope:** /alerts; active-workspace records and categories. Trace: AC-ALR-001..008, AC-WS-011.

**Layout/content:** category management plus a server-paginated alert list. Each record shows category, severity, source, message, and timestamp. Filters cover category, severity, and text; sorting covers supported timestamp/severity order.

**Actions:** create/rename category; delete a category only after explicit confirmation while preserving the no-orphan invariant; filter, sort, paginate, clear filters; delete an existing alert after explicit confirmation. No acknowledge or resolve action appears.

**States:** skeleton; empty alert store; no results; fetch error with Повторить; category mutation pending/error; alert-delete pending/error/success; pagination boundaries. Ingested records become observable after refresh/navigation.

**Mobile:** filters and header actions stack; alert table becomes labeled records; category management and delete confirmation use sheets/dialogs; header cannot overflow at 375px.

**Accessibility:** severity has text; delete button names the alert context; confirmation traps/restores focus; results and deletion are announced; date uses ru-RU.

**Acceptance:** category behavior satisfies AC-ALR-001..002; list/filter/sort/pagination satisfies AC-ALR-003..006; ingest visibility satisfies AC-ALR-007; confirmed deletion and absence of acknowledge/resolve satisfy AC-ALR-008.

**Exclusions:** acknowledge, resolve, mute, snooze, escalation workflow, outbound notification setup, and ingest administration.

## 6. Cross-cutting verification contract

Test every protected route at 375px and 1440px in the normative light theme. Verify no body-level horizontal overflow, correct 256/64/56 shell geometry, Russian visible copy, Remix-only outline icons, keyboard operability, accessible names, reduced motion, and shared states.

For Login, Shell, and Bookmarks, additionally verify WCAG 2.1 AA color contrast and focus visibility plus automated axe results with no critical violations. Extending these contrast, focus, and axe gates to other routes is recommended and non-blocking unless an approved test plan later changes their status.

Automated visible-string scanning uses only the §3 allowlist, plus technical text proven to be code/monospace. Browser coverage includes every route, dialog/sheet, menu, loading state, empty state, no-results state, error, retry, validation, toast, pagination boundary, and destructive confirmation.

For Mail, Messages, Logs, and Alerts, end-to-end ingest tests create a backend record and verify that the existing section list/feed displays it. Do not invent a separate ingest viewer, queue, activity center, or provider-control surface.

## 7. Current implementation delta for Phase 4

Snapshot basis: repository state reviewed 2026-07-14. Status is conformance against this v2.1 target, not release completion.

| Section   | Current status | Already aligned                                                                                     | Required Phase 4 delta                                                                                                                                                                                  | Verification evidence                                                                                                                                                            |
| --------- | -------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Bookmarks | PARTIAL        | Category/bookmark CRUD, grouping, skeleton, and empty state exist.                                  | Translate all visible copy; replace mixed icons; remove emoji rendering; add explicit initial-load error/retry; verify 375px.                                                                           | src/components/bookmarks/bookmarks-board.tsx; src/components/bookmarks/bookmark-dialog.tsx; src/components/bookmarks/bookmark-icon.tsx; src/components/bookmarks/empty-state.tsx |
| Domains   | PARTIAL        | Provider inventory, DNS CRUD, validation, and core states exist.                                    | Translate copy; use Remix; make refresh/error retry provider-local; retain healthy providers; remove narrow-screen overflow.                                                                            | src/components/domains/domains-view.tsx; src/components/domains/dns-records-view.tsx; src/components/domains/dns-record-dialog.tsx                                               |
| Servers   | PARTIAL        | Inventory, status, permitted actions, polling, states, grid, and Remix usage are closest to target. | Translate remaining statuses/details; replace positioned confirmation with semantic dialog/sheet and focus/Escape behavior; remove duplicate padding.                                                   | src/components/servers/servers-view.tsx                                                                                                                                          |
| Mail      | DONE (Q-14)    | Full three-pane multi-account client per §5.4 (2026-07-18): sidebar/list/pane, folders, actions, compose, attachments, mobile in-place panels, Russian copy, ru-RU dates. | —                                                                                                                                                                                                       | src/components/mail/mail-client-view.tsx; mail-sidebar.tsx; message-list.tsx; message-pane.tsx; mail-body.tsx; compose-dialog.tsx; src/components/settings/mail-accounts-view.tsx |
| Messages  | CONTRADICTS    | Category/channel management, feed, pagination, and responsive structure exist.                      | Replace demo-only compose with persisted AC-MSG-009..014 flow; remove attachment/decorative emoji UI; add visible origin labels, disclosures, aria-current, validation, and confirmed failure behavior. | src/components/messages/messages-view.tsx; src/components/messages/channel-dialog.tsx; src/app/api/channels/[id]/messages/route.ts                                               |
| Logs      | PARTIAL        | Filters, sorting, pagination, and row expansion exist.                                              | Translate copy; replace Lucide; replace hardcoded critical color with semantic token; add visible focus and disclosure semantics; stack mobile records.                                                 | src/components/logs/logs-view.tsx                                                                                                                                                |
| Alerts    | CONTRADICTS    | Category CRUD, list, filters, sorting, and pagination exist.                                        | Add confirmed alert deletion for AC-ALR-008; translate copy; replace Lucide; enforce ru-RU dates; fix narrow header; keep acknowledge/resolve absent.                                                   | src/components/alerts/alerts-view.tsx; src/components/alerts/manage-categories-dialog.tsx; src/components/alerts/delete-category-dialog.tsx                                      |

### 7.1 Shared delta

- Foundations and shell are largely aligned, and light tokens already exist in src/app/globals.css. Required work is normalization to the exact tokens and geometry in §2.
- Icon audit snapshot: 24 files import Lucide while 5 files use Remix class names. Migrate all visible feature and shared controls to Remix Icon 4.5 outline.
- English remains in workspace/settings/sidebar/logout surfaces; mixed icon systems remain in shared controls. Evidence: src/components/shell/app-sidebar.tsx, src/components/shell/workspace-switcher.tsx, src/components/workspace/rename-workspace-form.tsx, src/components/settings/webhook-tokens-view.tsx.
- Login needs the exact lowercase typographic inspoter wordmark and Russian states. Evidence: src/app/login/page.tsx and src/app/login/login-form.tsx.
- Workspace APIs include deletion, but Settings must expose it as the §4.3 danger-zone flow. Webhook tokens already have active list/create/revoke behavior and need localization/icon conformance. Evidence: src/app/api/workspaces/[id]/route.ts and src/components/settings/webhook-tokens-view.tsx.

## 8. PRD and decision traceability

| Design family                               | Binding source                                                        |
| ------------------------------------------- | --------------------------------------------------------------------- |
| Seven-section shell, auth, responsive shell | AC-SHELL-001..004; AC-AUTH-001..005                                   |
| Finite allowlist (English and Russian)      | Q-1; NFR-I18N-001                                                     |
| Required light theme                        | Q-2; NFR-THEME-001                                                    |
| Three normative design inputs               | Q-3; NFR-DESIGN-001                                                   |
| Bookmarks                                   | AC-BM-001..014                                                        |
| Domains and provider-local resilience       | AC-DOM-001..009; AC-PROV-001..003                                     |
| Servers and only three power actions        | Q-6; AC-SRV-001..008                                                  |
| Mail multi-account client and observable ingest | Q-14 (supersedes Q-5); AC-MAIL-001..030                           |
| Messages real compose and origin            | Q-4; AC-MSG-009..014                                                  |
| Messages no auto-create                     | Q-8; AC-MSG-006, AC-MSG-008 inactive, AC-MSG-013                      |
| Logs read/filter/sort and observable ingest | docs/idea.md Logs; specs/ui.md Logs; AC-LOG-001..005                  |
| Alerts delete, no acknowledge/resolve       | Q-7; AC-ALR-001..008                                                  |
| All-content workspace switch and isolation  | AC-WS-001..011; D-21/Q-13                                             |
| Legacy and channel-scoped webhook utilities | AC-WH-008..009; channel-webhook amendment (2026-07-18)                |
| Observable ingest without added surface     | AC-WH-003, AC-WH-007; AC-MAIL-006; AC-MSG-005; AC-LOG-005; AC-ALR-007 |

## Appendix A — dark theme tokens, activated v2.2

Dark-token values present in specs/inspot-design/tokens/colors.css (the `.dark` block) are activated as of v2.2, per the same-change product decision recorded in the Changelog. They are already mirrored 1:1 in the app's own token file (src/app/inspot-tokens.css), applied via the `.dark` class on `<html>` when the operator selects dark theme from the top-bar switcher (§4.2). No other light-theme decision in this specification changes; the acceptance criteria in §7 continue to bind the light-theme presentation.

## Changelog

### v2.10 — 2026-07-20 (English default locale and language switcher)

- Activated English as the default UI locale, superseding the Q-1 Russian-only deferral, implemented via `next-intl` locale routing with a full English translation of all message namespaces; Russian remains fully supported at a `/ru` URL prefix.
- Added a language switcher dropdown (English/Russian, extensible to future locales) to the top bar's right-hand control group, alongside the theme switcher and operator menu (§4.2).

### v2.9 — 2026-07-18 (Messages channel settings and incoming webhooks)

- Added the two-tab channel settings flow, one-time URL/cURL handling, feed/composer/pagination/mobile/focus behaviors, explicit Discord-parity exclusions, and legacy-vs-channel webhook separation. Runtime verification remains pending.

### v2.8 — 2026-07-18 (Mail multi-account client amendment, Q-14)

- Rewrote §5.4 for the Q-14 mail client: three-pane layout (220px sidebar / 420px list / reading pane), account switcher with the «Системный» webhook badge, Russian special-use folder names with unread badges, message-list search/unread-filter/sort, sanitized (DOMPurify) reading pane with the Ответить/Переслать/В архив/Удалить/Прочитано action bar, auto-read on open, trash-first delete with the «Удалить навсегда?» confirm, attachment chips with fetch-as-blob download, the plain-text compose dialog (Re:/Fwd: prefill), the full Russian string inventory (folders, actions, toasts, compose, account settings), mobile in-place panel switching with the sidebar in a Sheet, and the /settings/mail owner surface. Updated §0.1 (Q-5 superseded by Q-14), the §7 Mail delta row, and the §8 trace to AC-MAIL-001..030.
- Exclusions now list only the remaining Q-14 boundaries: rich-text compose, attachment forwarding, OAuth, POP3.

### v2.7 — 2026-07-15 (Bookmarks nested category groups amendment, Phase 4)

- Added new §5.1.1 documenting one level of nested category groups (group → subcategory → bookmarks): the `<h2>`/`<h3>` heading hierarchy, the "Родительская категория" parent-select and its constraints (a subcategory is never offered as a parent; a category with existing subcategories cannot itself become a subcategory but remains a valid parent choice for others), the non-drag-reorderable subcategory heading with fully draggable nested bookmarks, the combined cascade-delete warning, and mobile stacking behavior. Updated the §5.1 trace/acceptance lines to AC-BM-001..034 and the Exclusions line to note the one-level nesting cap. This is newly documented scope, not a reversal of a prior exclusion. See AC-BM-029..034.

### v2.6 — 2026-07-15 (Bookmarks favicon-suggest amendment, Phase 3)

- §5.1 Bookmarks: documented the opt-in favicon-suggest control (populates the icon field from a fixed third-party service keyed on the bookmark URL's hostname, with a non-blocking failure notice on error) and the broken-icon-URL fallback to the deterministic tile; removed "automatic favicon fetching" from Exclusions since the exclusion no longer holds. See AC-BM-026..028.

### v2.5 — 2026-07-15 (Bookmarks drag-and-drop reordering amendment)

- §5.1 Bookmarks: documented drag-handle-based reordering, by pointer or keyboard, for categories and for bookmarks both within and across categories (cross-category drag repositions and reassigns the bookmark). Updated Actions, Accessibility (a separate keyboard-operable drag-handle focus stop with a non-generic Russian accessible name, inert while a search query is active), the acceptance/trace lines to AC-BM-001..025, and removed drag-and-drop ordering from Exclusions.

### v2.4 — 2026-07-15 (Bookmarks search/filter amendment)

- §5.1 Bookmarks: documented the client-only search input (labeled "Поиск закладок", visible only once at least one category exists), its case-insensitive name/description/URL substring filtering, the distinct no-results state with a "Сбросить поиск" clear action, and the `role="status"` live-region result-count announcement. Updated the acceptance/trace lines to AC-BM-001..021.

### v2.3 — 2026-07-15 (Bookmarks accent-color amendment)

- §5.1 Bookmarks: documented the optional per-bookmark accent color (one of three brand tone tokens), its icon-tile rendering, the accessible swatch picker with a "no color" clear option, and updated the acceptance/trace lines to AC-BM-001..018.

### v2.2 — 2026-07-15

- Activated dark theme and a manual theme switcher (superseding the Q-2 deferral and Appendix A's prior "deferred" status) per an approved product decision: the top bar was missing both the theme switcher and the operator identity/logout affordance that the prototype and this spec's own §4.2 already called for. Implemented with `next-themes` (class strategy) against the dark tokens already mirrored in src/app/inspot-tokens.css.
- Clarified §4.2 Shell: the operator menu (avatar-initial + username, dropdown with username/"Оператор"/logout) and the theme switcher live in the top bar's right side; the workspace switcher remains in the sidebar header. The sidebar footer's standalone username/logout affordance is removed as duplicative.

### v2.0 R1.5 addendum — 2026-07-14

- Classified canonical visual snapshots and nonnormative archives without changing the three Q-3 inputs.
- Added the same-change documentation and phase-checkpoint feedback workflow. R1.5 reference-integrity recheck PASS.

### Ordinary doc-review rework 1/2 — 2026-07-14

- DOC-DES-001: restored /settings as the compact hub with active Workspace and Webhooks links.
- DOC-DES-002: aligned accessibility gates to NFR-A11Y-001 and removed numeric touch-target release gates.
- DOC-DES-003: corrected the Logs trace to its actual source documents and acceptance criteria.

### v2.0 — 2026-07-14

- Replaced v1.1 with an executable specification aligned to approved PRD v3.0 and all Q-3 inputs.
- Fixed authority, seven-section scope, Russian finite allowlist, light-theme requirement, workspace/provider exception, and provider independence.
- Added exact foundations, shared Login/Shell/Settings behavior, responsive/accessibility rules, complete per-section contracts, and Phase 4 deltas.
- Added real Messages compose requirements AC-MSG-009..014 and Alerts deletion AC-ALR-008 while preserving explicit exclusions.
- The core v2.0 specification reached Approved — ordinary doc-review PASS before the R1.5 addendum.
