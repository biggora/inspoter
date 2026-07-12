# UI/UX Design Specification — inspoter

**Version:** v1.1
**Status:** Revised for review (doc-review findings addressed)
**Owner:** UI/UX Designer
**Date:** 2026-07-12
**Source of truth:** `docs/prd.md` v2.1 (normative), `docs/progress.md` Decisions log
**Consumed by:** frontend-dev (implementation reference), tester (UI validation reference)
**Changelog (v1.1):** Addressed doc-review findings — I-1 (`text-muted` contrast/role split from `text-secondary`), M-1 (traceability footnotes for backend-only webhook-ingest ACs; AC-MSG-008 removed from covered range), M-2 (sidebar collapse breakpoint standardized to `lg`/1024px), M-3 (theme toggle marked deferred past Slice 1; Slice 1 is dark-only per coordinator decision), N-1 (removed unused `Command` from stack vocabulary), N-2 (added rationale for Login's narrow exception to the "submit never silently disabled" rule).
**Stack vocabulary:** Next.js 15 + Tailwind CSS + shadcn/ui (Sidebar, Card, Dialog, Sheet, Table, Badge, Skeleton, Toast/Sonner, Select, Popover, Tabs, Alert, DropdownMenu). No custom component is specified where a shadcn/ui primitive covers the need.

**Selected design-styles preset:** `Premium Parametric` (`dev-team:design-styles`, `references/premium-parametric.md`) — dialed in as a **dense operations dashboard**, not a marketing/motion-heavy surface. This document overrides the preset's motion-heavy and decorative directives per the task's Simplicity First constraint. Parameter dial-in for frontend-dev:

| Dial | Value | Meaning applied here |
|------|-------|-----------------------|
| DESIGN_VARIANCE | 2/10 | Predictable grid, sidebar + content, no asymmetric/masonry layouts. Dashboards need scanability, not artsy chaos. |
| MOTION_INTENSITY | 2/10 | CSS `:hover`/`:active`/focus transitions only (150–200ms ease). No scroll-triggered animation, no Framer Motion physics, no parallax. Exception: status dots for `transitioning` server state and `critical` severity may use a slow (2s) opacity pulse — the only "perpetual" motion permitted, because it encodes state, not decoration. |
| VISUAL_DENSITY | 8/10 ("Cockpit Mode") | Tight paddings, tables/lists favor `divide-y` and 1px borders over boxed cards where elevation isn't functional, monospace for all technical values (IPs, DNS values, IDs, tokens, timestamps, log/alert text bodies). |

**Adopted from the preset:** Rule 2 (Color Calibration — max 1 accent, no purple/neon, desaturated), Rule 4 (Dashboard Hardening — minimize card-boxing at high density), Section 7 (Forbidden Patterns — no pure black, no neon glow, no gradient text, no Inter font, no generic 3-card rows, no filler copy).
**Explicitly NOT adopted:** Section 4 Creative Arsenal (magnetic buttons, bento motion, glassmorphism, GSAP/ThreeJS, kinetic typography), Section 9 Motion-Engine Bento Paradigm, custom cursors — all out of scope for an information-dense ops tool and forbidden by the task's "no animation excess" constraint.

---

## 0. Slice 1 Scope (priority — build this first)

Per `docs/prd.md` §1 and Appendix B, **Slice 1 = Shell + Auth + Bookmarks**, covering `AC-SHELL-001..004`, `AC-AUTH-001..005`, `AC-BM-001..014`. This section is the authoritative, detailed spec for that slice. Section 3 below covers later slices at a lighter (but still implementable) level of detail, since PRD marks them "Later" priority.

**Slice 1 screens, in build order:**
1. Login (§3.1)
2. Shell (sidebar + topbar + user menu) (§3.2)
3. Bookmarks — grid, category CRUD, bookmark CRUD, empty state (§3.3)
4. Placeholder screen template, applied to Domains/Servers/Mail/Messages/Logs/Alerts/Settings (§3.2.4)

**Landing route decision:** The PRD defines no separate "dashboard home/overview" screen (Out of Scope explicitly excludes analytics/metrics dashboards beyond the seven listed sections). Therefore, after login the operator lands directly on **Bookmarks** (`/bookmarks`), the only implemented section in Slice 1. This is a routing decision, not a missing screen — do not build a summary/widgets home page.

---

## 1. User Flow

### 1.1 Primary flow — Slice 1 (first run to daily use)
```
Visit any dashboard URL
   │
   ▼
Unauthenticated? ──yes──► Redirect to /login (AC-AUTH-001)
   │no                          │
   ▼                            ▼
Session valid            Submit operator credentials
   │                            │
   │                    ┌───────┴────────┐
   │                 invalid           valid
   │                    │                │
   │                    ▼                ▼
   │           Inline error banner   Session cookie set (AC-AUTH-002)
   │           "Invalid credentials"        │
   │           stay on /login (AC-AUTH-003) │
   │                                        ▼
   └──────────────────────────────► Redirect to /bookmarks (Shell renders)
                                            │
                     ┌──────────────────────┼───────────────────────┐
                     ▼                      ▼                       ▼
           No categories/bookmarks   Categories exist        Click other nav item
           → Empty state (AC-BM-014)  → Grid by category      → Placeholder screen
                     │                (AC-BM-012)             (AC-SHELL-003)
                     ▼                      │
           "Create category" CTA            ▼
                     │              Create/Edit/Delete
                     └─────────────►  category & bookmark
                                       (dialogs, §3.3)
                                            │
                                            ▼
                                    User menu → Logout
                                    → session invalidated
                                    → redirect to /login (AC-AUTH-004)
```

### 1.2 Error / edge paths
- Empty name on category or bookmark create → inline field error, dialog stays open, no request sent until fixed (AC-BM-005/007).
- Invalid URL on bookmark create → inline field error under URL input (AC-BM-008).
- Delete category with bookmarks inside → confirm dialog explicitly warns of cascade delete (AC-BM-003/004) before any request fires.
- Navigating to a not-yet-built section → placeholder, never a 404 or blank screen (AC-SHELL-003).
- Direct deep-link to a protected route while unauthenticated → same redirect-to-login behavior as any other route (AC-AUTH-001), return path preserved as a `?next=` query param so login redirects back after success.

---

## 2. Design System

### 2.1 Typography
- **UI / display font:** `Geist` (Next.js 15 ships first-class `next/font/google` support; fallback stack `-apple-system, "Segoe UI", Roboto, sans-serif`). Chosen over Inter per preset Rule 2/Section 7 to avoid the generic "default AI dashboard" look while remaining a clean, neutral technical sans.
- **Monospace / technical data font:** `Geist Mono` (fallback `"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace`). Used for: IP addresses, DNS record values, server IDs/hostnames, webhook tokens, timestamps, log/alert message bodies, table numeric columns.
- Serif is banned (Section 7 rule).

| Token | Size / Line-height | Weight | Case | Usage |
|-------|--------------------|--------|------|-------|
| text-display | 28px / 1.2 | 600 | normal | Login brand mark only |
| text-h1 | 22px / 1.3 | 600 | normal | Page title (e.g. "Bookmarks") |
| text-h2 | 17px / 1.4 | 600 | normal | Card/section/dialog title |
| text-h3 | 14px / 1.4 | 600 | normal | Subsection, group label |
| text-body | 14px / 1.5 | 400 | normal | Default body copy, form values |
| text-small | 13px / 1.4 | 400 | normal | Secondary/meta text, helper text |
| text-label | 11px / 1.3 | 500 | UPPERCASE, tracking 0.04em | Field labels, table column headers, badges |
| text-mono | 13px / 1.4 | 400 | normal | Technical values in tables/cards (see font above) |
| text-mono-strong | 12px / 1.3 | 600 | UPPERCASE | Status/level tags (RUNNING, ERROR, 4XX) |

### 2.2 Spacing & Radius
- Base unit 4px. Scale: `space-1`=4px, `space-2`=8px, `space-3`=12px, `space-4`=16px, `space-5`=20px, `space-6`=24px, `space-8`=32px, `space-10`=40px, `space-12`=48px, `space-16`=64px.
- Default component padding: table/list rows `space-3` vertical / `space-4` horizontal; card body `space-4`; dialog body `space-6`.
- Radius: `radius-sm`=6px (inputs, buttons, small badges), `radius-md`=8px (cards, popovers), `radius-lg`=12px (dialogs/sheets), `radius-full`=999px (status dots, pill badges, avatars).
- Borders: `1px solid` default everywhere; focus ring adds a `2px` offset ring, never a heavier border.

### 2.3 Color Palette — Dark theme (default)

The dashboard is dark-first; dark is the default theme on first load (no light-mode flash). **Slice 1 ships dark theme only** — see §2.4 and §3.2.3 for the deferred light-theme/toggle note.

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | bg-page | `#0B0D10` | App background (near-black, never pure `#000000`) |
| Background | bg-surface | `#14171B` | Cards, table containers, sidebar |
| Background | bg-elevated | `#1C2026` | Dialogs, popovers, dropdown menus, sheets |
| Background | bg-sunken | `#0F1215` | Inset areas: code/secret blocks, log body preview |
| Background | bg-hover | `#1B1F25` | Row/item hover background |
| Text | text-primary | `#E7E9EC` | Headings, primary body text |
| Text | text-secondary | `#9BA3AF` | Meta text, helper text, placeholders, timestamps and any other informational text in dense tables |
| Text | text-muted | `#6B7280` | Disabled controls and purely decorative content only — never informational text (WCAG AA-exempt; see role note below) |
| Text | text-inverse | `#0B0D10` | Text on filled accent buttons |
| Accent | accent-primary | `#3B82F6` | Primary buttons, links, active nav item, selected state |
| Accent | accent-hover | `#5B9BF7` | Hover on accent-filled elements (brightens on dark bg) |
| Accent | accent-active | `#2563EB` | Pressed/active state |
| Accent | focus-ring | `#5B9BF7` (40% opacity ring) | `:focus-visible` outline on all interactive elements |
| Border | border-default | `#262B33` | Card/table/input borders, dividers |
| Border | border-subtle | `#1D2127` | Low-emphasis dividers (e.g. `divide-y` in dense lists) |
| Border | border-active | `#3B82F6` | Active/selected item border, focused input border |
| Semantic | success-bg | `#0F2A1E` | Success banner/badge background |
| Semantic | success-text | `#4ADE80` | Success banner/badge text and icon |
| Semantic | warning-bg | `#2A2110` | Warning banner/badge background |
| Semantic | warning-text | `#FBBF24` | Warning banner/badge text and icon |
| Semantic | error-bg | `#2A1414` | Error banner/badge background |
| Semantic | error-text | `#F87171` | Error banner/badge text and icon |
| Semantic | info-bg | `#0F2130` | Info banner/badge background |
| Semantic | info-text | `#38BDF8` | Info banner/badge text and icon |

### 2.4 Color Palette — Light theme (alternate, deferred)

Retained in this document for future activation. **Coordinator decision: Slice 1 ships dark theme only.** The light theme below and the theme-switch control described in §3.2.3 are deferred to a later slice — do not build a theme toggle in Slice 1.

| Role | Token | Hex | Usage |
|------|-------|-----|-------|
| Background | bg-page | `#F6F7F9` | App background |
| Background | bg-surface | `#FFFFFF` | Cards, table containers, sidebar |
| Background | bg-elevated | `#FFFFFF` (with `shadow-md`) | Dialogs, popovers, dropdown menus |
| Background | bg-sunken | `#F1F2F5` | Inset code/secret blocks |
| Background | bg-hover | `#F0F2F5` | Row/item hover background |
| Text | text-primary | `#14171B` | Headings, primary body text |
| Text | text-secondary | `#5B6270` | Meta text, helper text, timestamps and any other informational text in dense tables |
| Text | text-muted | `#8A909C` | Disabled controls and purely decorative content only — never informational text (WCAG AA-exempt; see role note below) |
| Text | text-inverse | `#FFFFFF` | Text on filled accent buttons |
| Accent | accent-primary | `#2563EB` | Primary buttons, links, active nav item |
| Accent | accent-hover | `#1D4ED8` | Hover on accent-filled elements |
| Accent | accent-active | `#1E40AF` | Pressed/active state |
| Accent | focus-ring | `#2563EB` (35% opacity ring) | Focus outline |
| Border | border-default | `#E2E5EA` | Card/table/input borders |
| Border | border-subtle | `#EDEEF2` | Low-emphasis dividers |
| Border | border-active | `#2563EB` | Active/selected/focused border |
| Semantic | success-bg | `#ECFDF5` | Success banner/badge background |
| Semantic | success-text | `#047857` | Success banner/badge text |
| Semantic | warning-bg | `#FFFBEB` | Warning banner/badge background |
| Semantic | warning-text | `#B45309` | Warning banner/badge text |
| Semantic | error-bg | `#FEF2F2` | Error banner/badge background |
| Semantic | error-text | `#B91C1C` | Error banner/badge text |
| Semantic | info-bg | `#EFF6FF` | Info banner/badge background |
| Semantic | info-text | `#1D4ED8` | Info banner/badge text |

**Role note (applies to both themes):** `text-muted` is reserved strictly for disabled controls and decorative elements (e.g. the placeholder-screen icon, §3.2.4) — it does not meet the 4.5:1 body-text contrast ratio (`#6B7280` on `#14171B` ≈ 3.7:1; `#8A909C` on `#FFFFFF` ≈ 3.2:1) and is WCAG AA-exempt on that basis (disabled/decorative content is not held to the body-text contrast requirement). It must never carry informational content — timestamps, table metadata, or any text the operator needs to read use `text-secondary`, which meets AA at 14px+.

All `text-primary`/`text-secondary` pairs above meet WCAG AA (≥4.5:1 for body text, ≥3:1 for large text/icons) at 14px+; `text-muted` is intentionally excluded from this guarantee per the role note above. Verify token combinations if frontend-dev substitutes shades.

### 2.5 Severity colors (Logs level, Alerts severity)

A shared 4-tier severity scale is used by both Logs and Alerts, per task requirement. Unknown/unmapped level strings from a webhook payload render with the `muted` tier rather than guessing.

| Severity | Dot/icon color (dark) | Badge bg (dark) | Badge text (dark) | Badge bg (light) | Badge text (light) |
|----------|------------------------|------------------|---------------------|-------------------|----------------------|
| info | `#38BDF8` | `#0F2130` | `#38BDF8` | `#EFF6FF` | `#1D4ED8` |
| warning | `#FBBF24` | `#2A2110` | `#FBBF24` | `#FFFBEB` | `#B45309` |
| error | `#F87171` | `#2A1414` | `#F87171` | `#FEF2F2` | `#B91C1C` |
| critical | `#FFFFFF` on `#DC2626` (solid fill, not tinted) | `#DC2626` | `#FFFFFF` | `#DC2626` | `#FFFFFF` |

`critical` is the only tier rendered as a solid filled badge (not tinted) and is the only severity permitted the 2s opacity-pulse on its leading dot, to guarantee it cannot be missed while scanning a dense table. `muted` fallback: bg `#1B1F25`/text `#9BA3AF` (dark), bg `#EDEEF2`/text `#5B6270` (light).

### 2.6 Server status colors

| Status | Dot color | Badge bg (dark) | Badge text (dark) | Motion |
|--------|-----------|------------------|---------------------|--------|
| running | `#34D399` | `#0F2A1E` | `#4ADE80` | none |
| stopped | `#6B7280` | `#1B1F25` | `#9BA3AF` | none |
| transitioning (starting/stopping/restarting) | `#FBBF24` | `#2A2110` | `#FBBF24` | 2s opacity pulse on dot only |
| error / unreachable | `#F87171` | `#2A1414` | `#F87171` | none |

Status is never conveyed by color alone: every status dot ships with a text label ("Running", "Stopped", "Starting…") and an `aria-label` (see §6).

---

## 3. Screen Specs

### 3.1 Login (Slice 1 — AC-AUTH-001..003)

**Purpose / goal:** The single env-seeded operator authenticates to reach the dashboard; nothing dashboard-related is reachable without this.

```
+----------------------------------------------------------------------+
|                                                                        |
|                                                                        |
|                         [ inspot ]  (wordmark, text-display)          |
|                    self-hosted operations dashboard                   |
|                                                                        |
|                 +----------------------------------------+            |
|                 |  Sign in                     (text-h2) |            |
|                 |                                          |            |
|                 |  [ Error banner — shown only on failure ]|           |
|                 |  "Invalid username or password."         |           |
|                 |                                          |            |
|                 |  USERNAME                               |            |
|                 |  [__________________________________]  |            |
|                 |                                          |            |
|                 |  PASSWORD                                |            |
|                 |  [__________________________________]  |            |
|                 |                                          |            |
|                 |  [        Sign in (accent-primary)   ]  |            |
|                 |                                          |            |
|                 +----------------------------------------+            |
|                                                                        |
+----------------------------------------------------------------------+
```

**Layout:** Single centered `Card` (max-width 380px) on `bg-page`, vertically centered. No marketing content, no illustration (Simplicity First — this is an operator tool, not a landing page). Subtle 1px `border-default` around the card, `radius-lg`.

**Components & states:**
- `Input` (username): default / focus (`border-active` + focus ring) / error (`border` = `error-text`, helper text below in `error-text`) / disabled while submitting.
- `Input` (password): same states, plus a show/hide toggle (eye icon button) — standard, not decorative.
- `Button` "Sign in": default / hover (`accent-hover`) / active (`accent-active`, translate-y 1px) / disabled (while request in flight, label swaps to "Signing in…" with a small inline spinner, no full-page spinner) / disabled if either field is empty (client-side, does not replace server validation).
- `Alert` (error banner, `variant="destructive"` using `error-bg`/`error-text`): appears above the form on `AC-AUTH-003` rejection. Message: **"Invalid username or password."** Generic on purpose — never reveal which field was wrong (security).
- No "forgot password" / "register" links — out of scope (single env-seeded operator, D-7).

**Content requirements:**
- Field labels: `Username`, `Password` (11px uppercase label style).
- Submit button label: `Sign in` / loading: `Signing in…`.
- Error copy: `Invalid username or password.`
- No placeholder text needed in inputs (labels are always visible, not placeholder-only — a11y requirement, §6).

**Validation / submit behavior:** Client-side only blocks empty-field submission (button disabled). All real validation is server-side; on any rejection show the single generic error banner above the form and refocus the username field. Never leak whether the username exists. *(Rationale for the empty-field disable, since §5 states forms generally never silently disable submit: Login is a deliberate, narrow exception. With exactly two required fields and no per-field error to explain — an empty box is self-evidently empty to the user looking at it — disabling avoids firing a wasted authentication attempt against the login rate limiter without hiding any information the operator doesn't already see.)*

---

### 3.2 Shell (Slice 1 — AC-SHELL-001..004, AC-AUTH-004)

**Purpose / goal:** Persistent chrome hosting all seven sections plus Settings, with clear current-location indication, usable from 375px to 1440px+ with no horizontal overflow.

#### 3.2.1 Desktop ≥1024px (reference 1440px) — AC-SHELL-004

```
+------------------------------------------------------------------------------------------+
| +----------------+  +------------------------------------------------------------------+ |
| | inspot     [«] |  |  Bookmarks                                    [+ New category]   | |
| |----------------|  |------------------------------------------------------------------| |
| | > Bookmarks    |  |                                                                    | |
| |   Domains      |  |  INFRASTRUCTURE                                                   | |
| |   Servers      |  |  +----------+ +----------+ +----------+ +----------+              | |
| |   Mail         |  |  | [icon]   | | [icon]   | | [icon]   | | + Add    |              | |
| |   Messages     |  |  | Proxmox  | | pfSense  | | Grafana  | | bookmark |              | |
| |   Logs         |  |  | desc..   | | desc..   | | desc..   | |          |              | |
| |   Alerts       |  |  +----------+ +----------+ +----------+ +----------+              | |
| |----------------|  |                                                                    | |
| |   Settings     |  |  DEV TOOLS                                                         | |
| |----------------|  |  +----------+ +----------+                                        | |
| | (o) Operator   |  |  | ...      | | + Add    |                                        | |
| |     [Logout]   |  |  +----------+ +----------+                                        | |
| +----------------+  +------------------------------------------------------------------+ |
+------------------------------------------------------------------------------------------+
```

- Sidebar: fixed width 248px, `bg-surface`, right border `border-default`. Collapse toggle (`«`) shrinks it to a 64px icon rail (shadcn `Sidebar` collapsible="icon" pattern) — persisted in local storage, purely a density preference, not required by any AC but supports AC-SHELL-004's "usable at 1440px" by giving operators more content width if desired.
- Active nav item: left accent bar (3px `accent-primary`) + `bg-hover` + `text-primary`; inactive items `text-secondary`, hover → `bg-hover`.
- Content area: `max-width: 1400px`, horizontal padding `space-8`, no fixed page container narrower than viewport — never causes horizontal scroll (AC-SHELL-004).
- Page header row: `text-h1` page title + primary action button (context-dependent, e.g. "New category" on Bookmarks) right-aligned.

#### 3.2.2 Mobile 375px — AC-SHELL-004

```
+---------------------------------------+
| [≡]     inspot          (o) Operator  |   <- sticky top bar, 56px
+---------------------------------------+
|  Bookmarks            [+ New category]|
|---------------------------------------|
|  INFRASTRUCTURE                       |
|  +-----------------------------------+|
|  | [icon] Proxmox            desc..  ||
|  +-----------------------------------+|
|  | [icon] pfSense            desc..  ||
|  +-----------------------------------+|
|  | + Add bookmark                    ||
|  +-----------------------------------+|
|                                        |
|  DEV TOOLS                            |
|  ...                                  |
+---------------------------------------+

[≡] tapped → off-canvas Sheet slides from left:
+------------------------+
| inspot            [x]  |
|-------------------------|
| > Bookmarks             |
|   Domains                |
|   Servers                |
|   Mail                   |
|   Messages                |
|   Logs                    |
|   Alerts                  |
|-------------------------|
|   Settings               |
|-------------------------|
| (o) Operator   [Logout]  |
+------------------------+
```

- Below `lg` breakpoint (< 1024px, verified at 375px per AC-SHELL-004): sidebar is not rendered inline. A sticky top bar (56px) holds a hamburger button (`[≡]`, 44×44px touch target), wordmark, and a compact user-menu trigger.
- Hamburger opens a shadcn `Sheet` (left-anchored, 85vw max 320px) containing the same nav list as desktop, plus Settings and the user menu/logout at the bottom. Closing: `[x]`, tap outside, or `Esc`.
- Card grids collapse to a single column (`grid-cols-1`); bookmark cards become full-width rows. No element exceeds `100vw`; all tables that would overflow switch to a stacked/card layout below `lg` (see §5).

#### 3.2.3 User menu (AC-AUTH-004)

Trigger: avatar + operator username in the sidebar footer (desktop) or top bar (mobile). Opens a shadcn `DropdownMenu`:
```
+-------------------------+
| Operator                |
| (env-seeded account)    |
|--------------------------|
| Theme       Dark ▾  *   |
|--------------------------|
| Log out                  |
+-------------------------+
```
- `Log out` triggers a session-invalidation request; on success, redirect to `/login` and show a toast: **"You have been logged out."** No confirmation dialog needed (logout is not destructive to data — AC-SRV-007-style confirms are reserved for state-changing/destructive actions per §4.3).
- Theme toggle (marked `*` above): **optional, not AC-required, and deferred past Slice 1.** Coordinator decision fixes Slice 1 to dark theme only (§2.3/§2.4) — omit this menu item entirely from the Slice 1 build. When it ships in a later slice alongside the light theme, it offers `Dark` / `Light` / `System`, persisted preference, defaulting to `Dark`.

#### 3.2.4 Placeholder screen (AC-SHELL-003)

Applied to Domains, Servers, Mail, Messages, Logs, Alerts, and Settings **until each ships in its own slice**. One reusable template — do not build seven bespoke empty pages.

```
+------------------------------------------------------------------+
|  Domains                                                          |
|--------------------------------------------------------------------|
|                                                                      |
|                         [ section icon, muted ]                     |
|                                                                      |
|                     Domains — coming soon                           |
|                                                                      |
|          Domain and DNS record management across Cloudflare,       |
|          Hetzner, and GoDaddy will be available in a future        |
|          release.                                                   |
|                                                                      |
+------------------------------------------------------------------+
```

- Route resolves (HTTP 200 within the authenticated shell), never a 404 or blank white screen (AC-SHELL-003).
- Title: `"<Section> — coming soon"`. Body copy is section-specific, one sentence, restating what the PRD says that section will do (see below), never a generic Lorem-style filler.
- Icon: outline style, `text-muted`, 48px, from the same icon set used in the sidebar for that nav item (visual continuity). This is a decorative glyph, not informational text, so `text-muted`'s AA exemption (§2.3 role note) applies.
- No CTA button (nothing to do here yet); no error styling — this is a neutral/informational state, not an error (`bg-surface`, `text-secondary` body, no semantic color).
- Per-section copy:
  - Domains: "Domain and DNS record management across Cloudflare, Hetzner, and GoDaddy will be available in a future release."
  - Servers: "Hetzner VPS monitoring and power controls will be available in a future release."
  - Mail: "Mail viewing, filtering, and webhook ingest will be available in a future release."
  - Messages: "Discord-style categories and channels for incoming messages will be available in a future release."
  - Logs: "Log viewing, filtering, and webhook ingest will be available in a future release."
  - Alerts: "Categorized alert viewing and webhook ingest will be available in a future release."
  - Settings: "Webhook token management will be available in a future release."

---

### 3.3 Bookmarks (Slice 1 — AC-BM-001..014)

**Purpose / goal:** The operator's single launchpad — create categories, populate them with bookmarks, open resources in one click.

#### 3.3.1 Populated state (AC-BM-012)

```
+--------------------------------------------------------------------------------+
|  Bookmarks                                                    [+ New category] |
|----------------------------------------------------------------------------------|
|  INFRASTRUCTURE                                        [Edit] [Delete]  (⋮ menu) |
|  +------------+  +------------+  +------------+  +------------------+          |
|  | [P] Proxmox|  | [pf]pfSense|  | [G] Grafana|  |   + Add bookmark  |          |
|  | proxmox... |  | firewall.. |  | metrics... |  |                  |          |
|  | hv1.lan    |  | gw.lan     |  | grafana... |  |                  |          |
|  +------------+  +------------+  +------------+  +------------------+          |
|                                                                                    |
|  DEV TOOLS                                              [Edit] [Delete]  (⋮ menu) |
|  +------------+  +------------------+                                            |
|  | [gh] GitHub|  |   + Add bookmark |                                            |
|  | git repos  |  |                  |                                            |
|  +------------+  +------------------+                                            |
+--------------------------------------------------------------------------------+
```

**Layout:** Categories render as stacked sections in creation order (or alphabetical — implementation choice, not PRD-mandated). Each category section has: `text-h3` category name, an overflow menu (rename / delete) at the row's right edge, then a responsive card grid (`grid-cols-4` at ≥1280px, `grid-cols-3` at ≥1024px, `grid-cols-2` at ≥640px, `grid-cols-1` below) of bookmark cards ending with a dashed "+ Add bookmark" ghost card scoped to that category.

**Bookmark card component:**
- Icon (24px) top-left: renders the configured icon reference; if unset, a deterministic fallback — a colored initials tile derived from the bookmark name (e.g. first letter, hashed background hue) — never a broken-image glyph (AC-BM-011).
- Name (`text-body`, weight 600, single line, truncate with ellipsis + native `title` tooltip on hover for full text).
- Description (`text-small`, `text-secondary`, 2-line clamp).
- Whole card is a link (`<a target="_blank" rel="noopener noreferrer">`) that opens the URL in a new tab on click/Enter (AC-BM-013).
- A small overflow (`⋮`) icon-button appears on hover/focus (top-right of the card) opening Edit / Delete — does not intercept the card's own click target; stops propagation so opening the menu never navigates.
- States: default / hover (`border-active`, subtle `bg-hover`) / focus-visible (focus ring, since the whole card is keyboard-activatable) / loading (skeleton, §3.3.4).

**Category section header controls:** overflow menu → `Rename category`, `Delete category`.

#### 3.3.2 Create / Edit Category dialog (AC-BM-001, AC-BM-002, AC-BM-005)

```
+----------------------------------------+
|  New category                     [x]  |
|------------------------------------------|
|  NAME                                    |
|  [____________________________________] |
|  (error, shown only after invalid submit)|
|  "Category name is required."            |
|                                            |
|                    [Cancel]  [Create]     |
+----------------------------------------+
```
- shadcn `Dialog`. Single field: `Name` (required, trimmed, max length e.g. 60 chars — implementation detail, not PRD-mandated but sane).
- Validation trigger: on submit (not on every keystroke) — reduces noise; re-validates on blur after the first failed submit. Empty/whitespace-only name → inline error **"Category name is required."**, `Create`/`Save` stays enabled so the user can retry without reopening (AC-BM-005).
- Edit mode: title becomes `Rename category`, field pre-filled, button label `Save`. On success: dialog closes, list updates without a full page reload (AC-BM-002), toast: **"Category renamed."**
- Create success: dialog closes, new (empty) category section appears at the end of the list, toast: **"Category created."** (AC-BM-001)

#### 3.3.3 Delete Category confirm (AC-BM-003, AC-BM-004)

```
+---------------------------------------------+
|  Delete "Infrastructure"?              [x]  |
|-------------------------------------------------|
|  This category contains 3 bookmarks. Deleting     |
|  it will also delete all bookmarks inside it.     |
|  This cannot be undone.                            |
|                                                      |
|                    [Cancel]  [Delete category]      |
+---------------------------------------------+
```
- shadcn `AlertDialog` (destructive pattern). `Delete category` button uses `error-text`/`error-bg` treatment, not the default accent.
- Copy is dynamic on bookmark count: if the category is empty, body reads **"This category is empty. Deleting it cannot be undone."** — no cascade warning needed. If it has N bookmarks, body reads exactly as above with the live count (AC-BM-003 warning requirement).
- On confirm: category and its bookmarks removed from the list without reload; toast **"Category and 3 bookmarks deleted."** (AC-BM-004, no-orphan invariant).
- Focus returns to the category's former position in the list (or the next logical element) after removal — never left on a removed node.

#### 3.3.4 Create / Edit Bookmark dialog (AC-BM-006..009, AC-BM-011)

```
+------------------------------------------+
|  New bookmark                       [x]  |
|--------------------------------------------|
|  NAME *                                    |
|  [______________________________________] |
|                                              |
|  URL *                                      |
|  [______________________________________] |
|  "Enter a valid http:// or https:// URL."   |
|                                              |
|  ICON  (optional)                           |
|  [______________________________________] |
|  e.g. an emoji, icon name, or image URL     |
|                                              |
|  DESCRIPTION  (optional)                    |
|  [______________________________________] |
|  [______________________________________] |
|                                              |
|  CATEGORY                                   |
|  [ Infrastructure                      ▾ ] |
|                                              |
|                    [Cancel]  [Create]       |
+------------------------------------------+
```
- Fields: `Name*`, `URL*`, `Icon` (optional, plain text reference per PRD assumption A-2 — no upload), `Description` (optional, textarea, 2 rows), `Category` (`Select`, defaults to the category the "+ Add bookmark" ghost card was clicked from).
- Validation (on submit, then on blur after first failure):
  - Name empty → **"Bookmark name is required."** (AC-BM-007)
  - URL empty → **"URL is required."** (AC-BM-007)
  - URL non-empty but not valid `http(s)://…` → **"Enter a valid http:// or https:// URL."** (AC-BM-008)
- Edit mode: title `Edit bookmark`, all fields pre-filled including current category; changing category moves the bookmark to the new section on save without reload (AC-BM-009). Button label `Save changes`.
- Create success: dialog closes, new bookmark card appended to the target category, toast **"Bookmark created."** (AC-BM-006).
- Icon rendering rule restated here for frontend-dev: unset/invalid icon → deterministic initials-tile fallback, never a broken `<img>` (AC-BM-011).

#### 3.3.5 Delete Bookmark confirm (AC-BM-010)

```
+----------------------------------------+
|  Delete "Grafana"?                 [x] |
|--------------------------------------------|
|  This bookmark will be permanently removed. |
|                                                |
|                    [Cancel]  [Delete]         |
+----------------------------------------+
```
- Lighter-weight `AlertDialog` (single item, no cascade implication). On confirm: card removed from grid without reload, toast **"Bookmark deleted."** (AC-BM-010).

#### 3.3.6 Empty state (AC-BM-014)

```
+--------------------------------------------------------------------+
|  Bookmarks                                                          |
|------------------------------------------------------------------------|
|                                                                          |
|                        [ bookmark/star icon, muted ]                    |
|                                                                          |
|                   No bookmarks yet                                      |
|                                                                          |
|         Create your first category, then add the links you use          |
|                          every day.                                      |
|                                                                          |
|                     [ + Create category ]                                |
|                                                                          |
+--------------------------------------------------------------------+
```
- Shown only when zero categories AND zero bookmarks exist. Centered, `bg-page`, no error styling (this is a neutral first-run state, AC-BM-014 explicitly "no error"). Single primary CTA opens the Create Category dialog (§3.3.2); once a category exists, the section immediately re-renders into the populated layout with a visible "+ Add bookmark" ghost card, guiding the very next step.

#### 3.3.7 Loading state

- On initial load / refetch, category sections render as skeletons: `text-h3`-height gray bar (skeleton) + a row of card-shaped `Skeleton` blocks (icon circle + two text lines) matching the real card's exact dimensions — never a generic spinner (preset Rule 5).

---

## 4. Interaction Patterns

### 4.1 Pagination (all bounded-list sections — Mail, Logs, Alerts, Messages-within-channel)
- Server-side pagination per `NFR-PERF-001`, default page size 50, configurable server-side (no client control over page size in v1).
- Pattern: shadcn-style `Pagination` control at the bottom of the list — `[‹ Previous]  Page 2 of 14  [Next ›]`. Previous/Next disabled at bounds. No "jump to page" input in v1 (not required, avoids scope creep).
- Loading a new page shows the existing list dimmed (60% opacity) with a small inline spinner in the pagination bar, not a full skeleton replace — keeps scroll position stable.
- Messages channel view additionally supports "scroll back" pagination (load-older-on-scroll-to-top) per AC-MSG-007, in addition to the same bottom pagination control for consistency with other lists.

### 4.2 Filters & sorting (Mail, Logs, Alerts)
- Filter bar sits directly under the page header, left-aligned: a text search `Input` (debounced 300ms, searches subject/message per section) + one or more `Select`/`Popover` filters specific to the section (Mail: sender; Logs: level, source; Alerts: category, severity).
- Sort control: a `Select` on the right of the filter bar, e.g. `Sort: Newest first ▾` with options relevant to the section (date asc/desc; for Alerts also by severity).
- Applying any filter/sort re-runs the paginated query and resets to page 1; the current filter/sort state is reflected in the URL query string so it survives reload/back-navigation.
- Active filters render as removable `Badge` chips under the filter bar (`Sender: alerts@ci.example ✕`) so the operator always sees what's applied.
- No-results-after-filter state: same visual language as an empty state but with copy **"No results match your filters."** plus a `Clear filters` button — distinct from the true empty state (no data at all), which instead prompts creation/points at webhook setup.

### 4.3 Destructive / state-changing confirmations
Required before firing: category delete (AC-BM-003), bookmark delete (AC-BM-010), DNS record delete (AC-DOM-007), webhook token revoke (AC-WH-009), and — most critically — **any server power action** (start/stop/restart, AC-SRV-007), since these affect live infrastructure.
- Pattern: shadcn `AlertDialog`, title = the specific action + target name (`Restart "web-01"?`), body states the concrete consequence, destructive actions use `error-text`/`error-bg` button styling; non-destructive-but-confirmed actions (e.g. server start) use the standard accent button since they aren't data-loss risks but still need a deliberate second step.
- Server power action confirm body copy: `Start`: "web-01 will be started. This may take a few seconds." `Stop`: "web-01 will be stopped and become unreachable." `Restart`: "web-01 will restart and be briefly unreachable."
- After confirming a power action: the button enters a `disabled` + spinner "Starting…"/"Stopping…"/"Restarting…" state, the card's status badge switches to `transitioning` (amber, pulsing dot) immediately, and polls until the target status is observed or the bound (30s/30s/60s) elapses. On timeout/failure: revert badge to the last known real status and show an inline error + toast (AC-SRV-008).

### 4.4 Toast notifications
- shadcn `Sonner`/`Toast`, bottom-right on desktop, bottom-center full-width on mobile. Auto-dismiss 4s (success/info) or persist-until-dismissed for errors that need action.
- Every create/update/delete/revoke action gets exactly one toast on completion: success (`success` styling, checkmark icon) or failure (`error` styling, message from the API's error payload, never a raw stack trace).
- Copy pattern: `"<Entity> <past-tense verb>."` e.g. "Bookmark created.", "Category renamed.", "Webhook token revoked.", or on failure "Couldn't delete category. Try again."

---

## 5. Component States (cross-cutting)

| State | Pattern |
|-------|---------|
| Loading (list/grid) | `Skeleton` blocks matching the real layout's exact shape/count (never a spinner replacing the whole area) — preset Rule 5. |
| Loading (button submit) | Button becomes `disabled`, label swaps to a present-participle verb ("Creating…", "Saving…", "Deleting…") with a small inline spinner glyph, no page-level overlay. |
| Empty (no data at all) | Centered icon + heading + one sentence + a single primary CTA where one exists (see AC-BM-014 §3.3.6). Neutral styling, not an error. |
| Empty (filtered to zero) | Same layout, copy "No results match your filters." + "Clear filters" button (§4.2). |
| Error — per-provider (Domains, AC-DOM-003) | Each provider's group header shows an inline `Alert` (`error-bg`/`error-text`) with the provider name and a short reason ("Cloudflare: request timed out"), and a `Retry` action; **other, healthy providers still render their domains** below/alongside it — the error never blanks the whole section. |
| Error — section-level (Servers, AC-SRV-003) | Full-width `Alert` at the top of the content area ("Couldn't load servers from Hetzner.") with a `Retry` button; no cards render below until retried successfully — Servers has one provider, so there's no "other healthy providers" partial case. |
| Error — mutation rejected (AC-DOM-009, AC-SRV-008) | Toast with the failure reason; the affected row/card visually reverts to its last confirmed state (never shows an optimistic value that didn't actually persist). |
| Validation error (forms) | Inline, directly under the offending field, `error-text`, triggered on submit then on blur; field border switches to `error-text`; the submit button is never silently disabled for validation — the user can always attempt submit and see why it failed (AC-BM-005/007/008) — with a single narrow exception for Login's empty-field disable (see rationale, §3.1). |

---

## 6. Later-Slice Screens (Domains, Servers, Mail, Messages, Logs, Alerts, Settings)

These trace to PRD sections §3.2–§3.9 (all "Later" priority). Specified at implementable detail so frontend-dev has a target when each slice is scheduled, but with less exhaustive state enumeration than Slice 1.

### 6.1 Domains (AC-DOM-001..009)

```
+----------------------------------------------------------------------------+
|  Domains                                                                    |
|--------------------------------------------------------------------------------|
|  [!] Cloudflare — request timed out. [Retry]                                   |
|                                                                                    |
|  DOMAIN               PROVIDER          STATUS                                    |
|  --------------------------------------------------------------------------------|
|  example.com          Hetzner DNS       ● active                    [View DNS]   |
|  mysite.dev            GoDaddy           ● active                    [View DNS]   |
+----------------------------------------------------------------------------+

DNS detail view (drill-in from "View DNS"):
+----------------------------------------------------------------------------+
|  ‹ Domains  /  example.com                                [+ Add record]   |
|--------------------------------------------------------------------------------|
|  TYPE   NAME              VALUE                          TTL     ACTIONS       |
|  --------------------------------------------------------------------------------|
|  A      @                 203.0.113.10                   3600    [Edit] [Del]  |
|  CNAME  www                example.com                    3600    [Edit] [Del]  |
|  MX     @                  mail.example.com (pri 10)       3600    [Edit] [Del]  |
|  TXT    @                  "v=spf1 include:_spf... "       3600    [Edit] [Del]  |
+----------------------------------------------------------------------------+
```
- Domain list: `Table`, monospace for domain name; provider shown as a small logo/text `Badge`. Per-provider error banners per §5.
- DNS record table: monospace for `NAME`/`VALUE`/`TTL` columns (technical data). Create/Edit uses a `Dialog` with `Type` (`Select`: A/AAAA/CNAME/MX/TXT/NS/SRV), `Name`, `Value` (input shape adapts to type — e.g. MX also shows a `Priority` number field), `TTL` (number, seconds). Type-specific validation on submit (AC-DOM-008): e.g. A/AAAA require a syntactically valid IPv4/IPv6; CNAME/NS require a valid hostname; MX requires host + numeric priority.
- Delete record: `AlertDialog`, "Delete this A record? This will remove it from Hetzner DNS." (AC-DOM-007).
- Provider rejects create/update/delete (AC-DOM-009): toast + row reverts to last known provider state, no optimistic row left dangling.
- Mock mode (AC-DOM-002/AC-PROV-001) needs no different UI — it's the same screen with deterministic seeded data; no "mock mode" banner is required by the PRD, so none is added (avoid inventing UI beyond spec). Optional: a subtle `Badge` "Mock data" next to the page title is acceptable if architect confirms mock-mode is user-visible, but is not mandated here.

### 6.2 Servers (AC-SRV-001..008)

```
+----------------------------------------------------------------------------+
|  Servers                                                                     |
|--------------------------------------------------------------------------------|
|  +----------------------+  +----------------------+  +----------------------+ |
|  | web-01                |  | db-01                 |  | worker-02              | |
|  | cx22 · 2vCPU / 4GB    |  | cx32 · 4vCPU / 8GB    |  | cx22 · 2vCPU / 4GB     | |
|  | 203.0.113.10 (mono)   |  | 203.0.113.11 (mono)   |  | 203.0.113.12 (mono)    | |
|  |                        |  |                        |  |                         | |
|  | ● Running              |  | ◐ Restarting…          |  | ○ Stopped               | |
|  | [Restart] [Stop]       |  | (actions disabled)      |  | [Start]                 | |
|  +----------------------+  +----------------------+  +----------------------+ |
+----------------------------------------------------------------------------+
```
- Card grid (`grid-cols-3` desktop / `grid-cols-1` mobile), not a table — each server has enough per-item detail and controls to warrant a card (preset Rule 4 exception: elevation communicates the actionable-unit boundary here).
- Status badge uses §2.6 tokens; IP/hostname/spec line in monospace.
- Power actions (`Start`/`Stop`/`Restart`, contextual to current status) always go through the confirm pattern in §4.3. During `transitioning`, all three action buttons are disabled and the badge shows the pulsing amber dot + present-participle label.
- Section-level error state per §5 if Hetzner is unreachable (AC-SRV-003); mock mode (AC-SRV-002) is the same screen with deterministic seeded servers.

### 6.3 Mail (AC-MAIL-001..006)

```
+----------------------------------------------------------------------------+
|  Mail                                                                        |
|--------------------------------------------------------------------------------|
|  [ Search subject/sender...  ]   Sender: [ Any ▾ ]     Sort: [ Newest ▾ ]      |
|--------------------------------------------------------------------------------|
|  ● ci@github.example      Build failed: main branch          2026-07-12 09:14 |
|    alerts@monitor.local   Disk usage warning on db-01         2026-07-12 08:02 |
|    noreply@hetzner.example Invoice #4821 available             2026-07-11 22:10 |
|--------------------------------------------------------------------------------|
|                         [‹ Previous]  Page 1 of 6  [Next ›]                    |
+----------------------------------------------------------------------------+

Detail (drill-in / side panel on desktop ≥1024px, full-screen route on mobile):
+----------------------------------------------------------------------------+
|  ‹ Back to Mail                                                              |
|  Build failed: main branch                                                   |
|  From ci@github.example · 2026-07-12 09:14                                   |
|--------------------------------------------------------------------------------|
|  <mail body, monospace if plain text>                                           |
+----------------------------------------------------------------------------+
```
- List row: unread/new indicator dot (optional visual affordance, not PRD-mandated but low-cost and consistent with "triage" framing in US-6) + sender + subject (truncate) + right-aligned monospace timestamp.
- Row click → detail view (AC-MAIL-002): on desktop ≥1024px this can be a two-pane master-detail layout (list left 40%, detail right 60%); on mobile it's a full route push (`‹ Back to Mail`). Master-detail is a layout enhancement, not scope creep — same two ACs either way.
- Filter/sort per §4.2.
- **Note (backend scope):** AC-MAIL-006 (webhook ingest creating a mail entry) is a backend AC with no dedicated UI — the entry it creates simply appears in this list/detail per the ACs above once ingested.

### 6.4 Messages (AC-MSG-001..004, AC-MSG-007) — Discord-style structure

```
+----------------------------------------------------------------------------+
| CATEGORIES/CHANNELS |  # deploys                                            |
|-----------------------|--------------------------------------------------------|
| OPS                    |  ci-bot   Build #4821 succeeded on main     09:14      |
|  # deploys       ●     |  ci-bot   Deploying to production...        09:15      |
|  # incidents           |  monitor  CPU spike detected on db-01       09:20      |
|-----------------------|                                                           |
| MONITORING             |                                                           |
|  # cron-jobs           |                                                           |
|  # uptime               |                                                           |
|-----------------------|--------------------------------------------------------|
| [+ New category]       |                    [‹ Previous]  [Load older ▲]        |
+----------------------------------------------------------------------------+
```
- Left rail (fixed ~220px on desktop, collapses to a channel-picker `Sheet` on mobile, same collapsing pattern as the main sidebar): categories (`text-label` uppercase, with overflow menu → rename/delete) containing channels (`# channel-name`, `text-body`, unread dot if new messages).
- Main pane: selected channel's messages, chronological (oldest → newest, AC-MSG-004), each message row = sender/source name (monospace, since messages arrive from external systems/bots) + message body + right-aligned monospace timestamp. No compose box in v1 — messages arrive only via webhook (PRD OQ-2 MVP interpretation: view-only); the input area at the bottom is intentionally omitted rather than shown-disabled, to avoid implying a feature that doesn't exist.
- Pagination: bottom control + "Load older" scroll-back per AC-MSG-007, consistent with §4.1.
- Category/channel create: small inline `+ New category` / per-category `+ New channel` triggers → simple `Dialog` with a `Name` field, same empty-name validation pattern as Bookmarks categories (§3.3.2) for consistency.
- Delete category/channel: `AlertDialog`; copy states the no-orphan outcome generically ("Channels in this category will be removed.") without committing to cascade-vs-reassign wording, since AC-MSG-003 leaves that to architecture — frontend-dev should phrase the confirm text to match whichever strategy architecture.md selects.
- **Note (backend scope):** AC-MSG-005 (webhook posts a message to an existing channel) and AC-MSG-006 (webhook to a non-existent channel is rejected 4xx) are backend ACs — the UI's only involvement is rendering the resulting message per AC-MSG-004 once ingested; the reject path (AC-MSG-006) has no UI surface at all. **AC-MSG-008 (channel auto-create) is inactive, gated on OQ-6, and is explicitly out of scope for this screen** until that question is resolved.

### 6.5 Logs (AC-LOG-001..004)

```
+----------------------------------------------------------------------------+
|  Logs                                                                        |
|--------------------------------------------------------------------------------|
|  [ Search message...   ]  Level: [ All ▾ ]  Source: [ All ▾ ]  Sort: [Newest ▾]|
|--------------------------------------------------------------------------------|
|  TIME (mono)        LEVEL      SOURCE (mono)     MESSAGE (mono)                |
|  --------------------------------------------------------------------------------|
|  09:14:02.331        ERROR      api-gateway        connection refused to db:5432 |
|  09:13:58.104        WARNING    worker-02           queue depth exceeded 500     |
|  09:13:40.221        INFO       ci-bot              build started for main       |
|--------------------------------------------------------------------------------|
|                         [‹ Previous]  Page 1 of 214  [Next ›]                  |
+----------------------------------------------------------------------------+
```
- Dense `Table`, `divide-y` rows (no per-row card boxing — Rule 4 at high density), all technical columns monospace, `LEVEL` rendered as a severity `Badge` (§2.5) with the mono-strong uppercase tag style.
- Filters: text search (message body), `Level` (multi-select: info/warning/error/critical + any raw unmapped values), `Source` (select, populated from distinct sources seen); sort by timestamp asc/desc (AC-LOG-003).
- Row expand (click) reveals full message body if truncated, inline (`Collapsible`), avoiding a separate detail route for something this lightweight.
- **Note (backend scope):** AC-LOG-005 (webhook ingest creating a log entry) is a backend AC with no dedicated UI — the entry it creates simply appears in this table per the ACs above once ingested.

### 6.6 Alerts (AC-ALR-001..006)

```
+----------------------------------------------------------------------------+
|  Alerts                                                    [+ New category]  |
|--------------------------------------------------------------------------------|
|  [ Search message...  ] Category:[All ▾] Severity:[All ▾]  Sort:[Newest ▾]     |
|--------------------------------------------------------------------------------|
|  ■ CRITICAL   Infra      db-01        Disk usage at 97%           09:20:11     |
|    ERROR      Deploys    ci-bot       Deployment failed: main     09:15:02     |
|    WARNING    Infra      web-01       Memory usage above 80%      09:10:44     |
|--------------------------------------------------------------------------------|
|                         [‹ Previous]  Page 1 of 9  [Next ›]                    |
+----------------------------------------------------------------------------+
```
- Same dense table pattern as Logs; `CATEGORY` shown as a plain `text-secondary` label column (categories are operator-defined, not severity-coded); `SEVERITY` uses the same §2.5 badges, `critical` rows get the solid-fill badge and the pulsing dot.
- Category management: `+ New category` opens the same lightweight name-only dialog pattern as Bookmarks/Messages categories; delete follows the same no-orphan-invariant confirm copy as §6.4.
- Filters/sort per §4.2 (category, severity, text query; sort by timestamp or severity per AC-ALR-005).
- **Note (backend scope):** AC-ALR-007 (webhook ingest creating an alert) is a backend AC with no dedicated UI — the entry it creates simply appears in this table per the ACs above once ingested.

### 6.7 Settings — Webhook tokens (AC-WH-008, AC-WH-009)

```
+----------------------------------------------------------------------------+
|  Settings — Webhook tokens                              [+ New token]        |
|--------------------------------------------------------------------------------|
|  NAME             PREFIX (mono)      CREATED       LAST USED     STATUS         |
|  --------------------------------------------------------------------------------|
|  CI pipeline       whk_live_4f2a…      2026-06-01    2h ago        ● Active [Revoke]|
|  monitoring-bot     whk_live_9c1e…      2026-05-14    —             ● Active [Revoke]|
|  old-key             whk_live_02aa…      2026-01-02    3mo ago       ○ Revoked        |
+----------------------------------------------------------------------------+

Create dialog:
+----------------------------------------+
|  New webhook token                 [x] |
|--------------------------------------------|
|  NAME                                    |
|  [____________________________________] |
|  e.g. "CI pipeline"                       |
|                                            |
|                    [Cancel]  [Create]     |
+----------------------------------------+

One-time secret reveal (replaces the dialog body after create):
+----------------------------------------------+
|  Token created                          [x]  |
|----------------------------------------------------|
|  Copy this token now — it will not be shown again.   |
|                                                          |
|  +--------------------------------------------------+  |
|  | whk_live_4f2a9d7c8e1b6a3f0d2c5e9b1a7f4c6d8e2b0a19 |  |
|  +--------------------------------------------------+  |
|                                            [ Copy ]      |
|                                                          |
|                                     [ Done ]              |
+----------------------------------------------+
```
- List: `Table`, prefix column monospace (e.g. first 12 chars + ellipsis — full secret is never re-displayed, NFR-SEC-002). Status `Badge`: `Active` (success tokens) / `Revoked` (muted). `Revoke` action only shown on active tokens.
- Create dialog: single `Name` field (required, so the operator can tell tokens apart) → on success, the dialog body swaps in place (not a new dialog) to the one-time secret reveal, using `bg-sunken` + monospace for the secret string, a `Copy` button (writes to clipboard, toast "Copied to clipboard."), and an explicit warning line above the secret in `warning-text`: **"Copy this token now — it will not be shown again."** (AC-WH-008). `Done` closes and returns to the list, which now shows the new token's prefix/status.
- Revoke: `AlertDialog`, "Revoke \"CI pipeline\"? Any requests using this token will be rejected immediately." Destructive button styling. On confirm, row's status flips to `Revoked` and its `Revoke` action disappears (AC-WH-009); no way to un-revoke in v1 (create a new token instead) — matches PRD's minimal token-management scope (no OQ-7 scoping expansion implied).

---

## 7. Responsive Notes

| Breakpoint | Behavior |
|------------|----------|
| < 640px (mobile, ref 375px) | Sidebar hidden, off-canvas `Sheet` nav (§3.2.2). All grids → single column. All dense tables (Domains DNS, Logs, Alerts, Mail list, Webhook tokens) switch from `Table` to a stacked card-per-row layout (label:value pairs) to avoid horizontal scroll — this is the mechanism that satisfies AC-SHELL-004's "no horizontal overflow" for data-heavy screens. Dialogs become full-height `Sheet`-style bottom sheets or full-screen dialogs. |
| 640–1023px (tablet) | Sidebar still off-canvas (simpler than a partial-collapse state); grids at `grid-cols-2`; tables remain as `Table` if content fits, else same stacked fallback as mobile for the widest tables (DNS records, Logs). |
| ≥1024px (desktop, ref 1440px) | Persistent sidebar (248px, collapsible to 64px icon rail); full `Table` layouts; multi-column card grids (up to `grid-cols-4` for Bookmarks, `grid-cols-3` for Servers); Mail can use master-detail two-pane. |
| Content max-width | 1400px, centered with side padding — prevents line lengths and table density from becoming unreadable on ultra-wide monitors, while still satisfying "usable at 1440px" (content isn't awkwardly stretched edge-to-edge). |

The `lg` (1024px) sidebar-collapse threshold above is the single source of truth for this breakpoint; §3.2.2 references it for the same behavior at the 375px reference width.

---

## 8. Accessibility Checklist (NFR-A11Y-001)

- **Contrast:** All informational text-role pairs in §2.3/§2.4 (`text-primary`, `text-secondary` on their paired backgrounds) meet WCAG AA (≥4.5:1 body text/≥3:1 large text & icons). `text-muted` is reserved for disabled controls and decorative content only (§2.3 role note) and is excluded from this guarantee — it must never be the sole rendering for timestamps or other informational text; use `text-secondary` for those. Status dots always pair with a text label — color is never the only signal (critical for severity/status comprehension).
- **Focus order:** Logical DOM order matches visual order: skip-to-content link (visually hidden until focused) → sidebar nav → page header/actions → page content → pagination. Dialogs trap focus and restore it to the triggering element on close.
- **Focus visibility:** Every interactive element (nav links, buttons, inputs, cards-as-links, table row actions, badges that act as filter toggles) has a visible `:focus-visible` ring using the `focus-ring` token — never `outline: none` without a replacement.
- **Keyboard support:** Full keyboard operability for: sidebar nav (arrow keys optional, Tab is sufficient), opening/closing dialogs (`Esc` closes), bookmark cards (`Enter`/`Space` activates the link, opens in a new tab same as click), all form submissions (`Enter` in a single-line input submits the enclosing form), pagination controls, filter `Select`/`Popover` components (native shadcn/Radix keyboard behavior — no custom overrides needed).
- **ARIA for status indicators:** Status dots (server power state, log/alert severity, webhook token active/revoked) render as `<span role="img" aria-label="Running">` (or equivalent) wrapping the visual dot + text, so screen readers announce the state, not just a colored shape. Live-updating statuses (post power-action polling) use a polite `aria-live="polite"` region so screen reader users hear "web-01 status: Running" without an interruption.
- **Forms:** Every input has a programmatically associated `<label>` (not placeholder-only labeling, per §3.1 login note). Error messages are linked via `aria-describedby` and the input gets `aria-invalid="true"` on error. Required fields marked with `aria-required="true"` (visual `*` is a sighted-user affordance, not the sole indicator).
- **Landmarks:** `<nav>` for the sidebar, `<main>` for content, `<header>` for the top bar — enables screen-reader landmark navigation across the shell.
- **Toasts:** Rendered in an `aria-live="polite"` (success/info) or `aria-live="assertive"` (error) region so they're announced without requiring focus to move.
- **Touch targets:** Minimum 44×44px for icon-only buttons (hamburger, overflow menus, mobile pagination arrows) per mobile usability baseline, even though NFR-BROWSER-001 doesn't mandate full mobile optimization — this is a low-cost a11y win, not scope creep.
- **Verification method (per NFR-A11Y-001):** automated `axe` pass with zero critical violations on Login, Shell, and Bookmarks (Slice 1 minimum); recommended (not blocking) to extend to later-slice screens as they ship.

---

## Appendix — Traceability Summary

| Screen | AC-IDs covered |
|--------|-----------------|
| Login | AC-AUTH-001, AC-AUTH-002, AC-AUTH-003 |
| Shell (sidebar/topbar/mobile sheet) | AC-SHELL-001, AC-SHELL-002, AC-SHELL-004 |
| Placeholder template | AC-SHELL-003 |
| User menu / logout | AC-AUTH-004 |
| (Bootstrap behavior — no dedicated screen, see architecture.md) | AC-AUTH-005 |
| Bookmarks — grid + cards | AC-BM-011, AC-BM-012, AC-BM-013 |
| Bookmarks — category dialogs | AC-BM-001, AC-BM-002, AC-BM-005 |
| Bookmarks — category delete confirm | AC-BM-003, AC-BM-004 |
| Bookmarks — bookmark dialogs | AC-BM-006, AC-BM-007, AC-BM-008, AC-BM-009 |
| Bookmarks — bookmark delete confirm | AC-BM-010 |
| Bookmarks — empty state | AC-BM-014 |
| Domains — list + DNS table | AC-DOM-001..009 |
| Servers — cards + power actions | AC-SRV-001..008 |
| Mail — list + detail + filters | AC-MAIL-001..005; AC-MAIL-006 is a backend AC (webhook ingest) — the UI only renders the resulting mail entry once created |
| Messages — categories/channels + feed | AC-MSG-001..004, AC-MSG-007; AC-MSG-005/AC-MSG-006 are backend ACs (webhook ingest accept/reject) — the UI only renders the resulting message or is unaffected by the reject path; AC-MSG-008 is inactive (gated on OQ-6) and intentionally not covered by any screen |
| Logs — table + filters | AC-LOG-001..004; AC-LOG-005 is a backend AC (webhook ingest) — the UI only renders the resulting log entry once created |
| Alerts — list + filters | AC-ALR-001..006; AC-ALR-007 is a backend AC (webhook ingest) — the UI only renders the resulting alert once created |
| Settings — webhook tokens | AC-WH-008, AC-WH-009 (NFR-SEC-002 secret-handling) |

No PRD user story (US-1..US-10) is without a covering screen above.
