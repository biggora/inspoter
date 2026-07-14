# Design Specification — inspoter

**Version:** v2.1
**Status:** Draft Q-13 amendment — independent doc-review pending
**Owner:** UI/UX Designer
**Date:** 2026-07-14
**Source of truth for:** frontend implementor and test engineer
**Consumes:** docs/prd.md v3.1 (D-21/Q-13), docs/architecture.md v1.4, and all three Q-3 inputs: specs/prototype/, specs/inspot-design/, specs/ui.md

---

## 0. Authority and use

This document is the executable visual and interaction contract for remediation 1.2. Implementors build to it; testers derive route, state, responsive, localization, keyboard, and visual assertions from it.

Precedence, highest first:

1. docs/prd.md v3.1 governs product scope, acceptance criteria, explicit Q decisions, and D-21/Q-13.
2. specs/inspot-design/ governs tokens, fonts, components, icon family, density, and motion.
3. specs/prototype/ governs demonstrated geometry and composition when it does not conflict with items 1–2.
4. specs/ui.md governs routes, flows, responsive transformations, and shared states, subject to the exceptions below.
5. The previous design specification v1.1 is historical fallback only. It may fill a gap only when all authorities above are silent and it does not change scope.

Unexplained divergence is not allowed. If an implementation constraint prevents conformance, record the affected rule and PRD ID before changing behavior.

### 0.1 Binding exceptions to the Q-3 inputs

- Q-1: all operator-visible UI is Russian under the finite allowlist in §3.
- Q-2: the required experience is light theme only. Dark theme and a theme switcher are deferred.
- Q-4: Messages includes a real authenticated-operator compose flow; the read-only legacy statement is superseded.
- Q-5: Mail remains read-only; no compose, reply, forward, delete, or mailbox polling UI.
- Q-6: Servers permits inventory/status plus start, stop, and restart only.
- Q-7 and AC-ALR-008: Alerts permits confirmed deletion; acknowledge and resolve controls do not exist.
- D-21/Q-13: Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts, Settings, webhook tokens, selected detail, exclusive local provider-resource bindings, mock state, caches, and cursors follow the active workspace. Provider credentials alone remain deployment-global `.env` secrets. Removing a local binding or workspace never deletes an upstream provider resource. D-20 is superseded and non-normative.
- Provider modes are independent. One provider may be real, another mock, and another errored without changing the others.

### 0.2 Source inventory

This inventory classifies evidence. It does not change the precedence above, the approved PRD, or the §0.1 exceptions.

| Source | Role |
| --- | --- |
| specs/ui.md | Q-3 routes, flows, responsive transformations, and shared states, subject to PRD exceptions. |
| specs/prototype/ | Working-prototype geometry and composition. |
| specs/inspot-design/ | Tokens, fonts, components, Remix icons, density, and motion. |
| specs/bookmarks-page.png; specs/servers-page.png; specs/messages-page.png | Canonical visual snapshots only for the captured Bookmarks, Servers, and Messages composition. They are subordinate to the PRD, design system, and §0.1; they add neither product scope nor a fourth Q-3 source. |
| specs/project-11944291.zip; specs/design-system.zip | Nonnormative archives and reference copies; never implementation authority. |

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

The complete allowlist of operator-visible non-Russian terms is exactly: inspoter, Cloudflare, Hetzner Cloud, Hetzner DNS, GoDaddy, DNS, VPS, IP, URL, TTL, HTTP, HTTPS, API, JSON.

Technical identifiers, environment-variable names, and API snippets are exempt only when presented as code or monospace. Every other visible navigation label, heading, button, field label, placeholder, validation message, loading state, empty state, error, toast, tooltip, dialog, status, date label, and pagination label is Russian.

Dates use ru-RU formatting and 24-hour time. Do not expose raw English enum values; map them to Russian labels while retaining raw identifiers only in monospace technical detail.

## 4. Shared product model

### 4.1 Login

Route: /login.

Centered, compact light-theme form with typographic inspoter wordmark, Russian username and password labels, a primary sign-in button, inline validation, a non-destructive authentication error, and disabled/pending submit state. No registration, social login, recovery, theme control, illustration, or invented brand mark.

After success, navigate to /bookmarks. Invalid credentials preserve the username, clear or retain the password according to security implementation, focus the error summary, and expose it with role=alert. Unauthenticated protected routes redirect here; logout returns here.

### 4.2 Shell

The shared protected shell contains the 256/64px sidebar, 56px top bar, workspace switcher, seven-section navigation, separated Settings link, page title/context action, operator menu, and Russian logout action.

Workspace switching updates all seven sections, Settings, webhook tokens, selected detail, local provider-resource bindings, mock state, caches, and cursors without a full-page reload. A switch aborts prior requests, discards late responses, clears the previous workspace's selected binding/detail and client state, remounts the keyed workspace boundary, and refetches destination content. The switcher shows pending, failure/retry, and empty-membership handling. The top bar action belongs to the current page and collapses to a labeled or icon-plus-label mobile control without losing its accessible name.

### 4.3 Settings utility

Routes: /settings, /settings/workspace, and /settings/webhooks.

/settings remains a compact utility hub with two active cards/links: Workspace → /settings/workspace and Webhooks → /settings/webhooks. Neither card is disabled or a placeholder.

Workspace settings provide complete CRUD and membership management: create, rename, delete, list members, add an existing operator, create an invite-only operator, and remove a member. Workspace deletion sits in a visually separated danger zone, requires explicit confirmation, states that workspace-scoped database content is removed, and states that provider/external resources are not removed. If the active workspace is deleted, the shell resolves another membership or returns to the permitted selection/login flow.

Webhook-token settings are active, not a placeholder. Provide list, create, one-time secret reveal, copy, and confirmed revoke. Never reveal a stored secret again. Use Russian labels; token values and API examples are monospace. Tokens follow the active workspace.

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

**Route and scope:** /bookmarks; active-workspace content. Trace: AC-BM-001..014, AC-WS-010..011.

**Layout/content:** page header plus primary Добавить закладку action; category sections with name, count, category menu, and bookmark grid. Each card shows an outline Remix icon or deterministic non-emoji fallback, name, description when present, and domain/URL context. Empty description must not reserve a blank block.

**Actions:** create/rename/delete category; create/edit/move/delete bookmark; confirmed destructive actions; activating a bookmark opens its valid HTTP/HTTPS URL in a new tab. Forms validate required name and URL before submit.

**States:** matched skeleton; first-category empty state; explicit initial-load error with Повторить; local form validation; local pending; success toast; mutation failure without removing confirmed cards. A no-results state appears only if a filter is later present.

**Mobile:** one-column category and card stack at 375px; category actions remain visible and operable; create/edit dialogs become sheets; long URLs wrap or truncate without body overflow.

**Accessibility:** category headings structure the page; card link and edit/menu controls are separate focus stops; destructive dialogs trap/restore focus; fallback icon has no redundant spoken text.

**Acceptance:** CRUD and cascade behavior satisfy AC-BM-001..010; icon/fallback satisfies AC-BM-011 without decorative emoji; grouping/new-tab behavior satisfies AC-BM-012..014; Russian-copy, Remix-only, 375px, and 1440px checks succeed; initial fetch failure exposes a working retry.

**Exclusions:** automatic favicon fetching, drag-and-drop ordering, bulk actions, sharing controls, and decorative emoji.

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

## 5.4 Mail

**Route and scope:** /mail; active-workspace, read-only records created by ingest. Trace: AC-MAIL-001..006, AC-WS-011.

**Layout/content:** compact filter/sort row, paginated list, and selected-message detail. List fields are sender, subject, and received time. Detail shows sender, subject, body, and timestamp. Ingest source metadata may appear only when already supplied; do not invent an administration surface.

**Actions:** filter by sender/text, sort by received date or sender, paginate, open detail, return to list, clear filters. There are no record mutations.

**States:** list/detail skeleton; empty mailbox; no filter results; fetch error with Повторить; detail-not-found error; pagination boundaries. Newly ingested records become observable through refresh/navigation.

**Mobile:** rows become stacked sender/subject/time records; selected mail opens a full-screen detail with Назад; narrow headers and controls wrap without overflow.

**Accessibility:** each row is one clearly named activation target; full body is readable in document order; filter changes have an announced result count; dates have unambiguous ru-RU text.

**Acceptance:** list/detail/filter/sort/pagination satisfy AC-MAIL-001..005; an ingested record appears in the list/detail per AC-MAIL-006 without added compose UI; all dates are ru-RU and all controls Russian.

**Exclusions:** compose, reply, forward, send, delete, archive, folders, attachments management, and mailbox polling.

## 5.5 Messages

**Route and scope:** /messages; active-workspace content. Trace: AC-MSG-001..007, AC-MSG-009..014; AC-MSG-008 is inactive.

**Layout/content:** desktop uses category/channel navigation and a selected-channel feed. The feed is chronological and server-paginated. Each record visibly identifies origin as Оператор or Внешний источник; operator name or available external source follows as text/monospace detail. A text composer is anchored after the feed.

**Actions:** create and rename categories/channels; delete either only after explicit confirmation; select channel; reach older pages; submit non-empty operator text to an existing channel. The composer uses a labeled textarea and Отправить button; Ctrl+Enter may submit while Enter inserts a newline. No attachment or decorative affordance exists.

**States:** navigation/feed skeletons; no categories; category with no channels; selected empty channel; no selection; page loading; compose pending; empty-content validation; missing-channel rejection; persistence failure. Do not insert a sent record until persistence is confirmed; on failure retain draft and confirmed feed.

**Mobile:** category/channel tree becomes a sheet with disclosure controls; selected channel occupies the page; compose remains visible without covering content. Feed records and controls wrap without overflow.

**Accessibility:** category disclosures expose aria-expanded and controls; selected channel uses aria-current; new confirmed messages use a polite live region without stealing focus; origin is text, not color-only; composer has label, error association, and keyboard submission help.

**Acceptance:** structure/feed/pagination satisfy AC-MSG-001..007; real compose, exactly-one persistence, attribution, origin visibility, validation, missing channel, and failure behavior satisfy AC-MSG-009..014. Ingested and operator records are distinguishable in the same feed. No auto-create, attachment, or emoji UI renders.

**Exclusions:** auto-created channels, file attachments, reactions, decorative emoji, typing indicators, message edit/delete, threads, calls, and false demo submission.

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
| Mail      | PARTIAL        | Read-only list/detail, filters, sorting, and pagination exist.                                      | Translate copy; replace Lucide; enforce ru-RU dates; stack narrow rows and provide full-screen mobile detail.                                                                                           | src/components/mail/mail-view.tsx                                                                                                                                                |
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
| Russian-only finite allowlist               | Q-1; NFR-I18N-001                                                     |
| Required light theme                        | Q-2; NFR-THEME-001                                                    |
| Three normative design inputs               | Q-3; NFR-DESIGN-001                                                   |
| Bookmarks                                   | AC-BM-001..014                                                        |
| Domains and provider-local resilience       | AC-DOM-001..009; AC-PROV-001..003                                     |
| Servers and only three power actions        | Q-6; AC-SRV-001..008                                                  |
| Mail read-only and observable ingest        | Q-5; AC-MAIL-001..006                                                 |
| Messages real compose and origin            | Q-4; AC-MSG-009..014                                                  |
| Messages no auto-create                     | Q-8; AC-MSG-006, AC-MSG-008 inactive, AC-MSG-013                      |
| Logs read/filter/sort and observable ingest | docs/idea.md Logs; specs/ui.md Logs; AC-LOG-001..005                  |
| Alerts delete, no acknowledge/resolve       | Q-7; AC-ALR-001..008                                                  |
| All-content workspace switch and isolation  | AC-WS-001..011; D-21/Q-13                                             |
| Active webhook token utility                | AC-WH-008..009                                                        |
| Observable ingest without added surface     | AC-WH-003, AC-WH-007; AC-MAIL-006; AC-MSG-005; AC-LOG-005; AC-ALR-007 |

## Appendix A — deferred dark tokens, nonnormative

Dark-token values present in specs/inspot-design/ are retained only as future reference. They do not authorize dark-theme implementation, a theme switcher, extra acceptance checks, or altered light-theme decisions in this iteration. Any activation requires a new approved product decision and a versioned update to this specification.

## Changelog

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
