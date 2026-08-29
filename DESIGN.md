# Inspoter Design System Specification (DESIGN.md)

**Version:** 3.0  
**Stack:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Base UI, OKLCH Token System, Remix Icon 4.5  
**Audience:** Frontend Engineers, System Architects, UI/UX Designers, QA Automation Engineers  

---

## 1. Design DNA & Philosophy

Inspoter is an operational control plane for self-hosted infrastructure management (servers, domains, DNS, mailboxes, webhooks, databases, alerts, and cron jobs). The visual and interactive design philosophy is built on five core principles:

1. **High-Density, Operational Calm**  
   Every pixel serves operational situational awareness. Controls are compact (32px compact, 38px standard, 42px prominent), data typography is calibrated for fast scanning (14px base, 11–12px metadata), and spacing follows a strict 4px cadence. The UI eliminates decorative fluff, oversized marketing margins, ornamental blobs, and unprompted animations.

2. **Flat, Border-Defined Surfaces**  
   Cards, panels, and sidebars sit on the same optical plane as the application canvas (`var(--surface-app)` = `var(--surface-card)`). Hierarchy and boundaries are established exclusively through crisp 1px borders (`var(--border-default)`, `var(--border-subtle)`), never by floating drop shadows or heavy fill contrast.

3. **Restrained Elevation**  
   Drop shadows (`var(--shadow-menu)`, `var(--shadow-modal)`) are strictly reserved for transient floating layers: dropdown menus, dialog backdrops, popovers, sheets, and toast notifications. Cards and resting panels always use `box-shadow: none`.

4. **Strict OKLCH Color Science**  
   All color ramps are authored as pure perceptual OKLCH triplets (`L C H`). Light and dark modes maintain identical perceived contrast curves and hue consistency without color clipping or muddy desaturation. Opacity modifier composition is supported natively via Tailwind CSS v4 (`oklch(var(--primary-100) / 0.72)`).

5. **Semantic Status Clarity & Internationalization**  
   Color is never the single carrier of operational state. Every status badge pairs a 6px status dot (with optional live pulse halo) with an explicit localized string from `src/messages/{en,ru,lv}/status.json`. Domain enums map deterministically to 19 canonical states.

---

## 2. Design Tokens Reference

Tokens are defined in `src/app/inspot-tokens.css` and exposed via `@theme inline` in `src/app/globals.css`.

### 2.1 Color Ramps

Stored as raw OKLCH triplets (`L C H`) and consumed via `oklch(var(--token))` or Tailwind classes (`bg-primary-500`, `text-accent-700`).

#### Core Palettes (Light vs. Dark OKLCH Values)

| Token Key | Light Mode (`:root`) | Dark Mode (`.dark`) | Intent / Usage |
| :--- | :--- | :--- | :--- |
| `--background-50` | `0.985 0.002 95` | `0.12 0.007 80` | App canvas, card background |
| `--background-100` | `0.97 0.004 90` | `0.16 0.008 78` | Hover fills, subtle borders, sunken inputs |
| `--background-200` | `0.94 0.006 88` | `0.20 0.009 76` | Default card & control borders |
| `--background-300` | `0.90 0.008 85` | `0.26 0.010 75` | Strong borders, focused input strokes |
| `--background-400` | `0.84 0.01 82` | `0.32 0.011 74` | Muted decorative lines |
| `--background-500` | `0.78 0.012 80` | `0.40 0.012 73` | Intermediate neutral tone |
| `--background-600` | `0.65 0.014 78` | `0.50 0.011 72` | Mid-tone neutral borders |
| `--background-700` | `0.50 0.016 76` | `0.62 0.010 72` | Dark neutral accents |
| `--background-800` | `0.35 0.012 75` | `0.74 0.008 72` | Inverted surface fills |
| `--background-900` | `0.22 0.01 74` | `0.84 0.006 72` | High-contrast dark backgrounds |
| `--background-950` | `0.14 0.008 72` | `0.92 0.004 75` | Deepest canvas tone |
| `--foreground-50` | `0.92 0.003 260` | `0.10 0.008 260` | Inverted text / bright contrasts |
| `--foreground-100` | `0.84 0.004 260` | `0.14 0.010 260` | Very light ink |
| `--foreground-200` | `0.74 0.005 260` | `0.20 0.010 260` | Light ink |
| `--foreground-300` | `0.62 0.006 260` | `0.28 0.009 260` | Low-emphasis text |
| `--foreground-400` | `0.50 0.007 260` | `0.58 0.008 260` | Captions, meta, field placeholders |
| `--foreground-500` | `0.40 0.008 260` | `0.60 0.007 260` | Secondary labels |
| `--foreground-600` | `0.32 0.009 260` | `0.62 0.006 260` | Active secondary copy |
| `--foreground-700` | `0.25 0.01 260` | `0.68 0.005 260` | Strong body text |
| `--foreground-800` | `0.18 0.011 260` | `0.78 0.004 260` | High-contrast numbers, table data |
| `--foreground-900` | `0.13 0.012 260` | `0.88 0.003 260` | Default body text |
| `--foreground-950` | `0.09 0.01 260` | `0.95 0.002 260` | Headings, primary emphasis |
| `--primary-50` | `0.96 0.03 30` | `0.14 0.04 35` | Terracotta tint, error backgrounds |
| `--primary-100` | `0.91 0.06 30` | `0.18 0.06 33` | Active nav chip, badge fill |
| `--primary-200` | `0.85 0.09 30` | `0.24 0.09 32` | Badge hover, light accent border |
| `--primary-400` | `0.68 0.16 30` | `0.42 0.15 30` | Focus rings, active focus borders |
| `--primary-500` | `0.579 0.19 30` | `0.54 0.20 30` | Primary action button, brand accent |
| `--primary-600` | `0.50 0.17 30` | `0.62 0.18 30` | Primary button hover |
| `--primary-700` | `0.42 0.14 30` | `0.72 0.14 30` | Terracotta text on light chips |
| `--accent-50` | `0.95 0.03 175` | `0.12 0.04 175` | Success background, healthy tint |
| `--accent-100` | `0.88 0.06 175` | `0.18 0.06 175` | Success badge background |
| `--accent-200` | `0.80 0.09 175` | `0.24 0.08 175` | Success border |
| `--accent-500` | `0.50 0.14 175` | `0.54 0.15 175` | Healthy/online status dot, free capacity |
| `--accent-700` | `0.36 0.10 175` | `0.74 0.11 175` | Success text |
| `--secondary-50` | `0.96 0.015 85` | `0.12 0.012 85` | Info background, sand tint |
| `--secondary-100` | `0.90 0.02 85` | `0.18 0.018 85` | Secondary button, icon tile fill |
| `--secondary-200` | `0.82 0.025 85` | `0.24 0.022 85` | Secondary button hover, info border |
| `--secondary-400` | `0.62 0.035 85` | `0.42 0.030 85` | Idle/disabled status dot |
| `--secondary-700` | `0.36 0.03 85` | `0.72 0.028 85` | Secondary icon tile text, info copy |
| `--amber-500` | `0.77 0.16 70` | `0.77 0.16 70` | Warning status dot |
| `--amber-700` | `0.55 0.14 58` | `0.84 0.12 80` | Warning text |
| `--red-500` | `0.58 0.22 27` | `0.58 0.22 27` | Critical danger border / dot |
| `--red-700` | `0.44 0.18 27` | `0.80 0.12 27` | Critical danger text |

---

### 2.2 Semantic Token Aliases

Feature code should always consume semantic aliases rather than raw ramps:

```css
/* Surfaces */
--surface-app: oklch(var(--background-50));       /* Canvas background */
--surface-card: oklch(var(--background-50));      /* Card surface (identical to canvas) */
--surface-sunken: oklch(var(--background-100));   /* Sunken inputs, table header, muted well */
--surface-hover: oklch(var(--background-100));    /* Interactive item hover */

/* Borders */
--border-subtle: oklch(var(--background-100));    /* Row dividers */
--border-default: oklch(var(--background-200));   /* Default card & control borders */
--border-strong: oklch(var(--background-300));    /* Hovered controls & focused inputs */

/* Typography */
--text-primary: oklch(var(--foreground-950));     /* Page & card titles */
--text-body: oklch(var(--foreground-900));        /* Standard body copy */
--text-secondary: oklch(var(--foreground-600));   /* Field labels, secondary information */
--text-muted: oklch(var(--foreground-400));       /* Helper text, table captions */
--text-placeholder: oklch(var(--foreground-400)); /* Input placeholder text */
--text-on-accent: oklch(var(--background-50));     /* High-contrast text on primary buttons */

/* Actions & Focus */
--action-primary: oklch(var(--primary-500));      /* Primary CTA fill */
--action-primary-hover: oklch(var(--primary-600));
--focus-ring: oklch(var(--primary-400));          /* Keyboard outline ring */

/* Feedback & Banners */
--success-bg: oklch(var(--accent-50));            --success-border: oklch(var(--accent-200));   --success-text: oklch(var(--accent-700));
--info-bg: oklch(var(--secondary-50));            --info-border: oklch(var(--secondary-200));   --info-text: oklch(var(--secondary-700));
--warning-bg: oklch(0.96 0.04 85);                --warning-border: oklch(0.84 0.10 75);        --warning-text: oklch(var(--amber-700));
--error-bg: oklch(var(--primary-50));             --error-border: oklch(var(--primary-200));    --error-text: oklch(var(--primary-700));
--critical-bg: oklch(0.94 0.04 27);               --critical-border: oklch(var(--red-500));     --critical-text: oklch(var(--red-700));
```

---

### 2.3 Typography Scale

Three specialized font families are loaded via Next.js self-hosted `next/font`:

- **UI & Body:** `Inter`, `system-ui, -apple-system, sans-serif` (`--font-body`, `--font-sans`)
- **Headings & Display:** `Plus Jakarta Sans`, `system-ui, sans-serif` (`--font-heading`)
- **Monospace / Technical Data:** `JetBrains Mono`, `ui-monospace, monospace` (`--font-mono`) — used for IPv4/IPv6, ports, hashes, tokens, JSON snippets, cron expressions, and SQL logs.

#### Type Scale & Sizing Rules

| Token | Size | Line Height | Tracking | Standard Usage |
| :--- | :--- | :--- | :--- | :--- |
| `--text-2xs` | `10px` | `1.2` (`--leading-tight`) | `0.04em` | Micro metadata, chart axis ticks, status qualifiers |
| `--text-xs` | `11px` | `1.35` (`--leading-snug`)| `0.04em` | Badges, table metadata, timestamp captions |
| `--text-sm` | `12px` | `1.35` (`--leading-snug`)| `0` | Secondary labels, filter chips, compact buttons |
| `--text-base`| `14px` | `1.5` (`--leading-normal`)| `0` | **Workhorse body text**, standard controls, form inputs |
| `--text-md`  | `16px` | `1.35` (`--leading-snug`)| `0` | Card titles, topbar title, highlighted values |
| `--text-lg`  | `18px` | `1.35` (`--leading-snug`)| `-0.01em` | Section headers, empty-state titles |
| `--text-xl`  | `20px` | `1.2` (`--leading-tight`) | `-0.02em` | Page titles (`h1`), modal headers |
| `--text-2xl` | `24px` | `1.2` (`--leading-tight`) | `-0.02em` | Primary metric statistics |
| `--text-3xl` | `30px` | `1.2` (`--leading-tight`) | `-0.03em` | Rare hero numbers |

---

### 2.4 Spacing & Geometry Scale

A 4px baseline grid governs all layout and component padding:

```css
--space-0-5: 2px;
--space-1:   4px;
--space-1-5: 6px;
--space-2:   8px;
--space-2-5: 10px;
--space-3:   12px;
--space-3-5: 14px;
--space-4:   16px;
--space-5:   20px;
--space-6:   24px;
--space-8:   32px;
--space-10:  40px;
--space-12:  48px;
```

#### Standard Control Heights

- **`--control-sm` (32px):** Table row buttons, compact filter chips, search inputs inside headers. Meets WCAG 2.1 AA targets with spacing.
- **`--control-md` (38px):** Workhorse button height, standard form fields, select triggers.
- **`--control-lg` (42px):** Primary hero CTA, auth screen inputs.
- **Coarse Pointer Overrides:** On touchscreen devices (`@media (pointer: coarse)`), all control heights scale up to **44px** automatically.

#### Shell & Layout Dimensions

- **`--sidebar-width`:** `256px` (16rem) in expanded state.
- **`--sidebar-width-collapsed`:** `64px` (4rem) icon-rail state.
- **`--topbar-height`:** `56px` (3.5rem).
- **`--icon-tile-sm` / `md` / `lg`:** `28px` / `32px` / `36px`.

#### Radii Scale

```css
--radius-sm:   4px;    /* Micro badges, code chips */
--radius-md:   6px;    /* Icon tiles, dropdown items, tooltips */
--radius-lg:   8px;    /* Standard buttons, inputs, filter chips */
--radius-xl:   12px;   /* Cards, dialog panels, sheets */
--radius-2xl:  16px;   /* Empty-state icon wells */
--radius-full: 9999px; /* Status dots, avatars, pill chips */
```

#### Elevation & Shadows

```css
--shadow-none:  none;
--shadow-menu:  0 4px 12px -2px oklch(var(--foreground-950) / 0.12), 0 2px 4px -2px oklch(var(--foreground-950) / 0.08);
--shadow-modal: 0 12px 32px -8px oklch(var(--foreground-950) / 0.18), 0 4px 8px -4px oklch(var(--foreground-950) / 0.10);
--overlay-scrim: oklch(0 0 0 / 0.30);
```

---

### 2.5 Motion & Transitions

Animations are quick, subtle, and without bounce:

- `--duration-fast`: `150ms` (hover, focus ring, menu open)
- `--duration-base`: `200ms` (dialog transitions, tab switches)
- `--duration-slow`: `250ms` (sheet slide-in, off-canvas navigation)
- `--duration-chart`: `500ms` (SVG chart draw paths)
- `--duration-pulse`: `2000ms` (live status halo looping)
- `--ease-out`: `cubic-bezier(0, 0, 0.2, 1)`
- `--ease-in-out`: `cubic-bezier(0.4, 0, 0.2, 1)`

#### Named Keyframes

- `inspot-fade-in`: 4px upward rise with opacity 0 → 1.
- `inspot-scale-in`: 0.95 → 1.0 scale with opacity 0 → 1.
- `inspot-slide-in-right`: 16px right-to-left slide.
- `statusPing`: 1.0 → 2.2 scale expansion with opacity 0.55 → 0.
- `shimmer`: 200% horizontal background translation for skeleton states.
- **Reduced Motion:** When `prefers-reduced-motion: reduce` is active, all animation durations collapse to `0.001ms` and looping pulses/shimmers become static.

---

## 3. Component Library Contract

### 3.1 Core UI Primitives (`src/components/ui/`)

#### 1. Button (`button.tsx`)
Built on Base UI `@base-ui/react/button` with `class-variance-authority`.
- **Variants:**
  - `default`: Terracotta fill (`bg-[var(--action-primary)] text-[var(--text-on-accent)] hover:bg-[var(--action-primary-hover)]`).
  - `outline`: Border-defined surface (`border-[var(--border-default)] bg-[var(--surface-card)] hover:bg-[var(--surface-hover)]`).
  - `secondary`: Sand neutral fill (`bg-[oklch(var(--secondary-100))] text-[var(--text-body)] hover:bg-[oklch(var(--secondary-200))]`).
  - `ghost`: Transparent hover surface (`hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)]`).
  - `destructive`: Soft red fill (`bg-[oklch(var(--primary-100))] text-[oklch(var(--primary-700))] hover:bg-[oklch(var(--primary-200))]`).
  - `link`: Underlined primary text.
- **Sizes:** `default` (38px), `xs` (32px), `sm` (32px compact), `lg` (42px), `icon` (38x38px), `icon-xs` (32x32px), `icon-sm` (32x32px), `icon-lg` (42x42px).

#### 2. Badge (`badge.tsx`)
Built on Base UI `useRender` and `class-variance-authority`.
- **Variants:** `default` (terracotta chip), `secondary` (sand chip), `outline` (1px border), `success` (teal border/bg), `warning` (amber border/bg), `error` / `destructive` (terracotta error), `critical` (red border/bg), `info` (sand info), `ghost`, `link`.
- **Shape:** Soft pill (`rounded-4xl`), 20px fixed height (`h-5`), 11px text size (`text-xs`), inline icons sized to 12px (`size-3`).

#### 3. StatusIndicator (`status-indicator.tsx`)
The single canonical component for all operational states across the application.
- **Canonical Status States (19):** `up`, `down`, `stopped`, `suspended`, `disabled`, `revoked`, `pending`, `starting`, `stopping`, `restarting`, `syncing`, `inProgress`, `completed`, `error`, `stale`, `notConfigured`, `notChecked`, `unknown`, `system`.
- **Behavior:**
  - Callers pass `status: StatusState`. Color, pulse halo, and localized text are derived automatically from `useTranslations("status")`.
  - Live/transitional states (`up`, `starting`, `stopping`, `restarting`, `syncing`, `inProgress`) activate the `StatusDot` halo (`animate-status-ping`).
  - Historical lists (e.g. past service check logs) pass `pulse={false}` to suppress animation on settled past events.
  - Escape hatch: supports `variant` + `label` without pulse for log levels and alert severities.

#### 4. Card Family (`card.tsx`)
Flat, border-defined structural containers.
- **Components:** `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardAction`, `CardContent`, `CardFooter`.
- **Geometry:** `rounded-xl`, `border border-[var(--border-default)]`, `bg-[var(--surface-app)]`, `box-shadow: none`.
- **Sizes:** `default` (16px / `--space-4` padding) and `sm` (12px / `--space-3` padding).
- **Header Grid:** Automatically switches to two-column grid (`[1fr_auto]`) when `CardAction` is present.

#### 5. Dialog Family (`dialog.tsx`, `alert-dialog.tsx`, `sheet.tsx`)
Modal interactions built on Base UI primitives.
- **Backdrop:** `bg-[var(--overlay-scrim)]` (black at 30% opacity) with backdrop fade.
- **Panel:** `rounded-xl`, `bg-[var(--surface-card)]`, `border border-[var(--border-default)]`, `shadow-[var(--shadow-modal)]`.
- **AlertDialog:** Reserved for destructive actions (server stop/delete, workspace deletion, record removal). Header uses danger icon tile with affirmative cancel + destructive action.
- **Sheet:** Off-canvas sliding panel (`slideInRight`) for mobile navigation, server metric filters, and complex side forms.

#### 6. UsageMeter (`usage-meter.tsx`)
Segmented utilization strip for bounded hardware resources (CPU, Memory, Disk, Bandwidth, Quotas).
- **Architecture:** 20 segmented flex cells (5% resolution per cell), 8px high, separated by 2px gaps (`gap-0.5`).
- **Two-Tone Color Rule:** Used capacity renders in terracotta (`bg-primary-500`), remaining available capacity renders in teal (`bg-accent-500`).
- **Rounding Guard:** Any active load (>0%) always illuminates at least 1 cell; any available space (<100%) always preserves at least 1 free cell.
- **Accessibility:** `aria-hidden="true"`. Every caller renders exact numeric text alongside the meter.

#### 7. MetricRows (`metric-row.tsx`)
Unified 3-column CSS Grid (`grid-cols-[auto_1fr_auto]`) for resource metric alignment across cards.
- **Structure:** `[Label (text-foreground-500)]` → `[UsageMeter / Empty Spacer]` → `[Value (tabular-nums font-medium)]`.
- **Benefit:** Meters and values align strictly across varying label lengths without manual column widths.

#### 8. TimeSeriesChart (`time-series-chart.tsx`)
SVG line chart rendered directly with OKLCH theme tokens.
- **Features:** Fixed 1000x300 viewBox with `preserveAspectRatio="none"`, `vector-effect="non-scaling-stroke"`, interactive pointer crosshair tooltip, reboot event markers (vertical dashed lines), and min/avg/max/last text summary rows.
- **Tones:** `primary` (terracotta), `accent` (teal), `secondary` (sand).

#### 9. FilterBar (`filter-bar.tsx`)
Compact horizontal container enforcing `--control-sm` (32px) height across all nested inputs, select triggers, button groups, and search fields.

---

### 3.2 Shell Architecture (`src/components/shell/`)

- **`AppSidebar` (`app-sidebar.tsx`):**
  - Expanded width: 256px (`w-64`), Collapsed rail: 64px (`w-16`).
  - Contains workspace switcher, primary navigation list, system status summary, and settings link.
  - Active item state: `bg-[oklch(var(--primary-100)/0.72)] text-[oklch(var(--primary-700))]` with terracotta icon tile.
- **`DashboardTopbar` (`dashboard-topbar.tsx`):**
  - Height: 56px (`h-14`), pinned top with bottom border (`border-b border-[var(--border-default)]`).
  - Hosts mobile sheet toggle, page title context, language switcher (`EN` / `RU` / `LV`), theme toggle (Light / Dark), and operator profile menu.
- **`PageHeader` (`page-header.tsx`):**
  - Composes optional back button (`ri-arrow-left-s-line`), page title (`h1 text-xl font-semibold`), description, actions cluster, and child filter bars.
- **`PageBody` (`page-body.tsx`):**
  - Default: 24px desktop / 16px mobile padding (`flex flex-col gap-6`).
  - `fullBleed`: Collapses outer margins (`-m-6`) for 3-pane email client and full-height log streaming consoles.
- **`CardGrid` (`card-grid.tsx`):**
  - Responsive column grid: `columns={2}` (`sm:grid-cols-2`) or `columns={3}` (`sm:grid-cols-2 lg:grid-cols-3`) with 16px gap (`gap-4`).

---

## 4. Reusable UX Patterns

### 4.1 Empty States (`empty-state.tsx`)
Empty states are structured into three distinct operational scenarios:
1. **First-Run Empty State:** Explains the empty feature with a clear next step (e.g. "No servers registered" → "Connect First Server" CTA). Uses a 64px icon well (`rounded-2xl bg-secondary-100 text-secondary-600`).
2. **Filtered / No-Results State:** Triggered when search queries or filters yield zero records. Must preserve search inputs and offer a prominent "Clear filters" action.
3. **Restricted / Error Empty State:** Renders `tone="danger"` with a retry CTA button.

### 4.2 Loading Regions vs. Loading Overlays
- **Skeleton Layouts (`skeleton.tsx`, `skeletons.tsx`):** Used during initial page and card fetches. Matches exact card geometry and row height with a subtle OKLCH shimmer animation.
- **Local Control Spinners (`spinner.tsx`):** Used during button mutations (e.g. restarting a server, saving a DNS record). Disables only the active trigger while keeping surrounding data interactive.
- **Global Route Progress (`route-progress.tsx`):** 2px terracotta progress bar across the topbar during route transitions.

### 4.3 Danger Confirmations
All irreversible operations (server reboots, service stops, DNS record deletions, workspace removal) require a 2-step confirmation:
- Use `AlertDialog` with explicit impact explanation (e.g., stating that database entries are removed while external cloud resources remain intact).
- Affirmative destructive button uses `variant="destructive"` with focused initial cancel button.

### 4.4 Dense Filter Bars
- Implemented via `FilterBar` wrapper.
- All enclosed controls (`Input`, `Select`, `Button`, `ToggleGroup`) automatically clamp to 32px height.
- Labels are visually compact with uppercase tracking (`text-[10px] tracking-wide text-foreground-400`).

---

## 5. Guardrails & Anti-Patterns

### Strict Rules for Engineering & Design Review

| Category | ❌ Forbidden Anti-Pattern | ✅ Mandatory Approved Standard |
| :--- | :--- | :--- |
| **Colors** | Raw hex values (`#e11d48`, `#0f172a`) or arbitrary Tailwind colors (`bg-red-500`, `bg-zinc-900`) | OKLCH theme variables (`var(--action-primary)`, `oklch(var(--primary-500))`, `text-foreground-900`) |
| **Surfaces** | Floating drop shadows on resting cards (`shadow-md`, `shadow-lg` on `<Card>`) | Flat surfaces with 1px borders (`border border-[var(--border-default)] shadow-none`) |
| **Spacing** | Arbitrary Tailwind pixel margins (`mt-[17px]`, `p-[23px]`) | 4px scale spacing tokens (`gap-2`, `p-4`, `space-y-3`, `--space-4`) |
| **Icons** | Lucide, Feather, FontAwesome, or decorative emoji | Remix Icon 4.5 outline icons only (`ri-server-line`, `ri-shield-check-line`) |
| **Status** | Custom colored badges with hardcoded text (`<span className="text-green-500">Active</span>`) | Canonical `<StatusIndicator status="up" />` deriving localized text and pulse from catalog |
| **Typography** | Generic sans fonts or arbitrary font sizes (`text-[13px]`, `text-[17px]`) | Strict type scale tokens (`text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`) |
| **i18n** | Hardcoded English or Russian strings in JSX | `useTranslations()` / `getTranslations()` from `src/messages/{en,ru,lv}/` |
| **Meters** | Single-color progress bars that disappear when empty | Segmented `<UsageMeter />` showing both used (terracotta) and free (teal) cells |
| **Modals** | Custom popup divs without focus trapping or ARIA roles | Base UI `Dialog`, `AlertDialog`, or `Sheet` components |

---
*Inspoter Design System — Maintained by the Frontend Architecture Team.*
