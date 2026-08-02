# Test Plan & Traceability Matrix — inspoter production remediation

**Version:** 1.9
**Status:** Messages management API coverage recorded; its two database-backed suites remain PENDING until the test database is migrated.
**Owner:** tester
**Date:** 2026-08-05
**Scope:** Slice 0/1 evidence + R2.0 revalidation + Q-13 workspace contract (§§2–7) + Q-14 mail client (§8) + channel webhooks/Messages (§9) + public OpenAPI/Swagger UI (§10) + VPS Metrics Agent (§11) + Q-15 Mail labels/filter rules (§12) + Dashboards (§13) + Discord webhook compatibility (§14) + agent-facing Messages management API (§15). This file does not turn discovery, collection, schema inspection, or authored tests into runtime PASS.
**Normative inputs:** `docs/prd.md` v3.17, `docs/architecture.md` v1.18, `docs/remediation-plan.md` v1.1, `docs/design.md` v2.13, `docs/plan.md` v1.7, `specs/mail-label-filtering-plan.md` v0.3, `docs/progress.md`

## Changelog

- **v1.9 — 2026-08-05:** added §15 for the agent-facing Messages management API (AC-MSG-015..021): the scope/contract/presentation units, the REST and MCP integration suites asserted separately so the two surfaces cannot drift, and the dated live run against a real server with a real token. Records honestly that both database-backed suites are authored but unexecuted — the test database was never started because the `test:db:*` guard blocked it — and names the exact commands and the migration they need first.
- **v1.8 — 2026-08-02:** added §14 for Discord webhook compatibility (AC-WH-012..015): the payload/snowflake/error/embed/delivery unit suites, the ingress pipeline suite over a real database, the egress format suite including Ed25519 verification and auto-disable, and the embed-card and published-contract checks. Records that the untouched pre-Discord webhook suites are themselves the backward-compatibility evidence, and that no browser-level spec covers the new route.
- **v1.7 — 2026-07-30:** added §13 for the Dashboards section (AC-DSH-001..018): grid-engine, weather-cache, calendar-bucketing and per-kind config unit suites, the ten widget render suites, DB-backed service/API suites including layout rejection and workspace isolation, and two Playwright specs (functional flow plus light/dark/phone visual acceptance). Records the full-suite result and the three pre-existing failures that are outside this section.
- **v1.6 — 2026-07-24:** opened Mail label definitions, automatic filter rules, and backfill controls to every authenticated active-workspace member; retained membership and workspace-isolation checks.
- **v1.5 — 2026-07-21:** reconciled public OpenAPI, VPS Metrics Agent, and implemented Q-15 behavior; retained the guarded Phase 5 migration/performance/backup/rollback/restart evidence and final regression/review gate. User verification remains required.
- **v1.4 — 2026-07-20:** added Q-15 Phase 2–5 service/API/component/Playwright, concurrency, isolation, accessibility, responsive, migration, rollback, recovery, and performance cases for AC-MAIL-031..045.
- **v1.3 — 2026-07-20:** added §10 for the checked-in two-operation OpenAPI contract, authenticated Swagger UI, secret controls, CI gates, and static-bundle verification.
- **v1.2 — 2026-07-18:** added §9 with source-grounded migration/service/API/pipeline/UI/E2E/deployment cases. All new statuses are PENDING/GAP until commands and retained evidence exist.
- **v1.1 — 2026-07-18:** added §8 (Q-14 mail client): AC-MAIL-007..030 traceability to unit suites (`mail-accounts`, `mail-sync`, `mail-actions`, `mail-attachments`, `mock-driver`, extended `mail`) and `e2e/mail-client.spec.ts`, plus the mock-driver test strategy. Added the versioned header block.
- **v1.0 (unversioned) — 2026-07-14:** pre-Q-14 content (§§1–7).

---

## 1. How to read this matrix

- **Status `PASS`** records either the dated 2026-07-12 Mode B evidence or unchanged unit-test evidence; it does not imply that the rewritten I3 E2E suite has run.
- **Status `STATIC` or `DISCOVERY`** proves only source/collection shape and never satisfies an AC or runtime gate.
- **Status `PARTIAL`** names the accepted facet evidence. AC-WS-008/010/011 stay PARTIAL through R2.7 and become PASS only at R2.8.
- **Status `PENDING_REVALIDATION`** means the current I3 E2E test is collected and statically verified but has not yet passed the dedicated-database runtime gate. Mode A and the 2026-07-12 Mode B results remain historical evidence only.

---

## 2. Slice 0 test-infra exit gate (plan.md §4.2 item 13)

| Item                                                                                      | File                   | Status   | Evidence                           |
| ----------------------------------------------------------------------------------------- | ---------------------- | -------- | ---------------------------------- |
| `vitest.config.ts` (react plugin, node env, `@/` alias, loads `.env` via `dotenv/config`) | `vitest.config.ts`     | DONE     | `npm run test` boots               |
| `playwright.config.ts` (375px + 1440px projects, webServer)                               | `playwright.config.ts` | DONE     | `npm run test:e2e` boots           |
| `tests/setup.ts` (jest-dom matchers)                                                      | `tests/setup.ts`       | DONE     | loaded via `setupFiles`            |
| Smoke test: app config loads + `db.ts` connects to real Postgres                          | `tests/smoke.test.ts`  | **PASS** | `npm run test` → included in 23/23 |

**Mode B update on `jsdom`:** the implementor has since added `jsdom` as a devDependency (per the coordinator's Mode B dispatch). `vitest.config.ts` still defaults to `environment: "node"` — Slice 1 has no component-level (Testing Library render) tests, only service/validation/config/auth suites against the real Prisma/pg driver, which don't need a DOM. Left as `environmentMatchGlobs`-ready (comment in the config) for whoever adds the first component test; not changed here since it isn't needed by anything in this suite (Simplicity First — no unused config).

**Mode B infra change — Playwright `webServer` now builds+starts instead of `next dev`:** during the first Mode B e2e run, `next dev --turbopack`'s on-demand per-route compilation caused real flakiness under Playwright's parallel workers (React controlled-input hydration not yet attached when `.fill()`/`.click()` landed on a cold route). Switched `playwright.config.ts`'s `webServer.command` to `npm run build && npm run start` — a prebuilt production server removes the on-demand-compile race deterministically. Confirmed via 3 consecutive full-suite runs after the switch (see §5).

---

## 3. Slice 1 traceability matrix (historical PASS; current I3 E2E PENDING_REVALIDATION)

### 3.0 Shell & Auth

| AC-ID                                                   | Test file : case                                                                                                                                                                                                                                                                         | Status               |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| AC-SHELL-001                                            | `e2e/shell.spec.ts` : "navigation lists all seven sections"                                                                                                                                                                                                                              | PENDING_REVALIDATION |
| AC-SHELL-002                                            | `e2e/shell.spec.ts` : "clicking a nav link routes client-side (no full page reload)"                                                                                                                                                                                                     | PENDING_REVALIDATION |
| AC-SHELL-003                                            | `e2e/shell.spec.ts` : 6 current implemented-route regressions (Домены/Серверы/Почта/Сообщения/Логи/Оповещения): status < 400, exact URL, active shell navigation. The former coming-soon assertions remain historical evidence only and apply only to the pre-implementation checkpoint. | PENDING_REVALIDATION |
| — (Settings smoke only — not an AC-SHELL-003 assertion) | `e2e/shell.spec.ts` : current implemented Settings route, exact URL and active shell navigation                                                                                                                                                                                          | PENDING_REVALIDATION |
| AC-SHELL-004                                            | `e2e/shell-responsive.spec.ts` : "shell renders with no horizontal overflow" (runs on `desktop-1440` and `mobile-375` projects)                                                                                                                                                          | PENDING_REVALIDATION |
| AC-AUTH-001 / M-3                                       | `e2e/auth.spec.ts` : 8 parametrized cases, one per dashboard route (`/bookmarks`, `/domains`, `/servers`, `/mail`, `/messages`, `/logs`, `/alerts`, `/settings`)                                                                                                                         | PENDING_REVALIDATION |
| AC-AUTH-002                                             | `e2e/auth.spec.ts` : "valid env-seeded credentials establish a session and reach the dashboard"                                                                                                                                                                                          | PENDING_REVALIDATION |
| AC-AUTH-002 (backend layer)                             | `tests/unit/auth/session-contract.test.ts` : "resolves with the Operator when the `session` cookie matches..."                                                                                                                                                                           | PASS                 |
| AC-AUTH-002 (backend layer)                             | `tests/unit/auth/login-action.test.ts` : "AC-AUTH-002: valid operator credentials establish a session"                                                                                                                                                                                   | PASS                 |
| AC-AUTH-003                                             | `e2e/auth.spec.ts` : "invalid credentials are rejected with a generic error and no session"                                                                                                                                                                                              | PENDING_REVALIDATION |
| AC-AUTH-003 (backend layer)                             | `tests/unit/auth/login-action.test.ts` : "AC-AUTH-003: invalid credentials are rejected..."                                                                                                                                                                                              | PASS                 |
| AC-AUTH-004                                             | `e2e/auth.spec.ts` : "logout invalidates the session and subsequent requests redirect to login"                                                                                                                                                                                          | PENDING_REVALIDATION |
| AC-AUTH-005                                             | `e2e/auth.spec.ts` : "operator env bootstrap — the seeded credentials authenticate on first boot"                                                                                                                                                                                        | PENDING_REVALIDATION |
| AC-AUTH-005                                             | `tests/unit/config/auth-env.test.ts` : 3 cases (fail-fast when absent; loads with `OPERATOR_PASSWORD_HASH`; `OPERATOR_PASSWORD_HASH` wins over `OPERATOR_PASSWORD` when both set)                                                                                                        | PASS                 |
| NFR-A11Y-001 / M-8                                      | `e2e/a11y.spec.ts` : "Login screen has zero critical accessibility violations"                                                                                                                                                                                                           | PENDING_REVALIDATION |
| NFR-A11Y-001 / M-8                                      | `e2e/a11y.spec.ts` : "Shell + Bookmarks screen has zero critical accessibility violations"                                                                                                                                                                                               | PENDING_REVALIDATION |

### 3.1 Bookmarks

| AC-ID     | Test file : case                                                                                                                                                                                                                                                                | Status                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| AC-BM-001 | `e2e/bookmarks.spec.ts` : "creating a category persists..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-001: creates a category..."                                                                                                                                      | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-002 | `e2e/bookmarks.spec.ts` : "renaming a category persists..." · `tests/unit/services/bookmarks.test.ts` : "persists the new name"                                                                                                                                                 | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-003 | `e2e/bookmarks.spec.ts` : "AC-BM-003/004: deleting a category with bookmarks warns, then cascades on confirm"                                                                                                                                                                   | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-004 | same case as AC-BM-003 (combined per plan.md §5.2 grouping) · `tests/unit/services/bookmarks.test.ts` : "removes the category and cascades delete..."                                                                                                                           | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-005 | `e2e/bookmarks.spec.ts` : "submitting an empty category name shows a validation error..." · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-005" describe (3 cases)                                                                                                          | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-006 | `e2e/bookmarks.spec.ts` : "creating a bookmark shows it in its category..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-006: creates a bookmark..."                                                                                                                      | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-007 | `e2e/bookmarks.spec.ts` : "bookmark create without name/url shows a validation error..." · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-007" describe (2 cases)                                                                                                           | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-008 | `e2e/bookmarks.spec.ts` : "an invalid (non-http/https) URL shows a validation error" · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-008" describe (3 cases)                                                                                                               | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-009 | `e2e/bookmarks.spec.ts` : "editing a bookmark persists name/url/category changes" · `tests/unit/services/bookmarks.test.ts` : "AC-BM-009: edits an existing bookmark's fields..."                                                                                               | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-010 | `e2e/bookmarks.spec.ts` : "deleting a bookmark removes it..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-010: deletes a bookmark"                                                                                                                                       | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-011 | `e2e/bookmarks.spec.ts` : "a bookmark without an icon shows a deterministic fallback..."                                                                                                                                                                                        | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-012 | `e2e/bookmarks.spec.ts` : "bookmarks are displayed grouped under their category" (incl. a negative cross-check that category A's bookmark does not leak into B's section) · `tests/unit/services/bookmarks.test.ts` : "AC-BM-012: list() groups bookmarks under their category" | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-013 | `e2e/bookmarks.spec.ts` : "activating a bookmark opens its URL in a new tab"                                                                                                                                                                                                    | E2E PENDING_REVALIDATION; unit history unchanged where listed |
| AC-BM-014 | `e2e/bookmarks.spec.ts` : "empty state prompts to create the first category (no error)"                                                                                                                                                                                         | E2E PENDING_REVALIDATION; unit history unchanged where listed |

**M-1 (Slice 1 completeness):** Historical 2026-07-12 evidence covered all 23 Slice 1 AC-IDs. Current rewritten E2E rows are `PENDING_REVALIDATION` until the dedicated-database runtime gate.
**M-2 (Bookmarks CRUD correctness, incl. validation rejections):** Existing unit coverage remains historically `PASS`; current CRUD and rejection E2E coverage is `PENDING_REVALIDATION`.
**M-3 (Auth enforcement):** The 8-route block passed historically; the rewritten current E2E block is `PENDING_REVALIDATION`.
**M-7 (Deployability, login-screen form):** Current production-server E2E verification is `PENDING_REVALIDATION`; the 2026-07-12 run remains historical evidence.
**M-8 (Accessibility baseline):** The 2026-07-12 axe run passed; both rewritten current E2E cases are `PENDING_REVALIDATION`.

---

### 3.2 Workspaces (Q-13 supersedes the historical Domains/Servers exception — coverage PARTIAL)

**Context:** The historical Slice WS implementation scoped database roots but left authorization, child ownership, migration repair, browser context, Domains/Servers, and provider mocks incomplete. Q-13 requires every visible/operable area to follow the active workspace; credentials alone remain deployment-scoped. The current Bookmarks unit row below is the only accepted workspace-specific test evidence.

| Item                                                                                                                                      | File                                    | Status     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| `tests/unit/services/bookmarks.test.ts` — all 7 pre-existing cases updated to pass `workspaceId` and assert workspace-scoped reads/writes | `tests/unit/services/bookmarks.test.ts` | PASS (7/7) |

| AC-ID     | Description (docs/prd.md §3.10)                                              | Test coverage                                                                       | Status                 |
| --------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------- |
| AC-WS-001 | Default workspace auto-created on first operator bootstrap/seed              | None                                                                                | **PENDING**            |
| AC-WS-002 | Workspace create (name required, unique slug, creator becomes owner)         | None                                                                                | **PENDING**            |
| AC-WS-003 | Workspace rename persists everywhere the name is displayed                   | None                                                                                | **PENDING**            |
| AC-WS-004 | Local content/bindings delete; upstream resources remain; session falls back | None                                                                                | **PENDING**            |
| AC-WS-005 | Owner adds an existing operator to the workspace by username                 | None                                                                                | **PENDING**            |
| AC-WS-006 | Owner invites a new username → new operator created + added as member        | None                                                                                | **PENDING**            |
| AC-WS-007 | Owner removes a member; access to that workspace revoked                     | None                                                                                | **PENDING**            |
| AC-WS-008 | Two members independently share every permitted section/resource             | Current code exists; no accepted Q-13 two-member runtime evidence                   | **PARTIAL until R2.8** |
| AC-WS-009 | Switching active workspace persists on `Session.activeWorkspaceId`           | None                                                                                | **PENDING**            |
| AC-WS-010 | Switch updates all sections without reload or stale repaint                  | Switcher implementation exists; no accepted all-section/stale-tab runtime           | **PARTIAL until R2.8** |
| AC-WS-011 | No read/write/cache/cursor/binding/provider operation crosses workspace      | Historical Bookmarks service unit only; Domains/Servers and other facets unverified | **PARTIAL until R2.8** |

**Not covered (residual gaps, tracked for a follow-up tester dispatch):**

- No API route tests for `src/app/api/workspaces/**` (create/rename/delete/members/switch) — every route in plan.md §5a's file list is currently unverified by an automated test.
- No e2e coverage of the workspace switcher UI (`workspace-switcher.tsx`) or the Settings workspace-management screen (`settings/workspace/page.tsx`).
- No PostgreSQL 16 proof for historical repair, Q-13 forward migration, fresh replay, strict optional pairs, compound FKs, sentinel cleanup, bindings, or manifest parity.
- No negative cross-workspace runtime test beyond the historical Bookmarks service unit; Domains/DNS, Servers, Mail, Messages, Logs, Alerts, Settings, tokens, caches, and cursors remain unverified.

### 3.3 Q-13 facet/status matrix

| Gate  | Required evidence                                                                                                                                     | Current status | AC-WS disposition                                                  |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------ |
| R2.1a | Role/session equality CHECK; duplicate AlertCategory disposition; manifest repair; forward/fresh PG16 migration; mock SQL parity                      | PENDING        | No AC final PASS                                                   |
| R2.1b | Admin authorization, last owner/membership, deterministic session fallback, trimmed/Cyrillic-safe atomic workspace creation, bounded slug retry       | PENDING        | AC-WS-001..007/009 by case only                                    |
| R2.1c | Header inventory/order/status on every session browser API                                                                                            | PENDING        | Foundation only                                                    |
| R2.1d | Keyed boundary, stale tab, private cache, versioned cursor envelope bound to workspace/filter/sort/version before query, Bookmarks compound ownership | PENDING        | Bookmarks facets only after runtime                                |
| R2.1e | Binding identity, mock isolation, claim, REAL-only transfer/MOCK zero-call rejection, remove/delete, lease core/optional reconciliation metadata      | PENDING        | Provider foundation only                                           |
| R2.2  | Webhook/Logs/tokens workspace facets                                                                                                                  | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.3  | Domains/DNS workspace/mock facet                                                                                                                      | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.4  | Servers workspace/mock facet                                                                                                                          | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.5  | Alerts workspace facet                                                                                                                                | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.6  | Mail workspace facet                                                                                                                                  | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.7  | Messages workspace facet                                                                                                                              | PENDING        | AC-WS-008/010/011 remain PARTIAL                                   |
| R2.8  | Two workspaces + two members across every section, Settings, and tokens                                                                               | PENDING        | Only this gate may set AC-WS-008/010/011 PASS and Workspaces 11/11 |

`R2.0-G` is a separate infrastructure/E2E revalidation gate and remains in progress; its result cannot satisfy any Q-13 row above.

---

## 4. Defects found while running Mode B (classification)

This section records the historical 2026-07-12 Mode B classification only. It does not claim that the rewritten I3 E2E suite is currently green; that suite remains `PENDING_REVALIDATION`.

### 4a. Test defects found and fixed (tester-owned files only)

1. **`tests/unit/auth/login-action.test.ts` fixture used a fake hash.** The AC-AUTH-002 fixture seeded `Operator.passwordHash` with the literal string `"scrypt-placeholder:Test1234!"` instead of a real `salt:hex` scrypt hash, so the real `verifyPassword()` correctly returned `false` and the assertion failed. **Fix:** seed via the real `hashPassword()` from `src/lib/auth/password.ts` (already the pattern this file's own header comment described as the goal). This is a fixture correctness fix, not an assertion change — the assertion (`{ ok: true }`) was never touched.
2. **Historical auth-helper race and current hardening.** The original `login()` returned before the Server Action completed; its historical `Promise.race` fix removed that race for the Slice 1 green runs. R2.0-I3 now separates `submitLoginForm()` (used by rejection tests) from successful `login()`, requires test-env credentials with no literal fallback, uses the current Russian accessible labels, and waits for the exact `/bookmarks` success URL.
3. **`e2e/bookmarks.spec.ts`'s `createBookmark()` helper used an unscoped `.first()` for the "Add bookmark" ghost button.** With more than one category section rendered (the common case once several tests in the file have run), `.first()` always clicked whichever category happened to be first in DOM order, not the category the test intended — bookmarks silently landed in the wrong category. This was masked in tests that didn't assert _which_ category a bookmark ended up in (AC-BM-006/007/008/011 passed anyway) but surfaced as real assertion failures in tests that do check grouping/counts (AC-BM-012's grouping check, AC-BM-003/004's "contains N bookmark(s)" cascade-warning count). **Fix:** added a `categorySection(page, name)` helper (`page.locator("section").filter({ has: <heading> })`) and scoped every "Add bookmark" click through it; added an explicit negative cross-check in AC-BM-012 (category A's bookmark must not appear under category B) to guard against this exact class of bug recurring silently.
4. **Same file, category-vs-bookmark "More options" button ambiguity.** Once a category has at least one bookmark, `categorySection(name).getByRole("button", { name: /more options/i })` matches two elements — the category's own overflow menu and the one bookmark card's overflow menu inside the same `<section>` — a Playwright strict-mode violation. **Fix:** `.first()` scoped _within_ the category section (not page-wide) reliably selects the category-level button, because `category-section.tsx` always renders the header row (and its button) before the bookmark grid in DOM order; documented inline in the test.
5. **`vitest.config.ts` needed `dotenv/config`.** Vitest, unlike Next.js, doesn't auto-load `.env`; without it `DATABASE_URL` etc. were `undefined` in the test process even though the file existed. Fixed once, during Mode A, and unaffected by Mode B (documented for completeness since it's load-bearing for every DB-touching test in this suite).

None of the above changed what any test asserts — every fix was either a fixture-correctness fix (item 1), a test-timing/synchronization fix (item 2), or a locator-scoping fix (items 3–4) that makes the test actually exercise the AC it claims to, rather than passing/failing for an unrelated reason.

### 4b. Implementation defects found

**Historical 2026-07-12 result: none outstanding.** No `src/**` defect was found during this Mode B pass — every red encountered traced to the test harness (§4a). This is recorded explicitly because "no implementation defects found" is itself a reportable finding, not a gap in the walkthrough (this tester independently read every relevant source file — `password.ts`, `session.ts`, `dal.ts`, `login/actions.ts`, `middleware.ts`, `seed.ts`, `services/bookmarks.ts`, `env.ts`, all of `components/shell/**` and `components/bookmarks/**` — before writing the Mode B fixes above, specifically to distinguish "the test is wrong" from "the app is wrong" per the coordinator's instruction not to paper over a real defect).

### 4c. Backend code-review fixes (post-Mode-B, verified against the full suite)

The backend-dev role landed five code-review fixes after the initial Mode B green run. Re-ran the full suite (`npm run test` + `npm run test:e2e`, both fresh, §6) against each — **all 61 tests (23 unit + 38 e2e) remained green**, so none of these changed any tested behavior's observable contract:

1. **`src/instrumentation.ts` (new)** — `src/lib/config/env.ts`'s fail-fast validation now runs at server boot (Next.js's `register()` hook, Node runtime only) instead of lazily on first import. This makes **AC-AUTH-005's fail-fast half** (misconfigured deployment refuses to boot, rather than surfacing as a delayed/confusing failure) verified at the point the PRD actually describes ("When the application boots... it fails fast"), not just at first env-import. `tests/unit/config/auth-env.test.ts` already asserted the throwing behavior directly against `env.ts`'s parse function (module-level, independent of _when_ Next.js chooses to import it) — that assertion surface is unchanged and still `PASS`; this fix is a boot-sequencing improvement the existing test already covered the logical contract for.
2. **`findOperatorByUsername()` moved to `src/lib/auth/dal.ts`** (ADR-012 compliance — the login Server Action no longer calls Prisma directly). Pure refactor; `tests/unit/auth/login-action.test.ts` calls `login()` through its public contract and is unaffected.
3. **`src/lib/auth/session.ts`'s outside-request-scope catch narrowed** to match Next's specific `E251` "dynamic API called outside a request scope" error (with a message-substring fallback), rethrowing anything else. `tests/unit/auth/login-action.test.ts`'s reliance on this catch (calling `login()` from plain Vitest, no request scope) still passes — confirms the narrowed catch still covers the one legitimate no-request-scope case this suite exercises, without silently swallowing unrelated errors.
4. **`src/lib/api/errors.ts` (new) + all 4 Bookmarks route handlers** — Prisma `P2003` (FK violation, e.g. a nonexistent `categoryId` on bookmark create) and `P2025` (update/delete against a missing id) now map to `400`/`404` instead of an unhandled `500`. **Not directly exercised by this suite** (no existing test posts a bad `categoryId` or mutates a nonexistent id) — recorded here as a coverage gap the tester did not add a case for in this dispatch (scope was fix-verification + comment nits, not new coverage); flagged as a good candidate for a small follow-up test if this dispatch is extended.
5. **Dummy-verify on unknown username** (`src/app/login/actions.ts`) — a nonexistent-username login now still runs `verifyPassword()` against a precomputed dummy hash before returning the rejection, closing a username-enumeration timing side channel. `e2e/auth.spec.ts`'s AC-AUTH-003 case (wrong username) still asserts only the observable outcome (generic error banner, no session) — unaffected by the added constant-time work, still `PASS`.

None of these fixes required any test change; comment/header nits from the same code-review pass are addressed separately in §1 history (session-contract.test.ts, bookmarks.test.ts, auth-env.test.ts, auth.spec.ts, vitest.config.ts — Mode A/stub language replaced with Mode B language; one misleading `it()` title renamed to match its actual assertion, not its historical Mode-A framing).

---

## 5. Not Covered (explicitly out of scope)

- **`src/lib/auth/password.ts` / `src/lib/auth/session.ts` internals** are not unit-tested directly (not part of the frozen §5.1 contract surface — internal to backend-dev's Step 2); exercised indirectly through `session-contract.test.ts`, `login-action.test.ts`, and the full `e2e/auth.spec.ts` flow.
- **Icon URL rendering / broken-image edge cases beyond the "no icon" fallback:** a malformed _icon URL that is set_ isn't specified by any AC and isn't tested.
- **DB isolation strategy for Playwright e2e:** R2.0 uses the dedicated disposable test database and the E2E fixture registers every created category ID, then deletes those categories in reverse order after each test (204/404 only). AC-BM-014 is therefore order-independent and no longer relies on manual truncation. The former persistent-DB/manual-truncation residual risk is considered removed only after the automated reset/migrate/seed + cleanup gate passes in the final repeated CI-equivalent integration run; until then this row remains conditional, not a production-readiness claim.
- **Load/perf testing (NFR-PERF-001/002):** not applicable to Slice 1 (no paginated list ships in this slice).
- **Cross-browser matrix (Firefox/Safari):** Playwright config only wires Chromium-based projects; not required by any Slice 1 AC-ID.

---

## 6. Evidence (historical runtime and current collection)

**R2.0-I3 deterministic collection — 2026-07-14:**

```
$ playwright test --list
Total: 38 tests in 5 files
```

This confirms only the expected 38-execution collection contract (desktop 37, mobile 1) with no skipped or focused cases. Runtime status is **PENDING_REVALIDATION** until the separate dedicated-database integration gate passes.

**Final run (post backend code-review fixes, §4c) — 2026-07-12:**

```
$ npm run test
 Test Files  6 passed (6)
      Tests  23 passed (23)

$ npm run test:e2e
Running 38 tests using 6 workers
  38 passed (35.8s)
```

Both commands were re-run after the DB was reset (`docker compose up -d db`, `npx prisma migrate deploy` — no pending migrations) and, for the e2e run, `Category`/`Bookmark`/`Session` truncated for a clean, reproducible baseline. Full per-test output is reproduced in the tester's dispatch report (Evidence section).

**Prior run (initial Mode B green, before the code-review fixes):**

```
$ npm run test
 Test Files  6 passed (6)
      Tests  23 passed (23)

$ npm run test:e2e
Running 38 tests using 6 workers
  38 passed (1.6m)
```

**Historical DoD cross-check (2026-07-12, plan.md §10.1):** all 23 Slice 1 AC-IDs had authored tests and the then-current unit/E2E suites were green. For the rewritten R2.0-I3 suite, collection is 38/5 but runtime DoD is **PENDING_REVALIDATION**; no current all-green or three-run claim is made.

---

## 7. Q-13 executable test catalog (all PENDING)

Authored tests, file discovery, Prisma validation, and SQL inspection remain `STATIC` until the named PostgreSQL/browser/provider runtime executes successfully.

### 7.1 PostgreSQL 16 schema, repair, and migration

| ID         | Runtime case and pass condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Q13-DB-001 | Preflight rejects a manifest with a missing/duplicate root, Alert, Session explicit-null row, membership, or orphan disposition. A duplicate `AlertCategory (workspaceId,name)` group is rejected unless the manifest contains an explicit human merge/rename disposition. Exact digest/full coverage passes without inference.                                                                                                                                                                                                                                                                                                            |
| Q13-DB-002 | SERIALIZABLE advisory-lock repair writes existing columns only and makes zero provider/network calls. A forced failure rolls back repair atomically.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Q13-DB-003 | Sentinel id `q13-repair-uncategorized:<workspaceId>` and `(workspaceId,'__q13_repair_uncategorized__')` collisions each abort before writes. For every manifest historical null-category Alert, assert exactly one post-repair row with the original `id`, payload, `createdAt`, and `updatedAt`, the manifest `workspaceId`, `alertCategoryId = NULL`, and `alertCategoryWorkspaceId = NULL`; assert no loss, duplicate, sentinel id/name/reference, or remnant.                                                                                                                                                                          |
| Q13-DB-004 | Existing path: historical schema/data → manifest repair → Q-13 forward → updated seed. Fresh path: init → empty historical workspace migration → Q-13 forward with zero workspace/mock rows → transactional seed. Both pass without squash/baseline.                                                                                                                                                                                                                                                                                                                                                                                       |
| Q13-DB-005 | Forced forward-migration failure rolls back every forward DDL/DML change while repaired historical columns remain old-binary compatible; retry succeeds.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Q13-DB-006 | `WorkspaceRole` accepts only OWNER/MEMBER. Session accepts both active fields NULL, or both non-NULL with `activeWorkspaceOperatorId = operatorId`; each partial-null permutation and a non-NULL shadow/operator mismatch violates the Session CHECK. Alert strict optional-pair cases still reject each partial-null permutation.                                                                                                                                                                                                                                                                                                         |
| Q13-DB-007 | Bookmark/Channel/Message/Idempotency parent shadows reject mismatched workspace; old single-column FKs are absent from `pg_constraint`; populated compound cascades pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Q13-DB-008 | Alert composite `ON DELETE SET NULL` clears both category columns and preserves direct `workspaceId`; binding `ON DELETE RESTRICT` prevents uncontrolled workspace cascade.                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Q13-DB-009 | Binding identity accepts exactly `ProviderResourceType` `{DOMAIN, SERVER}` and rejects invalid provider/type pairs, REAL mock prefixes, trim/control violations, and UTF-8 lengths over account 256/remote 512/display 512; global identity collision is exclusive.                                                                                                                                                                                                                                                                                                                                                                        |
| Q13-DB-010 | Assert exact fields `operationState`, `operationId`, `operationKind`, `operationIntent`, `operationStartedAt`, `operationLeaseExpiresAt`, `lastReconciledAt`, and `version`. The lease CHECK requires `operationId`/`operationKind`/credential-free canonical `operationIntent`/`operationStartedAt`/`operationLeaseExpiresAt` all NULL in `IDLE` and all non-NULL in `RUNNING` or `RECONCILE_REQUIRED`; `lastReconciledAt` remains optional outside that active-evidence group. Reject intent over 16 KiB and credential-like keys or values; prove unique `operationId` and the exact `(operationState, operationLeaseExpiresAt)` index. |
| Q13-DB-011 | Generator reproduces committed SQL VALUES bytes and version/SHA-256; Prisma checksum/validate pass; seed, `createWorkspace`, and adapters consume the same canonical JSON and produce exactly the canonical mock set without global duplicates.                                                                                                                                                                                                                                                                                                                                                                                            |

### 7.2 Request context, roles, browser, cache, and cursors

| ID             | Runtime case and pass condition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q13-CTX-001    | Route inventory proves every session-authenticated browser API method—including workspace list/create/admin/switch—requires non-empty ASCII `X-Inspoter-Workspace` ≤128; only login/logout/public webhook/assets/direct RSC are exempt.                                                                                                                                                                                                                                                                                       |
| Q13-CTX-002    | Missing/malformed header returns `400 WORKSPACE_CONTEXT_REQUIRED`; authenticated mismatch returns `409 WORKSPACE_CONTEXT_STALE`; both occur before business query/cache/write/binding/provider spies fire.                                                                                                                                                                                                                                                                                                                    |
| Q13-CTX-003    | Header never selects authority: a matching foreign id stays non-disclosing 404; switch header names current workspace while body names an authorized destination.                                                                                                                                                                                                                                                                                                                                                             |
| Q13-ROLE-001   | MEMBER can use normal content, DNS, server power, create workspace, and list members; owner-only workspace/member/discovery/claim/remove/transfer actions deny MEMBER without side effects.                                                                                                                                                                                                                                                                                                                                   |
| Q13-ROLE-002   | Concurrent attempts cannot remove the last owner or an operator's last membership; lock-order test proves workspace→operator→membership→binding and deterministic session fallback.                                                                                                                                                                                                                                                                                                                                           |
| Q13-WS-001     | A trimmed-empty workspace name is rejected with zero writes; a Cyrillic-only name produces a deterministic nonempty ASCII slug. Exercise `base`, `base-2`, and each following candidate through the maximum of five: every candidate starts a fresh top-level transaction that atomically creates the workspace+`OWNER`; catch is outside the callback; only the named `Workspace_slug_key` conflict retries; any non-slug error fails immediately; exhaustion returns the typed conflict; no orphan or partial pair remains. |
| Q13-UI-001     | Switching aborts old requests, discards late responses, clears workspace caches, refreshes/remounts keyed boundary, and updates all sections without full reload.                                                                                                                                                                                                                                                                                                                                                             |
| Q13-UI-002     | On stale `409`, GET may refresh/refetch once; mutation never retries. A delayed old-workspace response never repaints the new workspace.                                                                                                                                                                                                                                                                                                                                                                                      |
| Q13-CACHE-001  | Workspace responses carry `private, no-store, max-age=0` and `Vary: Cookie, X-Inspoter-Workspace`; no shared Next cache entry serves another workspace.                                                                                                                                                                                                                                                                                                                                                                       |
| Q13-CURSOR-001 | A malformed envelope or mismatch in workspace, normalized filter, sort/order, or version is rejected before any database query; valid exact-binding keyset pagination neither duplicates nor leaks rows.                                                                                                                                                                                                                                                                                                                      |

### 7.3 Provider binding, mock, and operation lease

| ID           | Runtime case and pass condition                                                                                                                                                                                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q13-PROV-001 | Stable account key/remote id survive credential rotation; invalid credential returns typed auth with no mock fallback; account mismatch blocks with no display-name auto-match.                                                                                                                     |
| Q13-PROV-002 | Discovery occurs outside transaction and hides resources assigned elsewhere. Fresh claim plus `INSERT ON CONFLICT` is same-workspace idempotent and different-workspace generic 409.                                                                                                                |
| Q13-PROV-003 | Foreign/missing local binding returns non-disclosing 404 and provider/network spy count zero for list/detail/DNS mutation/server power.                                                                                                                                                             |
| Q13-PROV-004 | MOCK ids use `mock:v1:<workspaceId>:...`; two workspaces receive canonical but independent state; one workspace's mutation never changes the other.                                                                                                                                                 |
| Q13-PROV-005 | Lease acquisition commits before provider I/O; successful readback CAS clears state/version; timeout-after-possible-commit enters `RECONCILE_REQUIRED`.                                                                                                                                             |
| Q13-PROV-006 | Expired lease is never stolen; reconciliation is provider-read-only; active/unresolved binding blocks mutation, transfer, remove, and workspace delete.                                                                                                                                             |
| Q13-PROV-007 | REAL transfer requires owners of both workspaces and changes local metadata only. MOCK transfer is rejected before provider access with zero calls because `remoteId` embeds workspace. Idle removal and workspace deletion make zero provider delete calls and leave upstream resources unchanged. |

### 7.4 R2.8 all-section closure

Create workspaces A/B and owners/members A1/A2/B1/B2. Seed distinct Bookmarks, Domains/DNS bindings and records, Servers, Mail, Messages, Logs, Alerts, Settings state, and tokens. For each role, switch A↔B repeatedly and exercise list/detail/create/update/delete where in scope, pagination/cursors, stale tabs, caches, webhook ingest, DNS mutation, server power, and owner-only controls. Pass requires zero mixed identifiers/content, zero foreign provider calls, correct role denials, no stale repaint, no automatic stale mutation retry, and unchanged upstream resources after local binding/workspace removal.

Before R2.8, AC-WS-008/010/011 remain PARTIAL even when every individual facet is green. After one clean R2.8 runtime plus independent review, record those three criteria PASS and Workspaces 11/11. Real-provider facts remain R3.x and are not inferred from mock PASS.

---

## 8. Q-14 Mail client traceability (AC-MAIL-007..030) — runtime green 2026-07-18

**Mock-driver strategy:** all mail tests run against `MockMailDriver` (`src/lib/mail/mock.ts`) — a deterministic in-memory IMAP/SMTP substitute keyed by account id (~30 seeded INBOX messages with HTML bodies, attachments, and mixed read state, plus Sent/Trash/Archive). Mutations change the shared store; `send()` writes to an exported outbox that tests assert against; `resetMockMailStore()` reseeds between tests. The e2e suite creates a `mode: MOCK` account, so the entire client path (account → sync → folders → read → actions → compose → attachments) is exercised end-to-end with **no real IMAP server**. The driver itself is verified by `tests/unit/mail/mock-driver.test.ts` (12 cases: determinism, store isolation, special-use folders, `initialLimit`/`afterUid`, flag round-trip, moves, attachment content, outbox/append, reset). Real-transport behavior (`imap-smtp.ts`) is type/build-verified and constrained by architecture §7A.6; it has no automated real-server suite (accepted — same posture as provider real-account smoke).

| AC-ID            | Test file : case                                                                                                                                                                                                                                                                | Status |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC-MAIL-007      | `tests/unit/services/mail-accounts.test.ts` : "encrypts the password (round-trip via crypto) and verifies a MOCK account"; "allows a MEMBER to create an account (no owner-only gate)"; "…returns no secret fields" (prd.md v3.13 reversed the owner-only mutation rule)        | PASS   |
| AC-MAIL-008      | `tests/unit/services/mail-accounts.test.ts` : "testConnection — returns imapOk/smtpOk true for a MOCK config" · `e2e/mail-client.spec.ts` fixture creates the MOCK account through the settings flow                                                                            | PASS   |
| AC-MAIL-009      | `tests/unit/services/mail-accounts.test.ts` : "keeps the stored password when the input password is empty/absent"; "re-encrypts when a new password is provided"                                                                                                                | PASS   |
| AC-MAIL-010      | `tests/unit/services/mail-accounts.test.ts` : "deletes an IMAP account"; "refuses to delete the WEBHOOK account"; "rejects connection-field changes on the WEBHOOK account"                                                                                                     | PASS   |
| AC-MAIL-011      | `tests/unit/services/mail-accounts.test.ts` : "ensures the webhook account exists and returns no secret fields" · `tests/unit/services/mail.test.ts` : "creates the WEBHOOK account + INBOX folder once and reuses them"                                                        | PASS   |
| AC-MAIL-012      | `tests/unit/services/mail-sync.test.ts` : "creates 4 folders and 30 INBOX messages with flags, attachments and lastSeenUid" · `mock-driver.test.ts` : "honours initialLimit and afterUid in fetchMessages"                                                                      | PASS   |
| AC-MAIL-013      | `tests/unit/services/mail-sync.test.ts` : "fetches only messages after lastSeenUid"; "is idempotent — a second sync creates nothing new"                                                                                                                                        | PASS   |
| AC-MAIL-014      | `tests/unit/services/mail-sync.test.ts` : "wipes and resyncs the folder when stored validity differs from remote"                                                                                                                                                               | PASS   |
| AC-MAIL-015      | `tests/unit/services/mail-sync.test.ts` : "updates isRead when the flag changed on the server"; "deletes local rows whose uids vanished from the server folder"                                                                                                                 | PASS   |
| AC-MAIL-016      | `tests/unit/services/mail-sync.test.ts` : "returns busy while another sync holds a fresh lease"; "takes over an expired lease from a crashed sync" (409 `SYNC_IN_PROGRESS` mapping in `/api/mail/accounts/[id]/sync`)                                                           | PASS   |
| AC-MAIL-017      | `tests/unit/services/mail-sync.test.ts` : "records ERROR + syncError and still advances nextSyncAt on transport failure"                                                                                                                                                        | PASS   |
| AC-MAIL-018      | `tests/unit/services/mail-actions.test.ts` : "setRead — round-trips \Seen through the driver and updates the DB row" · `e2e/mail-client.spec.ts` : "mail actions: read badge, archive, trash, compose and reply" (auto-read)                                                    | PASS   |
| AC-MAIL-019      | `tests/unit/services/mail-actions.test.ts` : "moves an INBOX item into TRASH on the server and locally"; "permanently deletes an item already in TRASH (row and mock message gone)"; "WEBHOOK items — setRead and deleteItem work without touching any driver" · e2e trash flow | PASS   |
| AC-MAIL-020      | `tests/unit/services/mail-actions.test.ts` : "moves an item into the Archive folder on the server and locally"; "rejects a target folder belonging to another account" · e2e archive flow                                                                                       | PASS   |
| AC-MAIL-021      | `e2e/mail-client.spec.ts` : "mail client shows folders with unread badges, reads a message, switches folders, and filters" · `tests/unit/services/mail.test.ts` : "unreadOnly returns only unread items"                                                                        | PASS   |
| AC-MAIL-022      | `tests/unit/services/mail-actions.test.ts` : "sends via SMTP, appends the Sent copy, and creates a read local Sent row" · e2e compose flow                                                                                                                                      | PASS   |
| AC-MAIL-023      | `tests/unit/services/mail-actions.test.ts` : "reply threads In-Reply-To/References and marks the original answered" · e2e reply flow (Re: prefill + цитата)                                                                                                                     | PASS   |
| AC-MAIL-024      | `tests/unit/services/mail-actions.test.ts` : "enforces the per-workspace rate limit with a 429-mapped error"; recipient (≤50) and body (≤500 KB) caps in `src/lib/validation/mail.ts`                                                                                           | PASS   |
| AC-MAIL-025      | `tests/unit/services/mail-actions.test.ts` : "rejects sending from the webhook mailbox"; UI hint «Добавьте IMAP-аккаунт, чтобы писать письма» in `mail-sidebar.tsx`                                                                                                             | PASS   |
| AC-MAIL-026      | `tests/unit/services/mail-attachments.test.ts` : "downloads from the driver on first access and caches content + fetchedAt"; "serves the cached content without touching the driver again" · e2e attachment download                                                            | PASS   |
| AC-MAIL-027      | `tests/unit/services/mail-attachments.test.ts` : "throws AttachmentTooLargeError when sizeBytes exceeds the limit" (→ 413); "throws AttachmentUnavailableError for an uncached attachment on a uid-less item" (→ 409)                                                           | PASS   |
| AC-MAIL-028      | Content-Type allowlist → `application/octet-stream` fallback implemented in `src/app/api/mail/[id]/attachments/[attachmentId]/route.ts`; download disposition/filename asserted in the e2e attachment case                                                                      | PASS   |
| AC-MAIL-029      | `e2e/mail-client.spec.ts` : "mail client shows folders with unread badges, reads a message, switches folders, and filters"                                                                                                                                                      | PASS   |
| AC-MAIL-030      | e2e account switching in the same case · workspace scoping units: `mail-sync.test.ts` "never touches data of другого workspace", foreign-workspace not-found cases in `mail-actions.test.ts` / `mail-attachments.test.ts`, `mail.test.ts` workspace isolation + cursor binding  | PASS   |
| — (a11y)         | `e2e/mail-client.spec.ts` : "mail client screen has zero serious or critical accessibility violations"                                                                                                                                                                          | PASS   |
| AC-MAIL-001..006 | Pre-Q-14 rows remain valid; re-verified against the three-pane client by `tests/unit/services/mail.test.ts` (AC-labelled describes incl. the Phase-5 projection/filter cases) and the two functional e2e cases above                                                            | PASS   |

Runtime evidence for this section: full `pnpm test` (590 unit tests / 46 files) and the Playwright regression on the dedicated test database — command output recorded in `docs/progress.md` («Веха Mail client», 2026-07-18).

---

## 9. Channel webhooks and Discord-style Messages revalidation — LOCAL PASS / DEPLOYMENT PENDING

Local feature acceptance passed on 2026-07-18. The guarded database/API suite passed 54/54, focused Messages UI Vitest passed 12/12, and the final full `pnpm test:ci` passed with 624/624 Vitest tests (49 files), production build PASS, and 93 passed + 2 intentionally skipped Playwright cases. The only remaining control is deployment-owned reverse-proxy path redaction; no proxy configuration or sanitized access-log fixture exists in this repository, so production readiness is not inferred.

| ID              | Observable case and evidence target                                                                                                                                                                                                                                                                                | Current status           |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------ |
| CHWH-DB-001     | Fresh migration replay and populated upgrade leave historic messages as `LEGACY` and historic tokens with both channel fields null; PostgreSQL rejects partial pairs and workspace mismatch.                                                                                                                       | PASS                     |
| CHWH-DB-002     | Deleting a channel cascades its scoped webhook and that token's idempotency rows; unrelated/legacy tokens remain.                                                                                                                                                                                                  | PASS                     |
| CHWH-SVC-001    | `tests/unit/services/webhookTokens.test.ts`: 24-byte secret, hash-only persistence, relative one-time URL, isolated legacy/channel lists, cross-workspace denial, channel/workspace revoke, and cascade.                                                                                                           | PASS                     |
| CHWH-API-001    | `tests/unit/api/channel-webhooks.test.ts`: session + exact workspace header; OWNER and MEMBER may manage; foreign channel/webhook is non-disclosing 404; strict name 1–80; GET contains neither secret nor hash; POST returns one URL; first/repeated DELETE is 204.                                               | PASS                     |
| CHWH-API-002    | Legacy `/api/webhook-tokens/**` lists/revokes only `channelId = null`; legacy `POST /api/webhooks/<type>` behavior and required message `channelId` remain compatible.                                                                                                                                             | PASS                     |
| CHWH-ING-001    | `tests/unit/webhooks/channelPipeline.test.ts`: strict `{content, author?}`, server-derived channel, attempted `channelId`/unknown-field rejection, default/custom author, `WEBHOOK` origin, whitespace/4000/80 bounds, malformed JSON 400, streamed/declared oversize 413, invalid/revoked/deleted credential 401. | PASS                     |
| CHWH-IDEM-001   | Same token + same printable-ASCII key (1–128) under concurrency commits exactly one message/key; loser and later replay return the winner id with 200; new commit is 201; no-key retries create separately; transaction failure leaves neither partial row.                                                        | PASS                     |
| CHWH-RATE-001   | Exact per-token boundary returns 429 plus integer `Retry-After`; throttled calls create nothing.                                                                                                                                                                                                                   | PASS                     |
| CHWH-SEC-001    | Creation response is `Cache-Control: private, no-store` plus `Referrer-Policy: no-referrer`; public delivery is `Cache-Control: no-store` plus `Referrer-Policy: no-referrer`. Secret/hash never appear in list, toast, storage, RSC data, analytics, application logs, or retained browser artifacts.             | PASS                     |
| CHWH-DEPLOY-001 | Reverse-proxy access/error log fixture proves the **full request path** is redacted for `/api/webhooks/channels/*`; no `<webhook-id>/<token>` is retained.                                                                                                                                                         | PENDING / FIXTURE ABSENT |
| MSG-UI-001      | `tests/unit/ui/interactions.test.tsx`: auto-selection, Enter newline, Ctrl+Enter exactly-one send, explicit refetch, clear-on-success, draft retention/error association, origin text, HTML-as-text, prepend-with-scroll-anchor, one-time URL disposal, exact opener focus, and workspace remount.                 | PASS (12/12)             |
| MSG-E2E-001     | Real disposable PostgreSQL + Playwright at 1440×900: member create/copy/inbound/reload/revoke, row/header focus restoration, keyboard flow, workspace isolation, and Axe serious/critical = 0.                                                                                                                     | PASS                     |
| MSG-E2E-002     | Real disposable PostgreSQL + Playwright at 375×800: one navigation Sheet, exact Sheet/header focus restoration, keyboard flow, no duplicate navigation, and Axe serious/critical = 0.                                                                                                                              | PASS                     |

Verification classification: global `pnpm format:check` is `BASELINE_FAIL` on 310 repository files while the changed feature TS/TSX files pass targeted Prettier; `pnpm lint` PASS with 0 errors and 2 existing warnings; `pnpm typecheck` PASS; guarded feature DB/API tests 54/54 PASS; focused UI 12/12 PASS; build PASS with the existing Nodemailer externalization warning; final `pnpm test:ci` PASS (624/624 Vitest, 93 Playwright passed, 2 skipped). `pnpm test:db:down` cleanup and ports 3833/3910 verification PASS. `CHWH-DEPLOY-001` remains PENDING and blocks a production-ready claim.

---

## 10. Public OpenAPI and protected Swagger UI acceptance

The checked-in contract covers only the two external webhook ingress operations. Internal dashboard APIs, Authentik OIDC, and webhook-management routes remain out of scope. Tests and artifacts use clearly synthetic credentials; they must not contain real or plausible tokens.

| ID                | Observable case and evidence target                                                                                                                                                                                                                              | Status  |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| OAPI-LINT-001     | `pnpm openapi:lint` validates `specs/openapi.json` as OpenAPI 3.1.1 with Redocly CLI.                                                                                                                                                                            | PENDING |
| OAPI-CONTRACT-001 | `pnpm openapi:contract` proves exactly two paths and two POST operations, unique operation IDs, source route `POST` exports, required security/parameters/responses, relative server URL, and no workspace header, extra route, external URL, or secret example. | PENDING |
| OAPI-SCHEMA-001   | Unit tests compare the legacy type enum with `SUPPORTED_TYPES`, parse safe examples through the current Zod schemas, and match channel constraints and both pipeline error models.                                                                               | PENDING |
| OAPI-UI-001       | Component tests prove Swagger receives the imported `spec` object rather than a URL and explicitly sets POST-only submission, no authorization persistence, disabled query configuration, and no validator URL.                                                  | PENDING |
| OAPI-AUTH-001     | Anonymous and invalid-session requests to `/settings/api-docs` and `/ru/settings/api-docs` redirect to login.                                                                                                                                                    | PENDING |
| OAPI-E2E-001      | An authenticated operator opens API documentation from Settings and sees exactly the two POST operations; Swagger makes no CDN or external-validator request.                                                                                                    | PENDING |
| OAPI-SEC-001      | An intercepted synthetic Try It Out request omits `X-Inspoter-Workspace`; reload leaves synthetic credentials out of local and session storage.                                                                                                                  | PENDING |
| OAPI-BUNDLE-001   | A production Turbopack build contains no raw OpenAPI specification in public `/_next/static` chunks.                                                                                                                                                             | PENDING |
| OAPI-CI-001       | `pnpm openapi:check` is the first full CI-profile step; the e2e profile remains unchanged.                                                                                                                                                                       | PENDING |

---

## 11. VPS Metrics Agent (2026-07-21)

> **2026-07-24 — universal API tokens.** Migration `20260724100000_universal_api_tokens` dropped `ServerAgentToken`; metrics ingestion now authenticates with workspace-level universal API tokens (`WebhookToken`, `channelId: null`), and metrics states reduce to `not_configured` (no snapshot) / `live` / `stale`. Rows below tied to the removed token state machine or owner-only token management are marked SUPERSEDED and record historical evidence only; the remaining rows stay valid. See `docs/architecture.md` §7C.

### 11.1 Server service — DB integration (`tests/unit/services/servers.test.ts`)

| AC-ID / Area            | Test case                                                                          | Status     |
| ----------------------- | ---------------------------------------------------------------------------------- | ---------- |
| AC-SRV-002              | reconciles provider inventory into present provider-origin DTOs                    | PASS       |
| Idempotency             | reuses the same localServerId for a server already reconciled                      | PASS       |
| Error isolation         | isolates a failing provider's error without dropping the working provider          | PASS       |
| Missing detection       | marks a LocalServer the provider no longer reports as missing, without deleting it | PASS       |
| AC-SRV-001              | getComposedServer returns a composed DTO merged with live provider data            | PASS       |
| Not found               | getComposedServer returns null when no LocalServer row matches                     | PASS       |
| Metrics: not_configured | reports not_configured when no snapshot exists (was: when no agent token exists)   | PASS       |
| Metrics: waiting        | reports waiting for a bound token with no snapshot yet — state removed 2026-07-24  | SUPERSEDED |
| Metrics: live           | reports live for a fresh snapshot                                                  | PASS       |
| Metrics: stale          | reports stale past the 180s threshold                                              | PASS       |
| Metrics: revoked        | reports revoked once the only bound token is revoked — state removed 2026-07-24    | SUPERSEDED |
| AC-SRV-004              | start transitions a stopped server to running within the 30s poll window           | PASS       |
| AC-SRV-005              | stop transitions a running server to stopped within the 30s poll window            | PASS       |
| AC-SRV-006              | restart transitions a running server back to running within the 60s poll window    | PASS       |
| Power: not found        | returns 'Server not found' for an unknown id                                       | PASS       |
| Power: unknown provider | returns an error for an unknown providerId                                         | PASS       |

### 11.2 Hetzner Cloud pagination (`tests/unit/providers/hetzner-cloud.test.ts`)

| Area           | Test case                                | Status |
| -------------- | ---------------------------------------- | ------ |
| Pagination     | follows next_page through multiple pages | PASS   |
| Error handling | later-page failure returns error         | PASS   |
| Guard          | 100-page maximum cap                     | PASS   |

### 11.3 HTTP provider (`tests/unit/providers/http.test.ts`)

| Area        | Test case                | Status |
| ----------- | ------------------------ | ------ |
| AbortSignal | forwards signal to fetch | PASS   |

### 11.4 Python agent (`metrics-agent/tests/`)

| File                | Coverage                                                                 | Status |
| ------------------- | ------------------------------------------------------------------------ | ------ |
| `test_collector.py` | CPU delta, meminfo, loadavg, uptime, statvfs, hostname, complete payload | PASS   |
| `test_payload.py`   | IP validation, invalid SERVER_IPS rejection, payload structure           | PASS   |

## 12. Q-15 Mail labels/filter rules

Phase 2–4 execution summaries are retained in `docs/progress.md`. Phase 5 was
executed against guarded disposable PostgreSQL and passed the retained runtime,
browser, regression, and independent-review evidence below. Existing
AC-MAIL-001..030 remained green at the final gate.

### 12.1 Service, matcher, and API contract

| ID          | Acceptance/evidence target                                                                                                                                                                                                    | Phase | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------ |
| ML-SVC-001  | Label normalization runs NFKC → trim → collapse internal whitespace to one ASCII space → locale-stable lowercase; display casing remains; 0/1/40/41-character boundaries and Unicode equivalents are covered.                 |     2 | PASS   |
| ML-SVC-002  | Create/list is active-workspace scoped and member-accessible, stable by `(position, id)`, rejects normalized duplicate with 409 `LABEL_NAME_CONFLICT`, and transactionally enforces 100 labels under concurrent creates.      |   2–3 | PASS   |
| ML-SVC-003  | Rename/recolor/reorder/delete covers all colors, stable order, cascade of assignments, and 409 `LABEL_IN_USE` for active or inactive rule references.                                                                         |     3 | PASS   |
| ML-RULE-001 | Exact-sender create/list requires active-workspace membership plus one scoped account/label, 1/80 rule-name and 0/320/321 sender boundaries, stable `(position, id)` order, and 100-active-rule transactional limit.          |     2 | PASS   |
| ML-RULE-002 | Subject predicate covers 0/1/200/201 boundaries; sender+subject use canonical case-insensitive AND; empty predicate sets reject; rule rename/edit/enable/disable/reorder/delete preserve assignments.                         |     4 | PASS   |
| ML-ASGN-001 | Add/remove assignment is owner/member accessible and idempotent; retries and multiple rules targeting one label leave one `(mailItemId, labelId)` row.                                                                        |   2–3 | PASS   |
| ML-API-001  | Label, assignment, rule, and run routes require authenticated active workspace header, strict Zod bodies/queries, existing response envelopes, documented status/error codes, and non-disclosing 404 for missing/foreign ids. |   2–5 | PASS   |
| ML-DTO-001  | List/detail return bounded `{id,name,color}` label metadata; 50-row list contains no `bodyText`, `bodyHtml`, attachment `content`, or attachment bytes.                                                                       |     2 | PASS   |

### 12.2 Matching, persistence, and controlled concurrency

| ID            | Acceptance/evidence target                                                                                                                                                                                                         | Phase | Status |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------ |
| ML-MATCH-001  | Shared matcher contract covers NFKC, Unicode case, surrounding whitespace, exact sender, subject substring, AND, and empty-field boundaries identically in unit, webhook, IMAP, and batch-style paths.                             |   2–4 | PASS   |
| ML-INGEST-001 | Webhook INBOX persistence commits message, attachment metadata, and assignments atomically; event emits after commit; matching/nonmatching tracer proves only match receives chip.                                                 |     2 | PASS   |
| ML-INGEST-002 | IMAP performs remote I/O before database lock, then applies same matcher only to imported/re-imported `specialUse=INBOX`; Archive/Junk/Trash/Drafts/Sent and move-into-INBOX negatives receive no evaluation.                      |     4 | PASS   |
| ML-RACE-001   | Deterministic barriers race rule create, edit, disable, and delete against message persistence. Commit-before-post-lock-snapshot affects message; commit-after does not. Lock acquisition and active-rule load order are asserted. |     4 | PASS   |
| ML-RACE-002   | Concurrent label/rule limits, duplicate ingestion, retries, overlapping rules, and multiple rules targeting one label produce bounded counts and no duplicate assignment or partial message state.                                 |   2–4 | PASS   |
| ML-UID-001    | UIDVALIDITY INBOX wipe/re-import reapplies automatic labels; a focused limitation test/document check proves manual labels may be lost and no nullable/non-unique `Message-ID` reconciliation is attempted.                        |     4 | PASS   |

### 12.3 Workspace isolation, filtering, and pagination

| ID            | Acceptance/evidence target                                                                                                                                                                                                                         | Phase | Status |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------ |
| ML-ISO-001    | Two workspaces with owner/member fixtures exercise every label/rule/account/message foreign-id combination: members may manage labels/rules in their active workspace; foreign ids return 404 with zero cross-workspace writes or existence leaks. |   2–5 | PASS   |
| ML-FILTER-001 | `labelId` intersects account, folder, unread, query, sort, and workspace predicates; **All labels** clears only label facet.                                                                                                                       |     3 | PASS   |
| ML-CURSOR-001 | Cursor includes workspace and normalized full-filter fingerprint; changed workspace/account/folder/label/query/unread/sort resets safely, while an unchanged filter returns stable, nonduplicated pages across equal timestamps.                   |     3 | PASS   |
| ML-SWITCH-001 | Workspace/account/folder/label changes reset pagination and selected detail; stale responses cannot repaint destination scope.                                                                                                                     |     3 | PASS   |

### 12.4 Component, accessibility, responsive, and operator journeys

| ID          | Acceptance/evidence target                                                                                                                                                                                                    | Phase | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------ |
| ML-UI-001   | `LabelChip` follows subject inside one row button, is noninteractive, truncates with full accessible name, shows two desktop/one narrow plus exact `+N`, and row accessible name includes complete label names.               |   2–3 | PASS   |
| ML-UI-002   | Desktop sidebar and mobile Sheet show Labels below folders with selected state and **All labels** behavior; full picker supports add/remove, loading/failure recovery, Arrow/Enter/Space/Escape, and exact focus restoration. |     3 | PASS   |
| ML-UI-003   | Member-visible rule dialog prefills account/sender, permits edits plus select/create label, validates inline, preserves input on failure, announces success, and restores opener focus.                                       |   2–4 | PASS   |
| ML-I18N-001 | English and Russian cover every Slice 1–4 label/rule string, validation, conflict, empty/loading/error state, success announcement, and accessible-only expansion; locale change leaves stored content/matching unchanged.    |   2–4 | PASS   |
| ML-A11Y-001 | Keyboard-only desktop/mobile journeys and Axe serious/critical=0 cover row, sidebar/sheet, picker, reading pane, and rule/run dialogs; identity never depends on color.                                                       |   2–5 | PASS   |
| ML-RESP-001 | Playwright at 375px, 420px, and 1440px proves chip limits, contained popover/dialog/sheet, visible actions, working row activation, and no body horizontal overflow.                                                          |   2–5 | PASS   |
| ML-E2E-001  | Tracer: active-workspace member opens message → Filter messages like this → creates/selects label → saves exact-sender rule → ingests matching and nonmatching webhook mail → only matching row shows label.                  |     2 | PASS   |
| ML-E2E-002  | Owner/member manual-label and combined-filter journey, including mobile keyboard flow and account/workspace switching.                                                                                                        |     3 | PASS   |
| ML-E2E-003  | Rule create/edit/disable/delete journey proves future behavior changes while previous assignments remain.                                                                                                                     |     4 | PASS   |

### 12.5 Migration, backfill, performance, deployment, and rollback

| ID              | Acceptance/evidence target                                                                                                                                                                                             | Phase | Status                                       |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | -------------------------------------------- |
| ML-MIG-001      | Phase-2 additive migration passes Prisma validation, fresh historical replay, populated-current upgrade, raw workspace-check rejection, expected indexes/FKs, and unchanged counts/hashes for existing Mail data.      |     2 | PASS — Phase 2 replay evidence               |
| ML-MIG-002      | Phase-5 additive run migration replays fresh and populated states; partial unique index permits only one pending/running run per rule.                                                                                 |     5 | PASS — fresh + populated 18-migration replay |
| ML-RUN-001      | Same-timestamp cutoff uses inclusive cutoff/exclusive cursor; 200-row batches atomically commit assignments/counts/cursor; processed/matched meanings include pre-labeled matches exactly as specified.                |     5 | PASS — service and scheduler regressions     |
| ML-RUN-002      | Crash before commit advances nothing; crash after commit resumes after cursor; two workers, lease renewal/expiry takeover, three-failure ceiling, and manual retry preserve snapshot and committed progress.           |     5 | PASS — recovery/concurrency regressions      |
| ML-RUN-003      | Live/backfill overlap creates one assignment; post-cutoff mail uses live path only; rule edits during active run cannot change immutable snapshot. Polling stops on completed/failed and retry is bounded.             |     5 | PASS — overlap/snapshot/UI regressions       |
| ML-SCHED-001    | Instrumentation starts no new timer/scheduler; existing Mail scheduler claims bounded run work and restart recovery resumes durable state.                                                                             |     5 | PASS — exact 200/201 restart recovery        |
| ML-PERF-001     | Large seeded dataset records query plan, p50/p95 elapsed time, rows scanned, and DB/fixture details for a labeled 50-row combined-filter page and 200-row backfill batch; index changes require before/after evidence. |     5 | PASS — 20,000-row service-path measurement   |
| ML-DEPLOY-001   | Label UI/routes/evaluation/claims are always active after migration; deployment smoke covers labels alongside existing Mail behavior.                                                                                  |   2–5 | CURRENT SOURCE — deployment pending          |
| ML-BACKUP-001   | Dated encrypted pre-migration backup has owner/retention, row counts/checksums, and successful disposable restore evidence for documented Mail/label tables.                                                           |  2, 5 | PASS — encrypted restore and hash comparison |
| ML-ROLLBACK-001 | Rehearsal runs a prior compatible binary against additive schema and proves accounts/folders/messages/attachments/flags/bodies/actions unchanged while preserving label data.                                          |     5 | PASS — prior runtime + zero integrity diffs  |

### 12.6 Per-phase gates

- **Phase 2:** `ML-MIG-001`, exact-sender service/API/UI/tracer rows, Prisma
  validation, targeted tests, full unit suite, blocking-finding-free code review,
  and 1440px/375px demo are green.
- **Phase 3:** CRUD/assignment/filter/cursor/isolation/keyboard/Axe/responsive rows
  and combined-filter desktop/mobile demo are green.
- **Phase 4:** webhook/IMAP matcher parity, excluded-folder negatives, controlled
  races, lifecycle preservation, review, and UI demo are green.
- **Phase 5:** run/migration/performance/backup/rollback/restart rows plus lint,
  typecheck, full unit/integration/Playwright, production build, accessibility,
  responsive, and code-review gates are green.

No phase gate advances on documentation or collection evidence alone. User
verification is required before the next phase starts.

### 12.7 Phase 5 reproducible evidence procedure

All commands target only `127.0.0.1:3833/inspoter_e2e_test`. The guard requires
both explicit markers. Generated JSON and the encrypted rehearsal dump live in
ignored `test-results/mail-label-phase5/`; concise verified results are copied
to this section and `docs/progress.md` only after execution.

```powershell
$env:ALLOW_TEST_DB_RESET="1"
$env:TEST_DATABASE_MARKER="inspoter-e2e"
pnpm test:db:up
pnpm exec prisma validate
pnpm test:db:prepare
node scripts/mail-label-populated-migration-replay.mjs
pnpm test:db:prepare
pnpm exec vitest run --config scripts/vitest.mail-label-phase5-performance.config.mjs

$env:MAIL_LABEL_BACKUP_KEY = (node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")
$env:MAIL_LABEL_BACKUP_OWNER="Phase 5 local verifier"
$env:MAIL_LABEL_BACKUP_RETENTION="Until user verification plus seven days"
node scripts/mail-label-backup-restore-rehearsal.mjs
```

Performance fixture contract: exactly 20,000 deterministic messages—12,000 in
the target INBOX, 4,000 target-account Archive decoys, and 4,000 other-account
INBOX decoys—with groups of five equal timestamps. The harness calls the real
50-row `mailService.list` path and real filter-run claim/batch service. Each path
gets five warmups and 30 measured samples. Evidence records p50/p95, PostgreSQL
version, fixture counts, `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)`, summarized
rows/buffers/sort nodes, and index adjustments. No undocumented performance
threshold is invented.

The runtime harness performs deployment-darkness, rollback integrity, preserved
label visibility, and exact 200/201 restart recovery in one guarded run:

```powershell
node scripts/mail-label-phase5-runtime-hardening.mjs
```

It launches only hidden exact-PID servers on ports 3920/3921 and stops them in
`finally`. The archived Phase 4 build is copied to a disposable derived runtime;
because the archive omits `@prisma/client-runtime-utils`, that copy alone gets a
temporary junction to the repository dependencies. Both preserved `.next`
trees remain unchanged and the derived runtime is removed after verification.

The backup script streams `pg_dump --format=custom` from the explicitly named
`inspoter-test` container, encrypts it in memory with AES-256-GCM, restores into
only `inspoter_e2e_restore_test`, compares Mail/label/run row counts and SHA-256
hashes (including flags, bodies, and attachment bytes), then removes the restore
database. The key is never written to evidence. A backup file without successful
restore/hash comparison does not pass `ML-BACKUP-001`.

### 12.8 Phase 5 measured evidence (2026-07-21)

- `ML-MIG-002` PASS: fresh replay applied all 18 migrations. Populated replay
  applied the 17-migration Phase 4 baseline, seeded protected Mail data, applied
  only `20260721160000_mail_filter_runs`, and found zero row-count or SHA-256
  differences across account, folder, message, attachment, label, assignment,
  and rule tables. Expected traversal/partial-unique indexes and all run-state
  constraints were present; rolled-back functional probes proved that only one
  pending/running run may exist per source rule and that a half-null rule
  relation tuple is rejected.
- `ML-PERF-001` PASS on PostgreSQL 16.14 with the documented 20,000-message
  fixture. The real 50-row combined-filter list path measured p50 11.885 ms and
  p95 13.184 ms across 30 samples; its database plan executed in 1.759 ms using
  `MailItem_workspaceId_accountId_folderId_receivedAt_id_idx` and
  `MailItemLabel_workspaceId_labelId_mailItemId_idx`. The real 200-row run batch
  measured p50 31.702 ms and p95 40.193 ms; its selector plan executed in
  1.041 ms using `MailItem_workspaceId_accountId_createdAt_id_idx`. No index
  adjustment was warranted by this evidence.
- `ML-BACKUP-001` PASS: the owner/retention-labelled AES-256-GCM backup was
  114,144 encrypted bytes. Restore into `inspoter_e2e_restore_test` produced
  identical counts and SHA-256 hashes for all eight protected Mail tables and
  identical history for all 18 migrations; the restore database was removed.
  The encryption key was not persisted.
- `ML-DEPLOY-001` CURRENT SOURCE / PENDING DEPLOYMENT: the runtime feature gate
  was removed. Label/rule/run routes, UI, live evaluation, and pending-run
  claims are always active after migrations. Updated regression coverage keeps
  the existing account, folder, message list/detail, attachment-byte, and
  reversible unread/read smoke alongside label API/UI verification.
- `ML-ROLLBACK-001` PASS: a derived temporary copy of the preserved Phase 4
  runtime ran against the additive Phase 5 schema on port 3921 and passed the
  same existing Mail smoke. Its incomplete archived package required a
  temporary junction to the repository `node_modules` for
  `@prisma/client-runtime-utils`; neither preserved Phase 4 nor current `.next`
  was modified. Before/after counts and SHA-256 hashes were identical for all
  protected Mail, label, rule, assignment, and run tables and all 18 migration
  records. The derived runtime was removed after verification.
- `ML-SCHED-001` PASS: source inspection found one `setInterval` in the
  existing Mail scheduler and one instrumentation start call. A first hidden
  server process committed exactly 200 of 201 matching rows and stopped at
  cursor `phase5-runtime-restart-mail-200`; after expiring only that run lease,
  a fresh PID resumed strictly at row 201 and completed with 201 processed,
  201 matched, and 201 unique assignments. Only the expected run and assignment
  tables changed; all other protected table hashes stayed identical.
- `ML-RUN-001..003` PASS: six real-PostgreSQL service tests cover exact
  cutoff/cursor/count/atomicity, crashes, fencing/takeover/retry, immutable
  snapshots, and live overlap. Two scheduler regressions prove a retained
  nonterminal claim advances on the next tick with lease renewal. Eighteen UI
  tests prove serial polling, the exact 60-request cap across PENDING→RUNNING,
  terminal/error/unmount stop behavior, retry/refresh, and focus relocation.
- **Final Phase 5 regression:** Prisma validation and guarded 18-migration
  preparation PASS; Vitest **771/771** in 62 files; lint 0 errors with one
  pre-existing `no-page-custom-font` warning; native-control guard, typecheck,
  and production build PASS. Mail-label Playwright **12/12** at 1440px, 375px,
  and 420px, including Axe serious/critical=0, containment, keyboard/focus, and
  historical-run progress. Independent backend, UI, and docs/evidence audits
  were rerun after their findings were fixed.

## 13. Dashboards (2026-07-30)

Covers AC-DSH-001..018 (`docs/prd.md` §3.0a, `docs/architecture.md` §7E,
`docs/design.md` §5.0). The grid invariant is verified as pure functions rather
than through the browser: the same module validates a layout on both sides of
the wire, so a unit test on it is a statement about the API contract too.

### 13.1 Grid engine and configuration (unit, no database)

| ID           | Acceptance/evidence target                                                                                                                                                                                                                                                                                                                                                                    | Trace          | Status |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ------ |
| DSH-GRID-001 | `clampRect` keeps a rectangle inside 12 columns, shrinks an over-wide tile instead of shifting it left, clamps to the kind's min/max, forbids a negative row, and rounds the fractional cells a pointer drag produces.                                                                                                                                                                          | AC-DSH-012/013 | PASS   |
| DSH-GRID-002 | `rectsOverlap`/`hasOverlaps` treat touching edges as free and a shared cell as a collision, across a whole layout.                                                                                                                                                                                                                                                                             | AC-DSH-013     | PASS   |
| DSH-GRID-003 | `resolveCollisions` pushes the overlapped tile down, propagates through a stack, leaves side-by-side tiles untouched, and is a no-op for an unknown priority id.                                                                                                                                                                                                                                | AC-DSH-011     | PASS   |
| DSH-GRID-004 | `compactVertically` pulls tiles into a freed hole, keeps stacking order, compacts independent columns independently, never introduces an overlap, and is idempotent.                                                                                                                                                                                                                            | AC-DSH-011     | PASS   |
| DSH-GRID-005 | `findFreeSlot` places the first tile at the origin, fills the gap beside an existing tile, moves to a new row when the top row is full, and clamps an over-wide tile.                                                                                                                                                                                                                          | AC-DSH-007     | PASS   |
| DSH-GRID-006 | `moveWidget` swaps two stacked tiles, moves within a row without disturbing anything, compacts a drop into empty space back against the top, and ignores an unknown id.                                                                                                                                                                                                                         | AC-DSH-011     | PASS   |
| DSH-GRID-007 | `resizeWidget` grows a tile and pushes its neighbour down, pulls a neighbour back up on shrink, and respects the kind's size envelope.                                                                                                                                                                                                                                                         | AC-DSH-012     | PASS   |
| DSH-CFG-001  | Per-kind config schemas: name trim/length bounds, unknown-format and unusable-time-zone rejection, weather coordinate ranges plus required label, at-least-one calendar source, note length cap, item-count 1..20, unknown keys stripped rather than stored.                                                                                                                                     | AC-DSH-002/008 | PASS   |
| DSH-CFG-002  | `parseWidgetConfigOrDefaults` falls back to a kind's defaults for a corrupt stored config and returns null for a kind with no usable default (weather).                                                                                                                                                                                                                                        | AC-DSH-010     | PASS   |
| DSH-CFG-003  | `layoutSchema` rejects an empty layout, out-of-grid coordinates, an over-wide span, a negative row, and fractional cells before the request reaches the service.                                                                                                                                                                                                                                | AC-DSH-013     | PASS   |
| DSH-WX-001   | Weather: provider reading mapped onto a snapshot; rounded coordinates and requested unit sent to Open-Meteo; second call served from cache; one fetch shared between two widgets while each keeps its own label; no cache sharing across units or distant coordinates; transport failure, non-OK status and reading-less response surface as `WeatherUnavailableError`; a failure is not cached.  | AC-DSH-015/016 | PASS   |
| DSH-CAL-001  | Calendar: month range spans the first day to the first of the next (year rollover included); timestamps bucket per calendar day; several sources merge into one day; only requested sources are queried; a repeated source is de-duplicated; every query is workspace- and month-scoped; only DOWN checks count as incidents; a capped source is flagged and its counts stay at the cap.          | AC-DSH-015     | PASS   |

### 13.2 Widget rendering (unit, jsdom)

| ID         | Acceptance/evidence target                                                                                                                                                                                                                                                                | Trace              | Status |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| DSH-UI-001 | All ten widget kinds render from a payload fixture and from their empty payload without crashing; each empty state prints its own explanation rather than blank space.                                                                                                                      | AC-DSH-007/015     | PASS   |
| DSH-UI-002 | Clock honours the 24h/seconds/date/time-zone options; note preserves line breaks and prompts when empty; weather rounds the temperature, names the condition, falls back to "unknown" for an unmapped WMO code, omits absent optional readings, and switches the unit suffix.               | AC-DSH-008         | PASS   |
| DSH-UI-003 | Calendar lists the days that had events over a full month grid, states when the month was empty, and warns when counts were capped.                                                                                                                                                        | AC-DSH-015         | PASS   |
| DSH-UI-004 | Service status prints the summary over the selected set plus a hidden-remainder count; server metrics render CPU/memory/disk from a live snapshot and explain a server with no agent instead of hiding it.                                                                                  | AC-DSH-015         | PASS   |
| DSH-UI-005 | A widget whose resolution failed renders the error card with its cause, never replacing the board.                                                                                                                                                                                         | AC-DSH-015         | PASS   |

### 13.3 Service and API (integration, real PostgreSQL)

| ID          | Acceptance/evidence target                                                                                                                                                                                                                                                        | Trace              | Status |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| DSH-SVC-001 | Board create/list/get, increasing positions for stable tab order, and no cross-workspace leakage on list or get.                                                                                                                                                                   | AC-DSH-001/003     | PASS   |
| DSH-SVC-002 | `getLandingDashboard` returns null for an empty workspace, the first board by position when none is flagged, and the flagged board otherwise.                                                                                                                                      | AC-DSH-005         | PASS   |
| DSH-SVC-003 | `setDefault` moves the flag off the previous start board in one transaction and refuses a board from another workspace.                                                                                                                                                            | AC-DSH-004         | PASS   |
| DSH-SVC-004 | Rename and delete work, deletion cascades the board's widgets, and both refuse across workspaces.                                                                                                                                                                                  | AC-DSH-006         | PASS   |
| DSH-SVC-005 | `addWidget` places the first widget at the origin at its default size, packs the next into the free space beside it, stores a validated config with defaults filled, rejects a config that does not match the kind, and refuses another workspace's board.                           | AC-DSH-007/008     | PASS   |
| DSH-SVC-006 | Config update replaces the stored options; update and remove reject a widget id belonging to another board; removal leaves the board empty.                                                                                                                                        | AC-DSH-009         | PASS   |
| DSH-SVC-007 | `saveLayout` persists a legal layout and rejects overlaps, a partial layout, a duplicated widget id, a widget from another board, a size outside the kind's envelope, and a layout addressed to another workspace.                                                                  | AC-DSH-013         | PASS   |
| DSH-API-001 | `POST /api/dashboards` creates and journals the board; an empty name returns a field-level 400; `GET` lists only the active workspace's boards.                                                                                                                                    | AC-DSH-001/002     | PASS   |
| DSH-API-002 | `PATCH /api/dashboards/[id]` renames, promotes to start page (leaving exactly one flagged row), rejects a body that changes nothing, and returns 404 `DASHBOARD_NOT_FOUND` for another workspace's board.                                                                           | AC-DSH-004/006     | PASS   |
| DSH-API-003 | Widget add returns the server-chosen position; unknown kind and kind-invalid config return 400; config PATCH persists; a widget not on that board returns 404 `DASHBOARD_WIDGET_NOT_FOUND`.                                                                                         | AC-DSH-007/008/009 | PASS   |
| DSH-API-004 | `PATCH …/layout` persists a legal layout (204), returns 400 `DASHBOARD_LAYOUT_INVALID` for overlapping tiles, and rejects out-of-grid coordinates at the schema before reaching the service.                                                                                        | AC-DSH-013         | PASS   |
| DSH-API-005 | `GET …/data` returns one payload per widget keyed by widget id and 404 for another workspace's board.                                                                                                                                                                               | AC-DSH-016         | PASS   |

### 13.4 Browser (Playwright, 1440px)

| ID          | Acceptance/evidence target                                                                                                                                                                                                    | Trace              | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------ |
| DSH-E2E-001 | The empty state creates the first board and lands on it showing the empty-board state.                                                                                                                                         | AC-DSH-001         | PASS   |
| DSH-E2E-002 | A widget is added, configured (the saved note text appears on the tile), and removed, each step asserted on the API response.                                                                                                   | AC-DSH-007/008/009 | PASS   |
| DSH-E2E-003 | Focusing the resize grip and pressing an arrow key widens the tile by one cell, persists (204), and the new width survives a reload.                                                                                            | AC-DSH-012/018     | PASS   |
| DSH-E2E-004 | Dragging a tile onto another takes its cell, displaces it, persists, and survives a reload. The gesture is stepped and retried, matching the dnd-kit convention in `e2e/bookmarks.spec.ts`.                                      | AC-DSH-011         | PASS   |
| DSH-E2E-005 | Rename, make-start-page (with its toast) and confirmed deletion work, after which the section returns to the no-boards empty state.                                                                                             | AC-DSH-004/006     | PASS   |
| DSH-E2E-006 | A four-widget board renders in light and dark with no horizontal overflow and tiles sharing a top edge on the grid; at 375px every tile spans the full width at a distinct offset. Screenshots are attached to the run.           | AC-DSH-017         | PASS   |

### 13.5 Evidence

Unit **765/765** in 63 files; integration **478/478** in 36 files; production
build and typecheck clean; lint 0 errors including the native-control guard
(the resize grip lives in `src/components/ui/`, the only exempt folder).
Playwright full suite **124 passed / 0 failed** after merging `main`'s three
independent e2e fixes into this branch (`dceae42`, `2504807`, `283788a` — none
gated by an AC-DSH id, see below); all six Dashboards specs green.

At the original Dashboards verification run the suite was 121 passed / 3
failed, confirmed at the time by an empty `git diff HEAD` over the failing
files as pre-existing and outside this section:

- `e2e/api-docs.spec.ts` asserted three OpenAPI operations while
  `specs/openapi.json` had documented four since commit `779c15f` added
  `POST /api/mcp` — fixed in `dceae42`.
- two `e2e/messages-channel-webhooks.spec.ts` cases (Ctrl+Enter send and a
  webhook-delivery visibility assertion) failed because the spec leaked
  fixtures into the shared test database — fixed in `2504807`, with the
  fixture teardown hardened in `283788a`.

## 14. Discord webhook compatibility (2026-08-02)

Covers AC-WH-012..015 (`docs/prd.md` FR-WH-003, `docs/architecture.md` §6.4,
`specs/discord-webhook-compatibility.md`). Two properties carry most of the
risk and are tested directly rather than inferred: that a Discord client can
parse every response we emit, and that the pre-Discord contracts did not move.
The second is asserted by leaving `tests/integration/webhooks/channelPipeline.test.ts`
and `tests/integration/services/outgoingWebhooks.test.ts` untouched and green —
an edit to either would itself have been the regression.

### 14.1 Payload, identity and delivery units (no database)

| ID          | Acceptance/evidence target                                                                                                                                                                                                          | Trace         | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| DIS-VAL-001 | Per-field Discord limits: content 2000, username 80, ten embeds, embed title 256 / description 4096 / 25 fields / field name 256 / value 1024 / footer 2048 / author 256.                                                           | AC-WH-013     | PASS   |
| DIS-VAL-002 | The 6000-character budget counts across all embeds over exactly the budgeted fields, passes at the limit and fails one character over; url/timestamp/color are excluded.                                                            | AC-WH-013     | PASS   |
| DIS-VAL-003 | Unknown properties are accepted, matching Discord, where the strict native schema rejects them.                                                                                                                                     | AC-WH-012     | PASS   |
| DIS-VAL-004 | "Nothing displayable" is detected for an empty body, whitespace-only content and tts-only, and cleared by content, embeds, a poll or a file part.                                                                                   | AC-WH-013     | PASS   |
| DIS-SNW-001 | Surrogate snowflakes are decimal, fit 64 bits, are deterministic per id+timestamp, differ for distinct ids at one instant, order by creation time, encode the timestamp in the high bits, and clamp pre-epoch dates.                | AC-WH-012     | PASS   |
| DIS-ERR-001 | Zod issues become the Discord errors tree keyed by path with _errors leaves; a missing field maps to BASE_TYPE_REQUIRED; several paths coexist; the error helpers emit the documented bodies and no-store.                          | AC-WH-013     | PASS   |
| DIS-EMB-001 | Event-to-embed mapping for all five events: severity/status/level colour selection, the synthetic test-delivery card, omission of fields whose source value is absent, and clamping of oversized data back inside the embed limits. | AC-WH-014     | PASS   |
| DIS-EMB-002 | Slack attachments become embeds: text, named and hex colours, epoch ts to ISO timestamp, and a cap at ten cards.                                                                                                                    | AC-WH-012     | PASS   |
| DIS-DLV-001 | DISCORD_EXECUTE builds a username+embed body and sends no signature header; DISCORD_EVENTS builds the type-1 envelope, the type-0 PING, and a signature a Discord-style receiver verifies, failing on a tampered body or timestamp. | AC-WH-014/015 | PASS   |
| DIS-DLV-002 | retry_after is read from the 429 body first, then the header, and is null when neither is usable — a missing header must not read as "retry now".                                                                                   | AC-WH-014     | PASS   |

### 14.2 Ingress over the pipeline (integration, real database)

| ID          | Acceptance/evidence target                                                                                                                                                                       | Trace     | Status |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------ |
| DIS-ING-001 | Default success is 204 with an empty body and one stored message; wait=true returns 200 and a Discord message object whose id and channel_id are numeric strings.                                | AC-WH-012 | PASS   |
| DIS-ING-002 | embeds, avatar_url, tts and flags are persisted on the row; SUPPRESS_EMBEDS drops embeds while keeping the content; an absent username falls back to the webhook name.                           | AC-WH-012 | PASS   |
| DIS-ING-003 | An unknown webhook id and a bad secret both answer 401 with the Discord body and create nothing.                                                                                                 | AC-WH-013 | PASS   |
| DIS-ING-004 | 50006 for nothing displayable, 50035 with a field tree for a broken limit, 50035 on the embeds path for the 6000-character budget, 400 code 0 for unparseable JSON, 40005 for an oversized body. | AC-WH-013 | PASS   |
| DIS-ING-005 | X-RateLimit-* on success; 429 carries Retry-After, X-RateLimit-Scope and a body with message, numeric retry_after and global false.                                                              | AC-WH-013 | PASS   |
| DIS-ING-006 | Idempotency-Key creates once and replays the same id; a non-ASCII key is a 50035 form-body error.                                                                                                | AC-WH-012 | PASS   |
| DIS-ING-007 | multipart/form-data reads the body from payload_json; a file-only request succeeds with empty content and an empty attachments array (accepted, not stored).                                     | AC-WH-012 | PASS   |
| DIS-ING-008 | GET returns a Discord webhook object (type 1, null guild/application, self URL); a bad secret answers 401.                                                                                       | AC-WH-012 | PASS   |
| DIS-ING-009 | The /slack suffix turns text and attachments into content and embeds and defaults wait to true, while an explicit wait=false still answers 204.                                                  | AC-WH-012 | PASS   |

### 14.3 Egress formats (integration, real database)

| ID          | Acceptance/evidence target                                                                                                                                 | Trace     | Status |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ------ |
| DIS-EGR-001 | Format defaults to INSPOT with no key pair; DISCORD_EVENTS mints an Ed25519 pair, keeps the public half out of the stored ciphertext, and enqueues a PING. | AC-WH-015 | PASS   |
| DIS-EGR-002 | Switching an existing webhook to DISCORD_EVENTS mints the missing key pair without re-issuing the signing secret.                                          | AC-WH-015 | PASS   |
| DIS-EGR-003 | DISCORD_EXECUTE posts a one-embed body with no signature header, marks the delivery DELIVERED and clears the failure counter.                              | AC-WH-014 | PASS   |
| DIS-EGR-004 | A 429 carrying retry_after 42 schedules the retry about 42 s out, not on the generic 30 s to 6 h ladder.                                                   | AC-WH-014 | PASS   |
| DIS-EGR-005 | DISCORD_EVENTS posts a signed type-1 envelope verifiable with the published public key, a type-0 PING with no event body, and retries on the 1 s ladder.   | AC-WH-015 | PASS   |
| DIS-EGR-006 | Auto-disable trips exactly at WEBHOOK_AUTO_DISABLE_AFTER; a manual re-enable clears the counter; a merely retrying delivery does not increment it.         | AC-WH-015 | PASS   |
| DIS-EGR-007 | INSPOT still sends the original envelope with X-Inspot-Signature and X-Inspot-Event and the delivery id in the body.                                       | AC-WH-014 | PASS   |

### 14.4 UI and published contract

| ID          | Acceptance/evidence target                                                                                                                                                                                                    | Trace         | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| DIS-UI-001  | Embed cards: nothing rendered for an empty list, every part of a full embed rendered, one card per embed, accent bar coloured from the integer with a neutral fallback.                                                       | AC-WH-012     | PASS   |
| DIS-UI-002  | Hostile input degrades: a javascript: title URL renders as text with no anchor, a data: image URL renders no img, an unparseable timestamp renders no time element and never "Invalid Date".                                  | AC-WH-012     | PASS   |
| DIS-DOC-001 | specs/openapi.json declares the Discord operations with the documented limits, the 200/204/400/401/413/429/500 response set, rate-limit headers and a sensitive path token; its example validates against the runtime schema. | AC-WH-012/013 | PASS   |
| DIS-DOC-002 | Help documents the Discord block for Messages in both locales, keeps the en and ru key sets identical, and keeps the sample on placeholders with no 48-hex token.                                                             | AC-WH-012     | PASS   |

**Not covered.** No Playwright spec exercises the Discord route end to end in a
browser. The surface is a server API plus a presentational card, both covered
above, and a browser case would only re-assert them through a slower harness.
The credentialed screenshot of an embed card in the running application is
therefore the one piece of visual evidence still owed at the next demo
checkpoint.

---

## 15. Agent-facing Messages management API (2026-08-05)

Covers AC-MSG-015..021 (`docs/prd.md` FR-MSG-004, `docs/architecture.md` §6.6).
The section publishes one capability through two surfaces, so the coverage is
deliberately paired: every property that could drift between the MCP tools and
the REST family is asserted on both sides rather than on the shared service
they call. Authorization is the highest-risk property here — this is the first
non-ingest surface reachable without a session — and is therefore tested with
real tokens against the real handlers rather than with a mocked auth layer.

### 15.1 Contract and presentation units (no database)

| ID          | Acceptance/evidence target                                                                                                                                                              | Trace         | Status |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------ |
| MGA-SCP-001 | `MCP_SCOPES` gains `messages:read`/`messages:write`; `parseScopes` still drops unknown persisted values, and a token holding every scope sees exactly `ALL_TOOLS`.                        | AC-MSG-015    | PASS   |
| MGA-SCP-002 | A full-scope Messages token is advertised exactly ten tools, listed by name — the absence of any delete operation is pinned as an exact catalogue, so adding one has to fail here first.  | AC-MSG-018    | PASS   |
| MGA-UI-001  | The token permission picker renders one checkbox per declared scope and names each domain group, so the seven identically labelled read boxes stay distinguishable to assistive tech.     | AC-MSG-015    | PASS   |
| MGA-UI-002  | The feed labels all four origins distinctly — `AGENT` → «Агент» beside operator, webhook and legacy — in one rendered timeline.                                                          | AC-MSG-017    | PASS   |
| MGA-DOC-001 | `specs/openapi.json` declares all ten operations with bearer security, the shared error envelope, `WWW-Authenticate` on 401, `Retry-After` on 429, and no body on 500.                    | AC-MSG-015/021 | PASS   |
| MGA-DOC-002 | Each documented request example validates against the runtime zod schema and is rejected once an unknown field is added, proving the published contract is the strict one.                | AC-MSG-021    | PASS   |
| MGA-DOC-003 | The issued webhook URL is marked sensitive with no example, and the listing schema carries no `url` property at all.                                                                      | AC-MSG-019    | PASS   |
| MGA-DOC-004 | `scripts/check-public-openapi.mjs` pins the 13-path inventory and the methods allowed per path, and every operation id is present and unique.                                             | AC-MSG-015    | PASS   |

### 15.2 REST family over the real handlers (integration, real database)

| ID          | Acceptance/evidence target                                                                                                                                                                | Trace      | Status  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------- |
| MGA-API-001 | No token, an unknown secret, a revoked token, a channel-scoped webhook token and a scopeless ingest token each answer 401 with a bearer challenge and `no-store`.                          | AC-MSG-015 | PENDING |
| MGA-API-002 | A `messages:read` token answers 403 `FORBIDDEN` on a write and creates nothing.                                                                                                            | AC-MSG-015 | PENDING |
| MGA-API-003 | An empty name answers 400 `VALIDATION_FAILED` with issues; an unknown field is rejected rather than ignored.                                                                               | AC-MSG-021 | PENDING |
| MGA-API-004 | Category and channel creation answer 201 once and 200 with the same id on a case-differing repeat.                                                                                         | AC-MSG-016 | PENDING |
| MGA-API-005 | Rename returns the new name for both a category and a channel; the listing carries each category's channels.                                                                              | AC-MSG-015 | PENDING |
| MGA-API-006 | A posted message stores origin `AGENT` and the token's name as author; an explicit author is kept; the message is readable through the listing.                                            | AC-MSG-017 | PENDING |
| MGA-API-007 | A foreign-workspace category or channel id answers 404 and nothing is created in either workspace.                                                                                         | AC-MSG-020 | PENDING |
| MGA-API-008 | Webhook creation answers 201 with `Referrer-Policy: no-referrer` and the tokenized URL; the listing exposes neither `url` nor `tokenHash`; revoke answers 200 and stamps `revokedAt`.      | AC-MSG-019 | PENDING |

### 15.3 MCP tools over the real JSON-RPC endpoint (integration, real database)

| ID          | Acceptance/evidence target                                                                                                                                          | Trace      | Status  |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| MGA-MCP-001 | `message_categories_list` returns the seeded category with its channel; `messages_list` pages the same feed the REST surface serves.                                | AC-MSG-015 | PENDING |
| MGA-MCP-002 | `message_category_create` reports `created: true` once and `created: false` with the same id for a case-differing repeat.                                           | AC-MSG-016 | PENDING |
| MGA-MCP-003 | `message_channel_create` followed by `message_channel_rename` persists the new name.                                                                                 | AC-MSG-015 | PENDING |
| MGA-MCP-004 | A foreign-workspace category or channel yields a tool error and writes nothing — asserted for both channel creation and `message_send`.                             | AC-MSG-020 | PENDING |
| MGA-MCP-005 | `message_send` stores origin `AGENT` with the token name as author and the message is readable back through `messages_list`.                                        | AC-MSG-017 | PENDING |
| MGA-MCP-006 | `channel_webhook_create` returns a URL under the created webhook's id, the listing carries no secret, and `channel_webhook_revoke` stamps `revokedAt`.              | AC-MSG-019 | PENDING |
| MGA-MCP-007 | A `messages:read` token is advertised exactly the three read tools, and calling `message_send` with it errors without storing the message.                          | AC-MSG-015 | PENDING |

### 15.4 Live verification against a running server (manual, dated)

Recorded 2026-08-05 against the dev server on port 3801 with a real scoped
token issued directly into the dev database and deleted afterwards. This is
evidence of the assembled system, not a substitute for §15.2/§15.3.

| ID          | Acceptance/evidence target                                                                                                                                       | Trace          | Status |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------- | ------ |
| MGA-RUN-001 | Unauthenticated read answers 401 with a bearer challenge; the proxy does not redirect `/api/v1/**` to `/login`.                                                  | AC-MSG-015     | PASS   |
| MGA-RUN-002 | Category create answers 201 then 200 with the same id for a case-differing name; channel create and rename answer 201/200.                                       | AC-MSG-016     | PASS   |
| MGA-RUN-003 | A posted message reads back with `origin=AGENT` and the token name as author, through both the REST listing and `messages_list`.                                  | AC-MSG-017     | PASS   |
| MGA-RUN-004 | The issued webhook URL accepts a real delivery (201), is absent from the listing, and answers 401 for the same delivery after revocation.                        | AC-MSG-019     | PASS   |
| MGA-RUN-005 | An empty name answers 400 `VALIDATION_FAILED`; an unknown id answers 404 `NOT_FOUND`; `tools/list` advertises exactly the ten Messages tools for a scoped token. | AC-MSG-020/021 | PASS   |

**Why §15.2 and §15.3 are PENDING.** Both suites are authored, collected and
type-checked, and neither has been executed: the test database was never
started in the session that wrote them, because every `test:db:*` script
refuses to run without `ALLOW_TEST_DB_RESET=1`, which that session could not
set. They become PASS after:

```
ALLOW_TEST_DB_RESET=1 pnpm test:db:up && ALLOW_TEST_DB_RESET=1 pnpm test:db:migrate
pnpm test:integration
```

The migration step is not optional — `MessageOrigin.AGENT` does not exist in a
test database created before `20260805120000_message_origin_agent`, so
MGA-API-006 and MGA-MCP-005 would fail at the enum rather than at the assertion.

**Not covered.** No Playwright spec drives this API: it has no UI of its own,
and the two visible consequences it does have — the «Агент» badge and the
«Сообщения» permission group — are asserted by MGA-UI-002 and MGA-UI-001 at the
component level. The Activity journal entries the REST writes produce are
verified only by reading the code path; no case asserts a stored `Activity`
row, which is the one gap worth closing if this API grows further.
