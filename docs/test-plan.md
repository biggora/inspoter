# Test Plan & Traceability Matrix — inspoter Slice 1

**Owner:** tester
**Status:** Historical Slice 1 Mode B runtime was green on 2026-07-12. The rewritten R2.0-I3 E2E suite is currently **PENDING_REVALIDATION** until the dedicated-database runtime gate; prior unit-test PASS evidence remains valid. **Slice WS (Workspaces, §3.2, added 2026-07-13) remains PARTIAL:** only the pre-existing Bookmarks service suite was updated for workspace scoping; no dedicated workspace API/E2E tests exist yet.
**Scope:** Slice 0 test-infra exit gate (plan.md §4.2 item 13) + Slice 1 tracer bullet (AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014, M-1..M-3, M-8) + Slice WS workspace coverage (§3.2, partial)
**Normative inputs:** `docs/prd.md` v2.1+ (AC-IDs, §3.0/§3.1, §3.10 Workspaces), `docs/design.md` v1.1 (selectors/copy), `docs/plan.md` v1.4 §5.1 (frozen contracts), §5.2 (Mode A task table), §5a (Slice WS), §10 (DoD)

---

## 1. How to read this matrix

- **Status `PASS`** records either the dated 2026-07-12 Mode B evidence or unchanged unit-test evidence; it does not imply that the rewritten I3 E2E suite has run.
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

### 3.2 Workspaces (Slice WS, added 2026-07-13 — coverage PARTIAL)

**Context:** Slice WS (plan.md §5a) was implemented between Slice 1 and Slice 2, outside the tester-Mode-A-first workflow that governs every other slice in this document (§2). This section records what test coverage exists today, distinct from what plan.md §5a and progress.md Task 18 already flag as an open process gap.

| Item                                                                                                                                      | File                                    | Status     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | ---------- |
| `tests/unit/services/bookmarks.test.ts` — all 7 pre-existing cases updated to pass `workspaceId` and assert workspace-scoped reads/writes | `tests/unit/services/bookmarks.test.ts` | PASS (7/7) |

| AC-ID     | Description (docs/prd.md §3.10)                                       | Test coverage                                                                                                        | Status                             |
| --------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| AC-WS-001 | Default workspace auto-created on first operator bootstrap/seed       | None                                                                                                                 | **PENDING**                        |
| AC-WS-002 | Workspace create (name required, unique slug, creator becomes owner)  | None                                                                                                                 | **PENDING**                        |
| AC-WS-003 | Workspace rename persists everywhere the name is displayed            | None                                                                                                                 | **PENDING**                        |
| AC-WS-004 | Workspace delete cascades all scoped content; session falls back      | None                                                                                                                 | **PENDING**                        |
| AC-WS-005 | Owner adds an existing operator to the workspace by username          | None                                                                                                                 | **PENDING**                        |
| AC-WS-006 | Owner invites a new username → new operator created + added as member | None                                                                                                                 | **PENDING**                        |
| AC-WS-007 | Owner removes a member; access to that workspace revoked              | None                                                                                                                 | **PENDING**                        |
| AC-WS-008 | Two members of the same workspace independently see the same content  | None                                                                                                                 | **PENDING**                        |
| AC-WS-009 | Switching active workspace persists on `Session.activeWorkspaceId`    | None                                                                                                                 | **PENDING**                        |
| AC-WS-010 | Workspace switcher updates dashboard content without full reload      | None                                                                                                                 | **PENDING**                        |
| AC-WS-011 | Content sections never mix data across workspaces                     | Indirect only — `bookmarks.test.ts` asserts `list()` is scoped by `workspaceId`, i.e. the Bookmarks facet of this AC | **PARTIAL (Bookmarks facet only)** |

**Not covered (residual gaps, tracked for a follow-up tester dispatch):**

- No API route tests for `src/app/api/workspaces/**` (create/rename/delete/members/switch) — every route in plan.md §5a's file list is currently unverified by an automated test.
- No e2e coverage of the workspace switcher UI (`workspace-switcher.tsx`) or the Settings workspace-management screen (`settings/workspace/page.tsx`).
- No test for the custom backfill migration (`20260713042150_add_workspaces`) beyond the implementor's manual verification (progress.md Task 18) that it applies cleanly.
- No negative/cross-workspace-leakage test beyond the Bookmarks-service facet of AC-WS-011 — Domains/Servers/Mail/Messages/Logs/Alerts will need their own AC-WS-011 facet checks once those sections exist and are workspace-scoped.

**Recommendation:** before Slice 2 builds further on top of Slice WS, run a dedicated tester Mode A/B pass against AC-WS-001..011 per the standard protocol (plan.md §2), closing the process deviation noted in plan.md §5a.

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
