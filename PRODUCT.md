# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Register

product

## Users

Self-hosters and infrastructure operators (solo operators today, workspace members via invite-only workspaces next). They use Inspoter on a desktop browser in long working sessions, occasionally on mobile for a quick status check. Their job on any screen: assess state fast (domains, servers, mail, messages, logs, alerts) and act without leaving the panel. The UI language is operator English by default, with Russian and Latvian fully supported.

## Product Purpose

Inspoter is a self-hosted operations hub on four equal pillars: infrastructure (domains with Cloudflare/Hetzner/GoDaddy DNS, Hetzner VPS servers, hosting, services), work management (dashboards, kanban boards, calendar, notes, bookmarks), communication (multi-account IMAP/SMTP mail, contacts with duplicate detection, Discord-style categorized messages), and AI agents (chats, runs, skills) — plus cross-cutting monitoring (activity, logs, alerts) and an executive management layer, all webhook-extensible from third-party systems. Success: an operator trusts the panel as the single source of truth for their infrastructure and their work, and can navigate any section's dense data without confusion.

## Positioning

One self-hosted panel where infrastructure operations and personal work management get equal billing: provider-deep control (Cloudflare, Hetzner, GoDaddy), multi-account mail, messaging, work management, and AI agents behind one login, one workspace model, and one component language, extensible by third-party webhooks. An infrastructure dashboard could not truthfully claim the integrated work/communication/AI layer; a generic productivity suite could not claim the provider-deep infrastructure control.

## Brand Personality

Operator-grade: dense, calm, precise, utilitarian. Confidence comes from consistency (one component language, one icon family — Remix), not decoration. Light theme is the default experience; dark theme is a first-class equal.

## Anti-references

- Consumer-marketing fluff in a tool: oversized hero typography, emoji, celebration animations.
- ThemeForest/dashboard-template aesthetics: gradient stat cards, glassmorphism, decorative blurs.
- Color as the only carrier of meaning (labels and badges always keep visible text).
- Generic AI slop: identical icon+heading card grids, gradient text, hero-metric templates.

## Design Principles

1. **Density with order.** Tables and lists carry a lot; rhythm comes from consistent spacing tokens, not from adding whitespace everywhere.
2. **One component language.** Dense, border-defined badges/controls; color supplements visible text, never replaces it.
3. **State is always honest.** Provider modes (real/mock/errored) are independent and visually distinguishable; empty/error/loading states never render as blank space.
4. **Localized or not shipped.** Every operator-visible string lives in `src/messages/{en,ru,lv}`; parity is enforced by tests.
5. **Keyboard and landmarks stay correct.** Base UI-based interaction, one page-level `<main>`, icon-only controls labelled.

## Workspace Model

Per-workspace section visibility: any of the sixteen hideable sections (dashboards, bookmarks, kanban, calendar, notes, agents, domains, servers, hosting, services, mail, contacts, messages, activity, logs, alerts) can be hidden by the workspace owner; Management stays available even when everything else is hidden.

## Accessibility & Inclusion

- Keyboard operability via Base UI primitives must not regress; focus indicators stay visible in both themes.
- Exactly one `<main>` landmark per page (known past regressions: nested `<main>` in Messages and Swagger UI).
- Locale parity enforced by `tests/unit/i18n/message-parity.test.ts`; `pnpm lint` rejects hardcoded non-base-language strings in `src/`.
- Contrast pairs are defined by the token set in `specs/inspot-design/` (see `docs/design.md` §Appendix A); keep `*-foreground`/surface pairing intact.

_Visual and interaction contract: `DESIGN.md` (v3.0) is the authoritative design system record; `docs/design.md` (v2.24) is the authoritative design specification; `specs/inspot-design/` holds tokens, fonts, components, icon family, density, and motion. This file derives from `docs/idea.md`, `AGENTS.md`, `docs/design.md`, and the app nav (`src/components/shell/nav-items.ts`) (2026-08-31)._
