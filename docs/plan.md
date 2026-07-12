# Execution Plan — inspoter (vertical slices)

**Version:** 1.3
**Status:** Revised after ordinary doc-review (post-CONSENSUS; v1.2 → v1.3, Findings 1–3)
**Owner:** Planner
**Date:** 2026-07-12
**Normative inputs:** `docs/prd.md` v2.1 (requirements + AC-IDs), `docs/architecture.md` v1.1 (layers, schema §2.3, build order §7, ADRs §8), `docs/design.md` v1.1 (UI spec, Slice 1 dark-only), `docs/progress.md` (coordinator Decisions log)
**Consumed by:** coordinator (dispatch), tester (test-plan matrix), backend-dev, frontend-dev, implementor, code-reviewer

**Scope of this document:** Slice 0 (scaffolding) and Slice 1 (tracer bullet) are specified at **executable, per-file** detail — work starts on them immediately. Slices 2–7 are specified at **structural** detail (goal, AC coverage, ordering, coarse subtasks, disjoint scope zones) per the current-launch boundary in `progress.md` line 3. No requirement is invented beyond PRD v2.1; no architecture decision is altered. Any document conflict is recorded in §9 Conflicts, not silently "fixed".

## Changelog

**v1.3 — 2026-07-12 (ordinary doc-review, post-CONSENSUS; Findings 1–3; not a debate cycle).**
- **Finding 1 (Important) — fixed:** §5.4 item 4 now builds a `settings/page.tsx` placeholder (was 404 while the shell nav links to Settings). Added a C-2-style tester note that AC-SHELL-003 covers only the 7 PRD sections; the Settings placeholder is a smoke check, not an AC.
- **Finding 2 (Important) — fixed:** §4.2 item 11 now assigns the implementor to install all test-framework **devDependencies** in Slice 0; item 13 clarifies the tester writes only configs + tests and never edits `package.json`. Closes the gap that left the `npm run test` exit gate's deps unowned.
- **Finding 3 (Suggestion) — added:** §9 C-4 records that `src/app/(dashboard)/settings/**` + `src/components/settings/**` come from design §6.7 and are absent from the architecture §6 tree — a known doc divergence flagged for the architect, not a plan invention.

**v1.2 — 2026-07-12 (adversarial debate cycle 2; CH-PLAN-006..007).** Both `accepted_and_fixed`: C-3 reuses the existing `UNSUPPORTED_TYPE` enum code (no new code invented); §7.1 diagram corrected to `Phase 0 stubs ∥ tester Mode A → (backend ∥ frontend) → tester Mode B → review`.

**v1.1 — 2026-07-12 (adversarial debate cycle 1; CH-PLAN-001..005).** All five `accepted_and_fixed`:
- **CH-PLAN-001 (HIGH):** Slices 5/6/7 no longer claim mutual parallelism on the shared webhook files. The type-registration touch of `src/lib/validation/webhooks.ts` + `src/lib/webhooks/dispatch.ts` is now a **serialized** subtask (fixed order 5→6→7); only the disjoint per-slice service-read/UI/test files parallelize. Updated §6 (Slice 4 note + new Slice-5/6/7 serialization lead), §7.1 order, Z-1/O-2 in §12.
- **CH-PLAN-002 (MEDIUM):** Added a **Phase 0 contract-stub** step to Slice 1 (backend-dev commits typed stub signatures of `dal.ts` + `services/bookmarks.ts` before the parallel fan-out) so frontend server components typecheck and Mode-A tests fail on assertions, not module-not-found. Updated §5 workflow, §5.1, §5.3.
- **CH-PLAN-003 (MEDIUM):** Marked AC-WH-003, AC-WH-007, AC-PROV-001, AC-PROV-003 as **distributed/incremental** verification; reworded DoD §10.1 (+ distributed-AC table); added interim webhook-type behavior as **C-3** in §9 and an Appendix A footnote.
- **CH-PLAN-004 (LOW):** Added AQ-2 (U-9), AQ-3 (U-10), OQ-7 to the §7.2 register with owner + trigger; softened Slice-5 AQ-3 wording from "resolved" to "assumed, confirm before Slice 5".
- **CH-PLAN-005 (LOW):** Slice-1 runtime deps (`zod` et al.) added to the Slice-0 install checklist (item 11); `<Toaster/>` mount named (root layout, Slice 0, implementor-owned, item 9).

**v1.0 — 2026-07-12.** Initial plan.

---

## 1. Task Summary

Deliver `inspoter` — a self-hosted, single-operator operations dashboard (Next.js 15 App Router + TypeScript + Tailwind + shadcn/ui, Prisma + PostgreSQL) — as a sequence of vertical slices. Each slice is one demonstrable end-to-end user path proven by acceptance tests written before implementation. Slice 1 is the tracer bullet: it pierces every layer (env config → Prisma → service → API/server action → middleware/auth → shell UI → Bookmarks UI → tests) on the lowest-risk section (Bookmarks has zero external-provider dependency, PRD §7 Alternative B). Later slices add the provider-backed sections (Domains, Servers) and the webhook-ingest-backed sections (Logs, Alerts, Mail, Messages) plus webhook token management.

**Why this order:** proving the full fixed stack end-to-end once, on the section with no third-party credential dependency, retires integration risk before any provider or webhook code is written (PRD §7 Decision; architecture §7). The two later tracks — provider track (Domains, Servers) and webhook-ingest track (Logs, Alerts, Mail, Messages) — are independent; the webhook backbone is built once (Slice 4) and proven on the simplest payload (Logs) before its more complex consumers, satisfying the constraint that webhook ingest precede its Mail/Messages/Logs/Alerts consumers (architecture §7.2).

---

## 2. Test Framework Decision (recorded)

**Decision T-1: Vitest + @testing-library/react for unit/integration; Playwright for end-to-end acceptance.**

- **Evidence / trace:** architecture §6 project tree names `tests/ # unit + integration (Vitest)` (architecture.md:522) — Vitest is the already-sanctioned unit/integration runner; this plan confirms and extends it. The stack is fixed (NFR-STACK-001) but no test framework is mandated by PRD, so the choice is the planner's to record here.
- **Rationale:** Vitest is the native test runner for the Vite/ESM + TypeScript toolchain Next.js 15 uses, is fast, and shares config with the app's TS paths. Testing Library exercises Server/Client components and validation logic at the integration layer. Playwright drives the true end-to-end acceptance paths (login → shell → Bookmarks CRUD in a real browser at 375px and 1440px for AC-SHELL-004; automated axe pass for NFR-A11Y-001/M-8; webhook HTTP-status assertions for M-4).
- **Ownership:** the `tests/` (Vitest) and `e2e/` (Playwright) directories are owned exclusively by the **tester** role in every slice. No backend-dev or frontend-dev writes test files; this keeps the acceptance suite adversarially independent of implementation and prevents scope collision.
- **Two-mode tester protocol (matches progress.md task table 13/16):**
  - **Mode A (red):** before implementation, turn the slice's AC-IDs into failing acceptance tests (Vitest for service/API/validation/webhook-status; Playwright for browser paths). Deliver a red suite + a stub row per AC in `docs/test-plan.md`.
  - **Mode B (green):** after implementation, run the suite to green, fill the `docs/test-plan.md` traceability matrix (AC-ID → test file:case → PASS), and record any residual gaps.

---

## 3. Affected Areas (whole product, by layer — per architecture §6 tree)

| Layer | Paths (architecture §6) | Introduced in |
|---|---|---|
| Config / bootstrap | `src/lib/config/env.ts`, `src/lib/db.ts`, `prisma/schema.prisma`, `prisma/seed.ts` | Slice 0 (schema+db+base env), Slice 1 (auth env+seed) |
| Auth | `src/middleware.ts`, `src/lib/auth/{session,password,dal}.ts`, `src/app/login/**` | Slice 1 |
| Shell | `src/app/(dashboard)/layout.tsx`, `src/app/page.tsx`, `src/components/shell/**` | Slice 1 |
| Bookmarks | `src/app/(dashboard)/bookmarks/**`, `src/app/api/{categories,bookmarks}/**`, `src/lib/services/bookmarks.ts`, `src/lib/validation/bookmarks.ts`, `src/components/bookmarks/**` | Slice 1 |
| Provider abstraction | `src/lib/providers/{result.ts,dns/**,servers/**}` | Slice 2 (dns), Slice 3 (servers) |
| Domains | `src/app/(dashboard)/domains/**`, `src/lib/services/domains.ts`, `src/lib/validation/dns.ts` | Slice 2 |
| Servers | `src/app/(dashboard)/servers/**`, server power route + poll | Slice 3 |
| Webhook backbone | `src/app/api/webhooks/[type]/route.ts`, `src/lib/webhooks/**`, `src/lib/validation/webhooks.ts`, `src/app/api/webhook-tokens/**`, `src/lib/services/webhookTokens.ts` | Slice 4 |
| Logs | `src/app/(dashboard)/logs/**`, `src/lib/services/logs.ts` | Slice 4 |
| Alerts | `src/app/(dashboard)/alerts/**`, `src/lib/services/alerts.ts` | Slice 5 |
| Mail | `src/app/(dashboard)/mail/**`, `src/lib/services/mail.ts` | Slice 6 |
| Messages | `src/app/(dashboard)/messages/**`, `src/lib/services/messages.ts` | Slice 7 |
| Settings (token UI) | `src/app/(dashboard)/settings/**`, `src/components/settings/**` (from design §6.7; see C-4) | Slice 4 (Settings placeholder in Slice 1, §5.4) |
| Deploy | `Dockerfile`, `docker-compose.yml`, `.env.example` | Slice 0 |
| Tests | `tests/**` (Vitest), `e2e/**` (Playwright) | every slice (tester-owned) |

---

## 4. Slice 0 — Scaffolding (executable)

**Goal:** A bootable, containerized, lint/typecheck/test-green empty project with the full reviewed Prisma schema migrated, so Slice 1 can start against a stable skeleton.

**PRD criteria satisfied directly:** none functional; establishes **NFR-DEPLOY-001 / M-7** (documented Docker startup serves the login screen — the login screen itself lands in Slice 1, so Slice 0's exit check is "app + Postgres come up and the app serves an HTTP response"; the *login-screen* form of M-7 is re-verified at Slice 1 close).

**Owner role:** `implementor` (single agent — scaffolding is shared foundation, not parallelizable across dev roles). Tester adds the test-infra smoke check.

### 4.1 Prisma schema strategy decision

**Decision P-1: Create the FULL 13-entity schema from architecture §2.3 in ONE initial migration in Slice 0. Reject per-slice incremental migrations.**

- **Trace:** architecture §2.3 (architecture.md:148–291) gives the complete, doc-review-passed schema for all 13 persisted entities (`Operator, Session, Category, Bookmark, MessageCategory, Channel, Message, MailItem, LogEntry, AlertCategory, Alert, WebhookToken, IdempotencyKey`). ADR-004 (architecture.md:580) fixes that Domains/DnsRecord/Server are NOT persisted (provider DTOs), so 13 is the final persisted count — the schema will not grow slice-by-slice.
- **Alternatives considered:**
  - *(A) One migration, full schema (SELECTED).* Pros: schema is already fully specified and reviewed; a single source-of-truth migration eliminates cross-slice migration-merge conflicts and schema drift when later slices are built in separate iterations; unused tables have zero runtime cost. Cons: tables exist before their UI does (harmless — inert rows).
  - *(B) Per-slice incremental migrations.* Pros: migration diff mirrors the slice that needs it. Cons: high drift risk (each later slice must author a correct additive migration against a moving baseline; parallel iterations can produce conflicting migration histories), and it buys nothing because the schema is already frozen by §2.3. Rejected.
- **Consequence / residual risk:** see R-1 (§12) — a frozen full schema means any later-slice field change is a real migration; mitigated because §2.3 is doc-review-PASS (progress.md line 23) and indexes are already specified for pagination (NFR-PERF-001).

### 4.2 Scaffolding checklist (all owned by `implementor`; disjoint from tester's `tests/`)

1. **App skeleton:** `create-next-app` — Next.js 15 App Router, TypeScript `strict`, ESLint, Tailwind, `src/` dir, import alias `@/*`. (architecture §7.0)
2. **Tailwind config:** wire Tailwind; seed the dark-theme design tokens from design §2.2/§2.3 into `tailwind.config.ts` + `src/app/globals.css` as CSS variables (dark palette only — design §2.3; light theme deferred per progress.md line 44). No theme toggle.
3. **shadcn/ui init:** `shadcn` init; install the Slice-1 primitives named in design §Stack vocabulary that Slice 1 uses: `sidebar, sheet, card, dialog, alert-dialog, dropdown-menu, button, input, textarea, select, badge, skeleton, sonner (toast), alert, label`. shadcn init also brings the shared runtime deps `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `sonner`. Later-slice-only primitives (`table, popover, tabs, pagination`) are deferred to their slices to keep Slice 0 lean. Files land in `src/components/ui/**` (owned here; frozen primitives — dev roles consume, don't edit).
4. **Prisma init + full schema (Decision P-1):** `prisma init`; author `prisma/schema.prisma` verbatim from architecture §2.3 (all 13 models, all indexes, cascade/SetNull per ADR-013); generate the **single initial migration**; `prisma/migrations/**`. Provider = PostgreSQL.
5. **Prisma client singleton:** `src/lib/db.ts` (architecture §6, ADR-012 — the only Prisma import locus besides the auth DAL).
6. **Base env contract:** `src/lib/config/env.ts` — parse + fail-fast for infra vars present at Slice 0: `DATABASE_URL`, `LIST_PAGE_SIZE` (default 50, NFR-PERF-001), `WEBHOOK_RATE_LIMIT` (default 120), `WEBHOOK_RATE_WINDOW_MS`, `WEBHOOK_MAX_BODY_BYTES` (default 64KB). **Auth vars (`OPERATOR_USERNAME`, `OPERATOR_PASSWORD_HASH` / `OPERATOR_PASSWORD`) are added in Slice 1** (§5, backend-dev) — Slice 0 leaves the auth branch as a documented TODO so the two slices touch `env.ts` sequentially, never in parallel.
7. **`.env.example`:** every env key with a comment and a safe placeholder; documents the `OPERATOR_PASSWORD_HASH`-preferred / `OPERATOR_PASSWORD`-convenience contract (architecture §5.2, AQ-1 resolved) and the provider keys (`CLOUDFLARE_API_TOKEN, HETZNER_DNS_TOKEN, GODADDY_API_KEY, GODADDY_API_SECRET, HCLOUD_TOKEN`) as commented-out (mock mode by default, AC-PROV-001/002).
8. **Directory skeleton:** create the empty layer dirs from architecture §6 (`src/lib/{auth,services,providers,webhooks,validation}`, `src/components/{shell,bookmarks}`, `src/app/(dashboard)`, `src/app/api`) so later agents have a fixed target tree.
9. **Root layout:** `src/app/layout.tsx` (html/body/providers, Geist + Geist Mono via `next/font`, dark class on `<html>` — design §2.1), `src/app/globals.css`. **This file mounts the single app-wide `<Toaster/>` (sonner) instance** (design §4.4) — owned by `implementor` in Slice 0; frontend-dev in later slices calls `toast(...)` but never re-mounts or edits the root layout (CH-PLAN-005b).
10. **Docker (NFR-DEPLOY-001):** `Dockerfile` (multi-stage: deps → build → runtime; `prisma migrate deploy` on start), `docker-compose.yml` (app + `postgres:16` service, healthcheck, volume). scrypt hashing uses Node built-in `crypto` — no native build dep in the image (architecture §5.2 / ADR-002).
11. **Slice-1 runtime + test dependencies (install here so no later role mutates Slice-0-owned `package.json` — CH-PLAN-005a; doc-review Finding 2):** add the runtime dep `zod` (validation for auth + bookmarks + all later webhook/dns schemas, ADR-011). **Also install all test-framework devDependencies here (implementor-owned `package.json`):** `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `@playwright/test`, `@axe-core/playwright`, and `@vitest/coverage-v8` (only if coverage reporting is enabled). The **tester** authors configs + tests (item 13) but does **not** edit `package.json` — this closes the ownership gap so the exit gate's `npm run test` has its deps present. No other runtime dep is required by Slice 1: password hashing (`scrypt`) is Node built-in `crypto`; toasts/icons/variants (`sonner`, `lucide-react`, `class-variance-authority`, `clsx`, `tailwind-merge`) arrive with shadcn init (item 3); `@prisma/client`, `next`, `react` come from items 1/4. `package.json` is an implementor-owned Slice-0 artifact; dev/test roles in Slices 1–7 do not add deps without a coordinator-gated plan update.
12. **Scripts:** `package.json` scripts — `dev, build, start, lint, typecheck (tsc --noEmit), test (vitest run), test:e2e (playwright), db:migrate, db:seed`.
13. **Test infrastructure (tester-owned, `tests/**` + `e2e/**` + config files only):** `vitest.config.ts`, `playwright.config.ts` (projects for 375px + 1440px viewports), a Vitest DB test-harness strategy (per-suite transactional rollback or a disposable test schema), and a single smoke test asserting the app boots and `db.ts` connects. **The tester does not touch `package.json`** — the test-framework devDependencies are installed by the implementor in item 11 (doc-review Finding 2).

**Slice 0 exit gate (all must pass on the empty project):**
- `npm run lint` clean, `npm run typecheck` clean, `npm run test` green (smoke test), `npx prisma migrate deploy` applies the full schema, and `docker compose up` brings up app + Postgres and serves an HTTP response (M-7 infra half). **Fresh command output required in the implementor's report** (per report rules).

---

## 5. Slice 1 — Tracer bullet: Shell + minimal env-auth + Bookmarks (executable)

**Goal:** An authenticated operator logs in with env-seeded credentials, sees a persistent shell listing all seven sections, and performs full category/bookmark CRUD on the Bookmarks section — all persisted, all without full page reloads, proven end-to-end.

**PRD criteria (23 active AC-IDs):** AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014. Success metrics M-1, M-2, M-3, M-7 (login-screen form), M-8.

**Dependencies:** Slice 0 complete (schema migrated, shadcn primitives present, env base). **Zero provider and zero webhook dependency** (architecture §7.1, PRD §7 Alternative B).

**Workflow (per progress.md tasks 13–17, revised for CH-PLAN-002):**
- **Phase 0 — contract stubs (backend-dev, before fan-out):** commit typed stub signatures so the whole tree typechecks and Mode-A tests fail on assertions, not `module-not-found` — see §5.1.
- **Phase 1 — tester Mode A** (failing acceptance tests) runs in parallel with Phase 0 (tester writes against the frozen §5.1 contracts, not against implementations).
- **Phase 2 — backend-dev ∥ frontend-dev** (parallel, disjoint files, coding against the §5.1 shared contracts; frontend now compiles because Phase 0 stubs exist).
- **Phase 3 — tester Mode B** (green + `docs/test-plan.md`).
- **Phase 4 — code-reviewer.**

### 5.1 Shared integration contracts (frozen before parallel work — prevents merge collision)

Both dev roles code against these so they never edit the same file.

**Compile-time coupling note (CH-PLAN-002):** frontend server components **hard-import** backend modules — `(dashboard)/layout.tsx` imports `requireOperator()` from `src/lib/auth/dal.ts`; `bookmarks/page.tsx` imports `list()` from `src/lib/services/bookmarks.ts`. These are TypeScript compile-time dependencies, not runtime-only. Therefore backend-dev's **Phase 0** must land typed **stub** versions of `dal.ts` (`requireOperator(): Promise<Operator>`) and `services/bookmarks.ts` (`list()`, `createCategory()`, …) — signatures returning typed placeholder values that typecheck — **before** frontend-dev starts, so the frontend zone compiles and the Mode-A suite fails only on assertions (not on `module-not-found`, i.e. not "red for the wrong reason"). Backend-dev then replaces the stub bodies with real implementations in §5.3 steps without changing the signatures. This stub-first rule generalizes to any later slice where a server component imports a not-yet-built service (noted per slice in §6).

- **Auth session (backend):** cookie name `session`, httpOnly + Secure + SameSite=Lax, value = opaque `Session.id` (architecture §5.2). Login is a **Server Action** `login(formData)` in `src/app/login/actions.ts` returning `{ ok: true } | { ok: false, error: string }` (AC-AUTH-002/003). Logout is a Server Action `logout()` (AC-AUTH-004). Guard = `requireOperator()` in `src/lib/auth/dal.ts` returning the operator or `redirect('/login?next=...')` (architecture §5.3).
- **Bookmarks API (backend, Route Handlers, architecture §6 tree / §10 data flow):**
  - `POST /api/categories` `{name}` → 201 `{id,name}`; `PATCH /api/categories/[id]` `{name}`; `DELETE /api/categories/[id]` (cascade, AC-BM-004).
  - `POST /api/bookmarks` `{name,url,icon?,description?,categoryId}` → 201; `PATCH /api/bookmarks/[id]`; `DELETE /api/bookmarks/[id]`.
  - Validation errors return HTTP 400 with a machine-readable body (zod issues) so the frontend can render inline field errors (AC-BM-005/007/008). All handlers call `requireOperator()` first (NFR-SEC-001) and the `services/bookmarks` layer only (ADR-012).
  - **Reads:** the Bookmarks server component reads via `services/bookmarks.list()` (grouped categories+bookmarks), not the API — mutations use the API/actions, then `revalidatePath('/bookmarks')` (architecture §10).
- **DTO shapes:** `Category {id,name,position}`, `Bookmark {id,name,url,icon,description,categoryId,position}` (from Prisma models, architecture §2.3). Frontend consumes these as props from the server component.

### 5.2 Tester — Mode A (owns `tests/**`, `e2e/**`) — write FIRST, must be red

| Task | AC-IDs → tests |
|---|---|
| Auth acceptance (Playwright + Vitest) | AC-AUTH-001 (unauth redirect, every dashboard route), AC-AUTH-002 (valid env creds → dashboard), AC-AUTH-003 (invalid → error, no session), AC-AUTH-004 (logout invalidates), AC-AUTH-005 (env-seed bootstrap + fail-fast when auth env absent, N-8b), M-3 route-coverage |
| Shell acceptance (Playwright) | AC-SHELL-001 (nav lists all 7), AC-SHELL-002 (client-side nav, no full reload), AC-SHELL-003 (placeholder for 6 non-Bookmarks sections), AC-SHELL-004 (375px + 1440px, no horizontal overflow) |
| Bookmarks acceptance (Vitest service/API + Playwright UI) | AC-BM-001..014 incl. validation rejections AC-BM-005/007/008 (M-2), cascade AC-BM-004, icon fallback AC-BM-011, empty state AC-BM-014, open-in-new-tab AC-BM-013 |
| A11y (Playwright + axe) | NFR-A11Y-001 / M-8 — zero critical violations on Login, Shell, Bookmarks |

Deliver: red suite + `docs/test-plan.md` seeded with one row per AC-ID (status `RED`).

### 5.3 Backend-dev — scope zone (disjoint; no file below is touched by frontend-dev)

**Step 0 — contract stubs (FIRST, before the frontend fan-out — CH-PLAN-002):** commit typed stub signatures of `src/lib/auth/dal.ts` (`requireOperator()`) and `src/lib/services/bookmarks.ts` (`list`, `createCategory`, `renameCategory`, `deleteCategory`, `createBookmark`, `updateBookmark`, `deleteBookmark`) that typecheck (return typed placeholder values). This unblocks the frontend zone's compilation. Steps 1–9 replace the stub bodies with real logic without changing signatures.

Ordered so the auth foundation exists before integration; internally sequential, externally parallel to frontend.

1. **Auth env extension:** add `OPERATOR_USERNAME` + exactly-one-of `OPERATOR_PASSWORD_HASH`/`OPERATOR_PASSWORD` parsing + fail-fast to `src/lib/config/env.ts` (architecture §5.2, AC-AUTH-005, N-8b). → *AC-AUTH-005*
2. **Password + session primitives:** `src/lib/auth/password.ts` (scrypt hash/verify, `salt:hash`), `src/lib/auth/session.ts` (create/read/delete `Session`, random 32-byte id, `expiresAt`). → *AC-AUTH-002/004*
3. **Seed / bootstrap:** `prisma/seed.ts` + idempotent boot check — provision exactly one `Operator` from env if none exists, store resolved scrypt hash; re-seed no-op. → *AC-AUTH-005*
4. **Auth DAL:** `src/lib/auth/dal.ts` — `requireOperator()` validates session id against DB (exists + not expired), the sole sanctioned Prisma caller outside services (ADR-012). → *AC-AUTH-001*
5. **Middleware:** `src/middleware.ts` — optimistic cookie-presence redirect to `/login`; matcher excludes `/login`, `/api/webhooks/:path*`, static assets (architecture §5.3, NFR-SEC-001). → *AC-AUTH-001*
6. **Login/logout actions:** `src/app/login/actions.ts` — `login`/`logout` Server Actions (contract §5.1). → *AC-AUTH-002/003/004*
7. **Bookmarks validation:** `src/lib/validation/bookmarks.ts` — zod schemas: category name required/trimmed (AC-BM-005); bookmark name+url required (AC-BM-007), url must be `http(s)` (AC-BM-008). → *AC-BM-005/007/008*
8. **Bookmarks service:** `src/lib/services/bookmarks.ts` — real bodies for `list()` (grouped), `createCategory/renameCategory/deleteCategory` (cascade AC-BM-004), `createBookmark/updateBookmark/deleteBookmark`. → *AC-BM-001..004, 006, 009, 010*
9. **Bookmarks API routes:** `src/app/api/categories/route.ts` + `[id]/route.ts`, `src/app/api/bookmarks/route.ts` + `[id]/route.ts` (contract §5.1, `requireOperator()` + service + zod). → *AC-BM-001..010*

### 5.4 Frontend-dev — scope zone (disjoint; consumes backend modules as imports only — compiles against Phase 0 stubs)

1. **Login page:** `src/app/login/page.tsx` — centered card, username/password inputs, generic error banner, empty-field submit-disable (design §3.1). Calls the `login` action. → *AC-AUTH-002/003 UI*
2. **Root redirect:** `src/app/page.tsx` — redirect `/` → `/bookmarks` (design §0 landing decision).
3. **Dashboard shell layout:** `src/app/(dashboard)/layout.tsx` — calls `requireOperator()`; renders `src/components/shell/**` (sidebar nav to all 7 sections + Settings, active-item indication, user menu with logout, mobile `Sheet` at <1024px). → *AC-SHELL-001/002/004, AC-AUTH-004 UI*
4. **Placeholder template:** `src/components/shell/section-placeholder.tsx` + the six section pages `src/app/(dashboard)/{domains,servers,mail,messages,logs,alerts}/page.tsx` **and** `src/app/(dashboard)/settings/page.tsx` rendering the reusable "coming soon" template with per-section copy (design §3.2.4; Settings copy = "Webhook token management will be available in a future release.", design.md:377). The Settings placeholder is required because the shell nav (item 3) links to Settings — omitting it would 404 the Settings link, contradicting design §3.2.4 (design.md:348). → *AC-SHELL-003 (six PRD sections); Settings = smoke, see tester note*
   - **Tester note (C-2-style):** AC-SHELL-003 is a PRD acceptance criterion scoped to the **seven PRD sections** only (Bookmarks is live; Domains/Servers/Mail/Messages/Logs/Alerts show placeholders). The **Settings** placeholder is additive UI (host for FR-WH-002, C-1/C-4) — the tester verifies it renders (HTTP 200, not 404) as a **smoke check**, not as an AC-SHELL-003 assertion, so the AC's section count stays exactly seven.
5. **Bookmarks UI:** `src/app/(dashboard)/bookmarks/page.tsx` (server component reads `services/bookmarks.list()`) + `src/components/bookmarks/**`: grouped grid + cards (icon + deterministic initials fallback AC-BM-011, open-in-new-tab AC-BM-013), category create/rename dialog + delete-with-cascade-warning AlertDialog, bookmark create/edit dialog + delete confirm, empty state, skeletons. Client components call the API routes then rely on `revalidatePath`. → *AC-BM-001..014 UI*

**Parallelism note:** with Phase 0 stubs in place, frontend can build all UI against the frozen §5.1 contracts while backend implements the real bodies; the integration point is the shared contract, not shared files. The only true ordering dependencies are Phase 0 (stubs) before frontend fan-out, and both sides merged before the Mode-B green run.

### 5.5 Slice 1 exit gate (tracer-bullet gate)

All Slice-1 acceptance tests green end-to-end in a real browser against a real Postgres: M-1 (100% of AC-SHELL/AUTH/BM pass), M-2 (CRUD persists across reload + validation rejects), M-3 (zero dashboard routes reachable unauth; operator env-bootstrapped; webhook path is the only session-exempt route — the exemption is testable now even though the webhook handler lands in Slice 4, via the middleware matcher — see C-2), M-7 (documented `docker compose up` serves the **login screen**), M-8 (axe zero critical on Login/Shell/Bookmarks). Tester fills `docs/test-plan.md` to all-`PASS` for the 23 IDs; code-reviewer signs off on ADR-012 layer boundaries and NFR-SEC-001/002.

---

## 6. Slices 2–7 (structural — goal, AC coverage, ordering, coarse subtasks)

Order and rationale per architecture §7.2 (independent provider track 2–3 and ingest track 4–7; ingest complexity rises Logs→Alerts→Mail→Messages so the shared webhook backbone is proven on the simplest payload first). PRD does not fix later-slice order; this plan adopts the architecture recommendation. Every slice uses the same tester-Mode-A → dev(s) → tester-Mode-B → code-reviewer workflow (with the Phase-0 stub rule of §5.1 wherever a server component imports a not-yet-built service) and the same tracer-bullet exit gate (slice AC-IDs green end-to-end). Scope zones below are disjoint per role.

### Slice 2 — Provider foundation + Domains
- **Goal:** With no real credentials, the operator opens Domains and sees mock domains per provider and can view/create/edit/delete DNS records through the (mock or real) provider, with per-provider error isolation.
- **AC-IDs:** AC-PROV-001..003, AC-DOM-001..009 (12). Metrics: M-5. *Distributed note (CH-PLAN-003): AC-PROV-001 and AC-PROV-003 are verified here on the **Domains** facet ("Domains, Servers" in prd.md:283) and finalized on the **Servers** facet in Slice 3 — see §10.1 distributed-AC list.*
- **Coarse subtasks / scope zones:**
  - backend-dev: `src/lib/providers/result.ts` (`ProviderResult<T>`, ADR-008), `src/lib/providers/dns/**` (factory `index.ts`, `cloudflare.ts`, `hetzner.ts`, `godaddy.ts`, `mock.ts`, `types.ts` — real-vs-mock by env, AC-PROV-002), `src/lib/services/domains.ts` (allSettled aggregation, per-provider error isolation AC-DOM-003/N-1), `src/lib/validation/dns.ts` (type-specific record validation AC-DOM-008), DNS mutation routes.
  - frontend-dev: `src/app/(dashboard)/domains/**` (domain list Table, DNS drill-in table, record create/edit Dialog, delete AlertDialog, per-provider error banners) per design §6.1. Adds shadcn `table`/`popover` primitives.
  - tester: `tests/**` + `e2e/**` for AC-PROV/AC-DOM, mock determinism (N-13).
- **Dependencies:** Slice 1 (shell + auth). Establishes the `ProviderResult` + factory pattern reused by Slice 3.
- **Contingency trigger:** OQ-3/A-7 (Servers) does not affect Domains; no real-credential dependency (mock mode is the default and is fully testable, AC-PROV-001; see CB-2).

### Slice 3 — Servers
- **Goal:** Operator sees Hetzner VPS inventory + status and can start/stop/restart with confirmation, status converging to target within the D-9 bound (deterministic in mock mode).
- **AC-IDs:** AC-SRV-001..008 (8). *Finalizes the Servers facet of AC-PROV-001/003 (distributed — §10.1).*
- **Coarse subtasks / scope zones:**
  - backend-dev: `src/lib/providers/servers/**` (`index.ts` factory, `hetzner.ts`, `mock.ts` with deterministic status transition per architecture §4.3, `types.ts`), power route + status poll (D-9: provider 2xx AND polled status == target within 30/30/60s).
  - frontend-dev: `src/app/(dashboard)/servers/**` — server cards, status badges (design §2.6), power actions through the confirm pattern (AC-SRV-007, design §4.3), transitioning/polling UI.
  - tester: AC-SRV suite incl. mock-deterministic transitions (AC-SRV-004..006), error state (AC-SRV-003), reject-reverts-state (AC-SRV-008/N-2).
- **Dependencies:** Slice 2 (reuses `ProviderResult` + factory machinery).

### Slice 4 — Webhook backbone + Logs + Token management (Settings)
- **Goal:** External systems POST authenticated log payloads to the unified ingest API and the entry appears in the Logs section; the operator provisions/revokes webhook tokens in Settings. This slice builds the reusable ingest core (auth, rate limit, idempotency, size/parse limits, error format).
- **AC-IDs:** AC-WH-001..011 (11), AC-LOG-001..005 (5). Metrics: M-4, M-6. **This is the shared backbone consumers in Slices 5–7 depend on.**
- **Distributed-AC note (CH-PLAN-003):** AC-WH-003 ("supported type → 201") and AC-WH-007 ("ingested entry visible in section") are **verified incrementally**. Slice 4 builds the pipeline and registers the **`log`** type only; the `log` facet of AC-WH-003/007 is fully green at this gate (M-4/M-6). The `alert`/`mail`/`message` facets are registered and made viewable in Slices 5/6/7 respectively; their AC-WH-003/007 facets close at those gates. Interim behavior for a supported-but-not-yet-registered type is fixed as **C-3** (§9). This keeps DoD §10.1 satisfiable per slice — the slice gate requires green only for the facets that slice delivers.
- **Coarse subtasks / scope zones:**
  - backend-dev: `src/lib/webhooks/**` (`pipeline.ts` ordered size→parse→auth→ratelimit→type→zod→idempotency per architecture §3.2, `ratelimit.ts` in-process fixed-window ADR-006, `idempotency.ts` transactional `@@unique(tokenId,key)` ADR-007, `dispatch.ts` — **type→service registry, `log` entry only in this slice; see §6 serialization lead below**), `src/lib/validation/webhooks.ts` (**`log` zod schema only** in this slice, §3.8), `src/app/api/webhooks/[type]/route.ts`, `src/lib/services/logs.ts`, `src/lib/services/webhookTokens.ts`, `src/app/api/webhook-tokens/**` (generate-once secret AC-WH-008, revoke AC-WH-009, NFR-SEC-002).
  - frontend-dev: `src/app/(dashboard)/logs/**` (dense table, level/source/text filters, keyset pagination, design §6.5) + `src/app/(dashboard)/settings/**` + `src/components/settings/**` (token list, create dialog + one-time secret reveal, revoke, design §6.7; paths from design — see C-4). Replaces the Slice-1 Settings placeholder (§5.4) with the real token-management screen. Adds shadcn `pagination`.
  - tester: full webhook matrix — 401/400/201/429/413 status assertions (AC-WH-001/002/003(log)/005/006/010/011), idempotency 201-then-200 with key + duplicate-without-key (AC-WH-004/010, N-5/N-5b), pagination bound (M-6), Logs view end-to-end (AC-WH-007(log), AC-LOG-005), plus the C-3 interim `400 UNSUPPORTED_TYPE` assertion for the not-yet-registered `alert`/`mail`/`message` types.
- **Dependencies:** Slice 1 (auth/shell). Independent of Slices 2–3. **Precedes Slices 5–7** (they consume this backbone) — satisfies the "webhook ingest before Mail/Messages/Logs/Alerts" constraint.
- **Contingency trigger:** OQ-4/A-1 (Logs "manage" scope) — MVP = view/organize/delete (D-4, provisional). See CB-1 (§8). AQ-2/OQ-7 (token count in the Settings UI) must be answered before this slice — see U-9 (§7.2).

### Slices 5/6/7 — shared-file serialization (Z-1 compliance, CH-PLAN-001)

Each of Slices 5, 6, 7 must **register its ingest type** by editing two shared backbone files created in Slice 4: `src/lib/validation/webhooks.ts` (add the type's zod schema) and `src/lib/webhooks/dispatch.ts` (add the type→service map entry). These two files are therefore **NOT** parallelizable across Slices 5/6/7 — a concurrent merge would drop a type registration and fail AC-ALR-007 / AC-MAIL-006 / AC-MSG-005.

**Resolution (Decision O-2):** the type-registration subtask (the edits to `webhooks.ts` + `dispatch.ts`, plus the ingest-`create` in the slice's own service file) is **serialized** in the fixed order **Slice 5 → Slice 6 → Slice 7** (one at a time, coordinator-ordered). Everything else in each slice — the section's **read/list/filter/pagination** service functions (each in its own disjoint `services/{alerts,mail,messages}.ts`), the section UI, and the tests — remains **disjoint and parallelizable** across the three slices. This retracts v1.0's "5/6/7 may run in parallel" claim for those two files only.

*Alternative considered and rejected:* splitting `webhooks.ts` into per-type files under a `webhook-types/` dir with `webhooks.ts` as a thin registry. Rejected because (a) architecture §3.8 names `src/lib/validation/webhooks.ts` as the single schema locus — a restructure would diverge from the blueprint (avoided per the "don't alter architecture decisions" constraint) — and (b) even with per-type files, the one-line registry addition remains a shared-file edit, so serialization is still required for the registry. Serialization is the minimal, architecture-compatible fix.

### Slice 5 — Alerts
- **Goal:** Operator manages alert categories and views/filters/sorts alerts (paginated); external systems ingest alerts via the `alert` webhook type.
- **AC-IDs:** AC-ALR-001..007 (7). *Closes the `alert` facet of AC-WH-003/007.*
- **Coarse subtasks / scope zones:** backend-dev — **[serialized]** register the `alert` type in `validation/webhooks.ts` + `dispatch.ts` (architecture's **assumed** upsert-by-name category resolution — **AQ-3, confirm before Slice 5**, §7.2 U-10; architecture §3.8/§9); **[disjoint]** `src/lib/services/alerts.ts` (read/list/filter + `AlertCategory` CRUD, SetNull reassignment AC-ALR-002/D-12/ADR-013), category CRUD routes. frontend-dev — `src/app/(dashboard)/alerts/**` (dense table, category/severity/text filters, category management dialogs, design §6.6). tester — AC-ALR suite + `alert` ingest (AC-ALR-007).
- **Dependencies:** Slice 4 (ingest core); serialized before Slices 6/7 on the shared webhook files. Triggers CB-1 (OQ-4) and U-10 (AQ-3).

### Slice 6 — Mail
- **Goal:** Operator views a paginated mail list, opens full mail detail, filters/sorts; external systems ingest via the `mail` webhook type.
- **AC-IDs:** AC-MAIL-001..006 (6). *Closes the `mail` facet of AC-WH-003/007.*
- **Coarse subtasks / scope zones:** backend-dev — **[serialized, after Slice 5]** register the `mail` type in `validation/webhooks.ts` + `dispatch.ts`; **[disjoint]** `src/lib/services/mail.ts` (keyset pagination on `(receivedAt,id)`, sender/subject filters per NFR-PERF-002/D-11 text-filter fallback). frontend-dev — `src/app/(dashboard)/mail/**` (list + master-detail/route detail, filter bar, design §6.3). tester — AC-MAIL suite + `mail` ingest (AC-MAIL-006).
- **Dependencies:** Slice 4; serialized after Slice 5 on the shared webhook files. Triggers CB-1 (OQ-1: mail is read-only for MVP, D-4/D-5).

### Slice 7 — Messages
- **Goal:** Operator manages Discord-style categories→channels and views a channel's messages in chronological, server-paginated order; external systems post messages to an existing channel via the `message` webhook type (4xx on missing channel).
- **AC-IDs:** AC-MSG-001..007 (7 active). *Closes the `message` facet of AC-WH-003/007 → AC-WH-003/007 become fully green here.* **AC-MSG-008 is inactive (gated on OQ-6) — explicitly NOT implemented (architecture §3.8, design §6.4).**
- **Coarse subtasks / scope zones:** backend-dev — **[serialized, after Slice 6]** register the `message` type in `validation/webhooks.ts` + `dispatch.ts` (channel-must-exist → 400 `CHANNEL_NOT_FOUND`, AC-MSG-006/D-10; no auto-create); **[disjoint]** `src/lib/services/messages.ts` (category/channel CRUD with cascade, keyset pagination per channel on `(channelId,createdAt,id)`). frontend-dev — `src/app/(dashboard)/messages/**` (left rail categories/channels, message feed, scroll-back pagination, design §6.4). tester — AC-MSG-001..007 + ingest accept/reject (AC-MSG-005/006).
- **Dependencies:** Slice 4; serialized after Slice 6 on the shared webhook files. Last because it exercises the deepest relations (architecture §7.2).

---

## 7. Execution Order, Dependencies & Uncertainty Register

### 7.1 Order (sequential vs parallel)

```
Slice 0 (implementor, solo)
   └─→ Slice 1:  Phase 0 stubs (backend-dev) ∥ tester Mode A
                    → (backend-dev ∥ frontend-dev)
                    → tester Mode B → code-review          [tracer bullet gate]
          ├─→ Provider track:  Slice 2 → Slice 3
          └─→ Ingest track:    Slice 4 → Slice 5 → Slice 6 → Slice 7
                                        (└ shared webhooks.ts/dispatch.ts type-registration is SERIALIZED 5→6→7;
                                           each slice's service-read/UI/test files are disjoint & parallelizable)
```

- **Slice 0 → Slice 1:** strictly sequential (schema + skeleton must exist).
- **Within Slice 1:** backend-dev Phase-0 stubs and tester Mode A run concurrently (both against the frozen §5.1 contracts, not implementations); Phase-0 stubs precede the frontend fan-out (CH-PLAN-002); backend-dev ∥ frontend-dev then run in parallel on disjoint file zones; tester Mode B is sequential-after both merge; code-review last. (Mode A is authored red before implementation, §5.2.)
- **After Slice 1:** the provider track (2→3) and ingest track (4→5→6→7) are mutually independent and MAY run in parallel iterations if agent capacity allows; **within** the ingest track, Slice 4 precedes 5/6/7 (they consume its backbone), and the shared-webhook-file registration of 5/6/7 is serialized (Decision O-2, §6). The disjoint service-read/UI/test portions of 5/6/7 may still parallelize.

### 7.2 Dependency & uncertainty register

| ID | Dependency / uncertainty | Owner | Evidence | Impact | Confidence | Resolution trigger |
|---|---|---|---|---|---|---|
| U-1 | Slice 0 full schema must be correct/complete before any slice | implementor | architecture §2.3 (doc-review PASS, progress.md:23) | High (all slices) | high | Slice 0 migrate deploy green |
| U-2 | §5.1 shared contracts + Phase-0 stubs must exist before backend∥frontend parallel start | planner→coordinator | architecture §10; CH-PLAN-002 | Medium (Slice 1 collision/compile) | high | Contracts §5.1 + stub step §5.3.0 |
| U-3 | Real provider APIs (Cloudflare/Hetzner/GoDaddy) credentials + capability differences | User/architect | HC-7, R-1(PRD), progress.md:48 | Medium (Slices 2/3 real mode) | low | Mock mode default+testable (AC-PROV-001); real keys deferred (CB-2) |
| U-4 | "Manage" = view/organize/delete for Mail/Logs/Alerts (D-4/D-5 provisional) | User | PRD OQ-1..OQ-4, A-1, R-2 | Medium (Slices 4/5/6 scope) | medium | Confirm OQ-1..OQ-4 before Slice 4 (CB-1) |
| U-5 | Webhook threshold defaults (rate/size/idempotency) need real calibration | architect | AQ-4 RESOLVED-configurable, R-4 | Low | high | Configurable env defaults accepted; post-launch tune |
| U-6 | Messages auto-create (AC-MSG-008) stays inactive | product | D-10, OQ-6, PRD:203 | Low (Slice 7) | high | Only reject-4xx path built; revisit only if OQ-6 resolves |
| U-7 | Text-search latency unbounded without pg_trgm (pagination-only fallback) | architect | D-11, ADR-009, R-6 | Low | high | Fallback accepted for MVP; upgrade path documented (architecture §2.4) |
| U-8 | Slice 1 auth secret strength (env-seeded operator) | User (operator) | D-7, R-3 | Medium (security) | medium | scrypt+session verified by AC-AUTH; operator owns env-secret strength (accepted) |
| U-9 | AQ-2 / OQ-7 — number of webhook tokens exposed in the Settings UI (one vs several; scoping) | architect/coordinator | architecture.md:598 (AQ-2 open), PRD OQ-7/A-4 | Low (Slice 4 token UI) | low | Decide before Slice 4 starts; MVP default = a small set of unscoped tokens (A-4) unless overridden |
| U-10 | AQ-3 — alert `category` on ingest resolved by upsert-by-name (assumed, not confirmed) | architect | architecture.md:599 (AQ-3 open, "assumes upsert-by-name") | Low (Slice 5 ingest) | low | Confirm before Slice 5 starts; MVP default = upsert-by-name per architecture §3.8 unless overridden |

---

## 8. Contingency Branches (high-impact uncertainty only)

**CB-1 — "Manage" scope expansion for Mail/Logs/Alerts (U-4).**
- **Trigger:** before starting Slice 4 (and re-checked before 5/6), the user answers OQ-1..OQ-4 requiring compose/send (Mail), log-source config, or alert ack/resolve/routing beyond view+organize+delete.
- **Fallback:** implement the MVP read+organize+delete interpretation (D-4/D-5) as planned; the expansion becomes a **new later slice** (e.g. Slice 8 "Mail compose", Slice 5b "Alert ack/resolve"), not an in-place scope inflation of the current slice.
- **Verification:** the added slice ships its own AC-IDs and tests; existing AC-IDs remain green.
- **Rejoin point:** after the affected base slice's gate; the expansion slice depends on it.

**CB-2 — Real provider credentials unavailable/incompatible at Slice 2/3 (U-3).**
- **Trigger:** at Slice 2/3, real Cloudflare/Hetzner/GoDaddy keys are absent, or a provider lacks an operation.
- **Fallback:** ship the slice fully in mock mode (AC-PROV-001, the default) — every AC-DOM/AC-SRV criterion is testable against deterministic mock data (M-5, N-13); unsupported ops return the `unsupported` ProviderResult (AC-PROV-003, ADR-008). Real-mode wiring is env-only and requires no code change (AC-PROV-002), so it is enabled later without re-opening the slice.
- **Verification:** M-5 green in mock mode; real-mode smoke deferred to whenever keys arrive.
- **Rejoin point:** none blocking — the slice completes on mock parity.

---

## 9. Conflicts (document-vs-document; recorded, not silently resolved)

No blocking conflicts found between PRD v2.1, architecture v1.1, and design v1.1 for Slice 0/Slice 1. Items surfaced and their disposition:

- **C-1 (naming, non-blocking):** design §Appendix lists a **Settings** nav entry (for webhook tokens, §6.7) that is not one of the seven PRD sections (HC-6). Disposition: **not a conflict** — architecture §6 tree and PRD FR-WH-002 both require operator token management UI; Settings is the host screen for AC-WH-008/009, additive to (not replacing) the seven sections. Shell nav lists the 7 sections (AC-SHELL-001) **plus** Settings. No action.
- **C-2 (timing, non-blocking):** M-3 asserts "the webhook API is the only token-gated unauthenticated exception", but the webhook handler ships in Slice 4, after Slice-1 M-3 verification. Disposition: Slice 1 verifies the exception at the **middleware-matcher** level (the `/api/webhooks/:path*` path is excluded from the session redirect, architecture §5.3) even though the handler returns 404 until Slice 4; full token-gated behavior (AC-WH-001) is verified in Slice 4. Recorded so the tester does not treat the Slice-1 404 as a regression.
- **C-3 (webhook interim type behavior, non-blocking — added for CH-PLAN-003; revised for CH-PLAN-006):** AC-WH-003/006 fix the supported type set as `{mail, message, log, alert}`, but the four consumers ship across Slices 4–7. Between Slice 4 and the slice that registers a given type, that type is **recognized but not yet enabled**. Disposition: a type present in the fixed supported-set but absent from the live `dispatch.ts` registry returns **HTTP 400 with the existing architecture §3.7 code `UNSUPPORTED_TYPE`** (architecture.md:365) — the plan does **not** introduce a new error code, honoring "no architecture decision altered" (§ header). The interim state is distinguished by build stage, not by a distinct code: an unregistered supported type behaves like an unsupported segment (400 `UNSUPPORTED_TYPE`) until its slice registers it, after which it returns 201 (AC-WH-003 per-type facet — see §10.1 distributed-AC list). This does not contradict AC-WH-006 (truly unsupported segments → 400) and is removed for each type as its slice registers it; by Slice 7 all four types return 201 and C-3 no longer applies. The tester asserts the interim `400 UNSUPPORTED_TYPE` for not-yet-registered types at each intermediate gate so it is never mistaken for a regression.
- **C-4 (Settings paths absent from architecture tree, non-blocking — added for doc-review Finding 3):** the Settings screen paths this plan uses in Slice 4 — `src/app/(dashboard)/settings/**` and `src/components/settings/**`, plus the Slice-1 `settings/page.tsx` placeholder (§5.4) — come from **design §6.7** (design.md:725–765) but are **not present in the architecture §6 project tree** (architecture.md:476–526), which stops at `webhook-tokens/route.ts` + `services/webhookTokens.ts` for FR-WH-002 and does not enumerate the Settings UI host. Disposition: this is a **known documentation divergence**, recorded for the **architect to reconcile in the next architecture.md revision** (add the `settings/**` UI paths to the §6 tree). The plan adopts the design-specified paths because design is the authoritative UI-structure source (design.md:8 "Consumed by: frontend-dev … tester") and FR-WH-002/AC-WH-008/009 mandate an operator-facing token UI that must live somewhere; the plan does **not** invent a novel location, it uses design's. No functional conflict — the two docs agree on the *what* (token management UI), only the architecture tree omits the *where*.

If adversarial review surfaces a further substantive conflict, it is recorded here with a disposition per the Adversarial Revision Contract — not patched into the source docs by the planner.

---

## 10. Definition of Done

### 10.1 Per-slice DoD (tracer-bullet gate)
A slice is DONE when **all** hold:
1. Every AC-ID **assigned to the slice** has ≥1 acceptance test authored in Mode A (tester-owned `tests/**`/`e2e/**`) and passing in Mode B. For **distributed AC-IDs** (listed below), the slice gate requires green only for the **facet that slice delivers**; the AC is not marked fully `PASS` in `docs/test-plan.md` until its final slice — earlier slices mark it `PARTIAL (facet: <name>)`. This makes the gate satisfiable per slice (CH-PLAN-003).
2. `docs/test-plan.md` traceability matrix shows every slice AC-ID (or facet) → test `file:case` → `PASS`/`PARTIAL` (tester-maintained; the authoritative traceability artifact).
3. `lint`, `typecheck`, `test`, and (where applicable) `test:e2e` are green on the merged branch — with fresh command output in the closing report.
4. Layer-boundary rules (ADR-012: only services + auth DAL call Prisma; providers never import `db.ts`; UI never imports service/provider internals) pass code-review.
5. Relevant NFRs verified: NFR-SEC-001/002 (auth/secret handling), NFR-PERF-001 pagination bound where the slice adds a list, NFR-A11Y-001 for UI slices.

**Distributed AC-IDs (verified incrementally across slices):**

| AC-ID | Facets and their slices | Fully `PASS` at |
|---|---|---|
| AC-PROV-001 | Domains facet (Slice 2), Servers facet (Slice 3) | Slice 3 |
| AC-PROV-003 | Domains facet (Slice 2), Servers facet (Slice 3) | Slice 3 |
| AC-WH-003 | `log` (Slice 4), `alert` (Slice 5), `mail` (Slice 6), `message` (Slice 7) | Slice 7 |
| AC-WH-007 | `log` (Slice 4), `alert` (Slice 5), `mail` (Slice 6), `message` (Slice 7) | Slice 7 |

All other AC-IDs are single-slice and reach full `PASS` at their own slice gate.

### 10.2 MVP DoD
The MVP is DONE when Slices 0–7 are each DONE and:
- **All 79 active AC-IDs** are `PASS` in `docs/test-plan.md` (distributed AC-IDs reach full `PASS` at the final slices noted above); **AC-MSG-008** is recorded `INACTIVE (OQ-6)`, not failed (PRD:203, U-6).
- Success metrics M-1..M-8 are all satisfied (PRD §11): M-1 Slice-1 completeness, M-2 Bookmarks CRUD, M-3 auth enforcement, M-4 webhook reliability, M-5 provider mock parity, M-6 pagination bound, M-7 Docker deployability, M-8 a11y baseline.
- The documented `docker compose up` brings up app + PostgreSQL and serves the login screen (NFR-DEPLOY-001 / M-7).
- No open blocking Conflict remains in §9; all provisional decisions (D-4/D-5) are either confirmed or their expansion split into explicit later slices (CB-1).

---

## 11. Alternatives & Trade-offs (decomposition)

- **Decomposition A — breadth-first (all 7 sections shallow):** rejected upstream by PRD §7 Alternative A (high integration risk, nothing verifiable end-to-end). This plan does not revisit it.
- **Decomposition B — tracer-bullet vertical slices (SELECTED):** matches PRD §7 Decision (Alternative B), HC-4, architecture §7. Slice 1 on Bookmarks (zero provider/webhook dependency) proves the full stack at lowest risk.
- **Sub-decision — later-slice ordering:** two candidates. *(i) Section-numeric order (Domains→Servers→Mail→Messages→Logs→Alerts→Webhook last)* — rejected: it would build webhook consumers (Mail/Messages/Logs/Alerts) before the ingest backbone they depend on, and defer the highest-shared-value backbone to the end. *(ii) Architecture §7.2 order (Provider track 2–3 ∥ Ingest track 4–7, backbone-first, complexity-ascending) (SELECTED)* — puts the webhook backbone (Slice 4) before its four consumers and proves it on the simplest payload (Logs), directly satisfying the "ingest before consumers" constraint. Evidence: architecture.md §7.2 (architecture.md:559–569).
- **Sub-decision — shared webhook-file concurrency (O-2, §6):** serialize the `webhooks.ts`/`dispatch.ts` type-registration of Slices 5/6/7 rather than parallelize; rejected the per-type-file restructure to avoid diverging from architecture §3.8's single-file schema locus.
- **Schema strategy:** Decision P-1 (§4.1) — full schema in one Slice-0 migration over per-slice incrementals, because §2.3 is frozen and reviewed; avoids migration-history drift across parallel iterations.

---

## 12. Decisions & Residual Risks (this plan's own)

| ID | Decision | Evidence |
|---|---|---|
| T-1 | Vitest+Testing Library (unit/integration) + Playwright (e2e acceptance) | architecture.md:522; §2 |
| P-1 | Full 13-entity schema in one Slice-0 migration | architecture §2.3; §4.1 |
| O-1 | Later-slice order = architecture §7.2 (backbone before consumers) | architecture.md:559–569; §11 |
| O-2 | Serialize Slices 5/6/7 shared-file (`webhooks.ts`/`dispatch.ts`) type-registration; disjoint service/UI/test files parallelize | §6 serialization lead; CH-PLAN-001 |
| S-1 | `tests/**`+`e2e/**` are tester-exclusive; dev roles never write tests; test devDependencies installed by implementor in Slice 0 | §2, §4.2 items 11/13; doc-review Finding 2 |
| Z-1 | Backend/frontend parallel only on disjoint file zones vs frozen §5.1 contracts; shared files are serialized (O-2) or stubbed-first (§5.1) | architecture §6.1, §10; §5.1; §6 |

| Risk | Mitigation / verification / acceptance |
|---|---|
| R-1 (this plan): frozen full schema means later field change = real migration | Accepted; §2.3 doc-review-PASS; indexes pre-specified for pagination; a later additive migration is low-risk on an inert table. |
| R-2: provisional D-4/D-5 could expand Mail/Logs/Alerts scope | CB-1 — split expansion into a new slice; MVP ships read+organize+delete. |
| R-3: env-seeded auth secret strength | Verified by AC-AUTH-001..005; operator owns env-secret strength (accepted, matches PRD R-3). |
| R-4: parallel backend/frontend drift if §5.1 contracts or stub signatures change mid-slice | Any contract/stub-signature change is a coordinator-level plan update before dev resumes, not an ad-hoc file edit. |
| R-5: a serialized 5→6→7 registration stalls if an earlier slice slips | Accepted; the disjoint read/UI/test work still proceeds in parallel, and the registration edit is a small, well-defined subtask (low stall cost). |
| R-6 (this plan): Settings UI paths (C-4) live only in design, not architecture §6 tree | Accepted; recorded as C-4 for architect reconciliation; no functional impact — both docs agree token-management UI is required (FR-WH-002). |

---

## Appendix A — AC-ID → Slice coverage (all 80 IDs)

| Slice | AC-IDs | Count |
|---|---|---|
| 1 | AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014 | 23 |
| 2 | AC-PROV-001..003, AC-DOM-001..009 | 12 |
| 3 | AC-SRV-001..008 | 8 |
| 4 | AC-WH-001..011, AC-LOG-001..005 | 16 |
| 5 | AC-ALR-001..007 | 7 |
| 6 | AC-MAIL-001..006 | 6 |
| 7 | AC-MSG-001..007 | 7 |
| — | **AC-MSG-008 — INACTIVE (gated on OQ-6), not planned** | 1 (inactive) |
| | **Total active** | **79** |

Every one of the 79 active AC-IDs (PRD Appendix B, progress.md:11–13) maps to exactly one **primary** slice. **Distributed-verification footnote (CH-PLAN-003):** AC-PROV-001 and AC-PROV-003 are exercised across Slices 2 (Domains) and 3 (Servers); AC-WH-003 and AC-WH-007 are exercised across Slices 4/5/6/7 (one webhook `type` per slice). Their primary-slice assignment above is where the mechanism is first built; full `PASS` timing is in the §10.1 distributed-AC list. AC-MSG-008 is the sole inactive ID and is intentionally UNVERIFIED per D-10/OQ-6.
