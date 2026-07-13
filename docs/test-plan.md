# Test Plan & Traceability Matrix — inspoter Slice 1

**Owner:** tester
**Status:** Slice 1 — Mode B (green) — full suite passing after backend-dev/frontend-dev implementation, per plan.md §5.2/§10 (T-1 two-mode tester protocol). Re-verified 2026-07-12 after backend code-review fixes (§4c) — still fully green. **Slice WS (Workspaces, §3.2, added 2026-07-13) — PARTIAL: only the pre-existing Bookmarks service suite was updated for workspace-scoping; no dedicated workspace API/e2e tests exist yet, and Slice WS has not been through the Mode A/B protocol (plan.md §5a records this as a process deviation).**
**Scope:** Slice 0 test-infra exit gate (plan.md §4.2 item 13) + Slice 1 tracer bullet (AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014, M-1..M-3, M-8) + Slice WS workspace coverage (§3.2, partial)
**Normative inputs:** `docs/prd.md` v2.1+ (AC-IDs, §3.0/§3.1, §3.10 Workspaces), `docs/design.md` v1.1 (selectors/copy), `docs/plan.md` v1.4 §5.1 (frozen contracts), §5.2 (Mode A task table), §5a (Slice WS), §10 (DoD)

---

## 1. How to read this matrix

- **Status `PASS`** = Mode B: the test is authored, targets a real AC, and is currently green against the real implementation.
- Mode A (`docs/test-plan.md` history) recorded every row as `RED` with a classified reason (`assertion` / `missing route/page` / `module not found` / `stub throws`) before implementation started. This revision flips every row to `PASS` — no assertion was weakened, no test was skipped/only'd, and no test was deleted to get there (Test Integrity rule). Where a test itself had a defect (see §4a), the defect is documented and the fix is described; the assertions were not loosened.

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

## 3. Slice 1 traceability matrix (Mode B — all PASS)

### 3.0 Shell & Auth

| AC-ID                                                                                          | Test file : case                                                                                                                                                                  | Status               |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| AC-SHELL-001                                                                                   | `e2e/shell.spec.ts` : "navigation lists all seven sections"                                                                                                                       | PASS                 |
| AC-SHELL-002                                                                                   | `e2e/shell.spec.ts` : "clicking a nav link routes client-side (no full page reload)"                                                                                              | PASS                 |
| AC-SHELL-003                                                                                   | `e2e/shell.spec.ts` : "AC-SHELL-003" describe block, 6 cases (Domains/Servers/Mail/Messages/Logs/Alerts)                                                                          | PASS                 |
| — (Settings placeholder, smoke only per plan §5.4 tester note — not an AC-SHELL-003 assertion) | `e2e/shell.spec.ts` : "Settings placeholder renders"                                                                                                                              | PASS                 |
| AC-SHELL-004                                                                                   | `e2e/shell-responsive.spec.ts` : "shell renders with no horizontal overflow" (runs on `desktop-1440` and `mobile-375` projects)                                                   | PASS (both projects) |
| AC-AUTH-001 / M-3                                                                              | `e2e/auth.spec.ts` : 8 parametrized cases, one per dashboard route (`/bookmarks`, `/domains`, `/servers`, `/mail`, `/messages`, `/logs`, `/alerts`, `/settings`)                  | PASS (all 8)         |
| AC-AUTH-002                                                                                    | `e2e/auth.spec.ts` : "valid env-seeded credentials establish a session and reach the dashboard"                                                                                   | PASS                 |
| AC-AUTH-002 (backend layer)                                                                    | `tests/unit/auth/session-contract.test.ts` : "resolves with the Operator when the `session` cookie matches..."                                                                    | PASS                 |
| AC-AUTH-002 (backend layer)                                                                    | `tests/unit/auth/login-action.test.ts` : "AC-AUTH-002: valid operator credentials establish a session"                                                                            | PASS                 |
| AC-AUTH-003                                                                                    | `e2e/auth.spec.ts` : "invalid credentials are rejected with a generic error and no session"                                                                                       | PASS                 |
| AC-AUTH-003 (backend layer)                                                                    | `tests/unit/auth/login-action.test.ts` : "AC-AUTH-003: invalid credentials are rejected..."                                                                                       | PASS                 |
| AC-AUTH-004                                                                                    | `e2e/auth.spec.ts` : "logout invalidates the session and subsequent requests redirect to login"                                                                                   | PASS                 |
| AC-AUTH-005                                                                                    | `e2e/auth.spec.ts` : "operator env bootstrap — the seeded credentials authenticate on first boot"                                                                                 | PASS                 |
| AC-AUTH-005                                                                                    | `tests/unit/config/auth-env.test.ts` : 3 cases (fail-fast when absent; loads with `OPERATOR_PASSWORD_HASH`; `OPERATOR_PASSWORD_HASH` wins over `OPERATOR_PASSWORD` when both set) | PASS                 |
| NFR-A11Y-001 / M-8                                                                             | `e2e/a11y.spec.ts` : "Login screen has zero critical accessibility violations"                                                                                                    | PASS                 |
| NFR-A11Y-001 / M-8                                                                             | `e2e/a11y.spec.ts` : "Shell + Bookmarks screen has zero critical accessibility violations"                                                                                        | PASS                 |

### 3.1 Bookmarks

| AC-ID     | Test file : case                                                                                                                                                                                                                                                                | Status |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| AC-BM-001 | `e2e/bookmarks.spec.ts` : "creating a category persists..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-001: creates a category..."                                                                                                                                      | PASS   |
| AC-BM-002 | `e2e/bookmarks.spec.ts` : "renaming a category persists..." · `tests/unit/services/bookmarks.test.ts` : "persists the new name"                                                                                                                                                 | PASS   |
| AC-BM-003 | `e2e/bookmarks.spec.ts` : "AC-BM-003/004: deleting a category with bookmarks warns, then cascades on confirm"                                                                                                                                                                   | PASS   |
| AC-BM-004 | same case as AC-BM-003 (combined per plan.md §5.2 grouping) · `tests/unit/services/bookmarks.test.ts` : "removes the category and cascades delete..."                                                                                                                           | PASS   |
| AC-BM-005 | `e2e/bookmarks.spec.ts` : "submitting an empty category name shows a validation error..." · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-005" describe (3 cases)                                                                                                          | PASS   |
| AC-BM-006 | `e2e/bookmarks.spec.ts` : "creating a bookmark shows it in its category..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-006: creates a bookmark..."                                                                                                                      | PASS   |
| AC-BM-007 | `e2e/bookmarks.spec.ts` : "bookmark create without name/url shows a validation error..." · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-007" describe (2 cases)                                                                                                           | PASS   |
| AC-BM-008 | `e2e/bookmarks.spec.ts` : "an invalid (non-http/https) URL shows a validation error" · `tests/unit/validation/bookmarks.test.ts` : "AC-BM-008" describe (3 cases)                                                                                                               | PASS   |
| AC-BM-009 | `e2e/bookmarks.spec.ts` : "editing a bookmark persists name/url/category changes" · `tests/unit/services/bookmarks.test.ts` : "AC-BM-009: edits an existing bookmark's fields..."                                                                                               | PASS   |
| AC-BM-010 | `e2e/bookmarks.spec.ts` : "deleting a bookmark removes it..." · `tests/unit/services/bookmarks.test.ts` : "AC-BM-010: deletes a bookmark"                                                                                                                                       | PASS   |
| AC-BM-011 | `e2e/bookmarks.spec.ts` : "a bookmark without an icon shows a deterministic fallback..."                                                                                                                                                                                        | PASS   |
| AC-BM-012 | `e2e/bookmarks.spec.ts` : "bookmarks are displayed grouped under their category" (incl. a negative cross-check that category A's bookmark does not leak into B's section) · `tests/unit/services/bookmarks.test.ts` : "AC-BM-012: list() groups bookmarks under their category" | PASS   |
| AC-BM-013 | `e2e/bookmarks.spec.ts` : "activating a bookmark opens its URL in a new tab"                                                                                                                                                                                                    | PASS   |
| AC-BM-014 | `e2e/bookmarks.spec.ts` : "empty state prompts to create the first category (no error)"                                                                                                                                                                                         | PASS   |

**M-1 (Slice 1 completeness):** 100% of the 23 Slice 1 AC-IDs (AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014) are `PASS` above.
**M-2 (Bookmarks CRUD correctness, incl. validation rejections):** covered compositely by the AC-BM-001/002/004/006/009/010 (persistence, verified across a `router.refresh()` re-render, functionally equivalent to a reload since data comes from the server component on every navigation) and AC-BM-005/007/008 (validation rejection) rows above.
**M-3 (Auth enforcement):** `e2e/auth.spec.ts`'s 8-route parametrized block — zero dashboard routes reachable unauthenticated.
**M-7 (Deployability, login-screen form):** exercised indirectly — `playwright.config.ts`'s `webServer` runs the real `npm run build && npm run start` production path (not `next dev`) and every e2e test depends on it serving `/login` correctly.
**M-8 (Accessibility baseline):** `e2e/a11y.spec.ts`, both cases `PASS` — zero critical axe violations on Login and Shell+Bookmarks.

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

Per the coordinator's Mode B dispatch instruction: classify every red as **defect-in-implementation** (report only, do not fix `src/**`) or **defect-in-test** (fix the test). All reds encountered in this Mode B pass were **defects in the test harness/test code**, not in `src/**`. None required a source-code fix; none are outstanding.

### 4a. Test defects found and fixed (tester-owned files only)

1. **`tests/unit/auth/login-action.test.ts` fixture used a fake hash.** The AC-AUTH-002 fixture seeded `Operator.passwordHash` with the literal string `"scrypt-placeholder:Test1234!"` instead of a real `salt:hex` scrypt hash, so the real `verifyPassword()` correctly returned `false` and the assertion failed. **Fix:** seed via the real `hashPassword()` from `src/lib/auth/password.ts` (already the pattern this file's own header comment described as the goal). This is a fixture correctness fix, not an assertion change — the assertion (`{ ok: true }`) was never touched.
2. **`e2e/utils/auth.ts`'s `login()` helper returned before the login actually completed.** `login()` clicked "Sign in" and returned immediately; the `login` Server Action + client-side `router.push`/`refresh` are asynchronous and were not awaited by the click. Any caller that immediately issued its own `page.goto(...)` (every `beforeEach` in `bookmarks.spec.ts`, the AC-SHELL-003 loop, the Settings-smoke case, and the second `a11y.spec.ts` case) raced the in-flight login request — the browser's own navigation aborted the pending request, no session cookie was ever set, and the subsequent `goto()` landed back on `/login` via the middleware redirect. Tests that instead polled with `expect(...).toBeVisible()` right after `login()` (e.g. AC-SHELL-001/002, all of `auth.spec.ts`) happened to give the in-flight request enough time and passed by coincidence. **Fix:** `login()` now waits for the outcome to settle — either navigation away from `/login` (success) or the error banner appearing (rejection) — via `Promise.race([page.waitForURL(...), errorLocator.waitFor(...)])` before returning. This fixed 20 of the then-failing tests in one change; verified deterministic across 2 repeat full-suite runs (`--workers=6` and `--workers=4`) before and after — same failures both times, ruling out a load-related flake and confirming a real race.
3. **`e2e/bookmarks.spec.ts`'s `createBookmark()` helper used an unscoped `.first()` for the "Add bookmark" ghost button.** With more than one category section rendered (the common case once several tests in the file have run), `.first()` always clicked whichever category happened to be first in DOM order, not the category the test intended — bookmarks silently landed in the wrong category. This was masked in tests that didn't assert _which_ category a bookmark ended up in (AC-BM-006/007/008/011 passed anyway) but surfaced as real assertion failures in tests that do check grouping/counts (AC-BM-012's grouping check, AC-BM-003/004's "contains N bookmark(s)" cascade-warning count). **Fix:** added a `categorySection(page, name)` helper (`page.locator("section").filter({ has: <heading> })`) and scoped every "Add bookmark" click through it; added an explicit negative cross-check in AC-BM-012 (category A's bookmark must not appear under category B) to guard against this exact class of bug recurring silently.
4. **Same file, category-vs-bookmark "More options" button ambiguity.** Once a category has at least one bookmark, `categorySection(name).getByRole("button", { name: /more options/i })` matches two elements — the category's own overflow menu and the one bookmark card's overflow menu inside the same `<section>` — a Playwright strict-mode violation. **Fix:** `.first()` scoped _within_ the category section (not page-wide) reliably selects the category-level button, because `category-section.tsx` always renders the header row (and its button) before the bookmark grid in DOM order; documented inline in the test.
5. **`vitest.config.ts` needed `dotenv/config`.** Vitest, unlike Next.js, doesn't auto-load `.env`; without it `DATABASE_URL` etc. were `undefined` in the test process even though the file existed. Fixed once, during Mode A, and unaffected by Mode B (documented for completeness since it's load-bearing for every DB-touching test in this suite).

None of the above changed what any test asserts — every fix was either a fixture-correctness fix (item 1), a test-timing/synchronization fix (item 2), or a locator-scoping fix (items 3–4) that makes the test actually exercise the AC it claims to, rather than passing/failing for an unrelated reason.

### 4b. Implementation defects found

**None outstanding.** No `src/**` defect was found during this Mode B pass — every red encountered traced to the test harness (§4a). This is recorded explicitly because "no implementation defects found" is itself a reportable finding, not a gap in the walkthrough (this tester independently read every relevant source file — `password.ts`, `session.ts`, `dal.ts`, `login/actions.ts`, `middleware.ts`, `seed.ts`, `services/bookmarks.ts`, `env.ts`, all of `components/shell/**` and `components/bookmarks/**` — before writing the Mode B fixes above, specifically to distinguish "the test is wrong" from "the app is wrong" per the coordinator's instruction not to paper over a real defect).

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
- **DB isolation strategy for Playwright e2e:** the suite runs against the same real Postgres the dev/prod server uses, with no transactional rollback or disposable schema. Mitigated by: (a) `e2e/bookmarks.spec.ts` running its tests in declared order within one worker (no `fullyParallel`), with the empty-state assertion first; (b) this tester manually truncating `Category`/`Bookmark`/`Session` between full-suite runs during this dispatch to get deterministic baselines. **Residual risk for CI:** an automated pipeline re-running this suite repeatedly against a persistent DB will accumulate categories/bookmarks across runs; AC-BM-014's empty-state assertion will start failing once prior runs' data persists. Recommend a `docker compose down -v && up` (fresh volume) or an explicit `TRUNCATE` step before each CI e2e run — not implemented here because it's a CI/pipeline concern outside `tests/**`/`e2e/**` ownership.
- **Load/perf testing (NFR-PERF-001/002):** not applicable to Slice 1 (no paginated list ships in this slice).
- **Cross-browser matrix (Firefox/Safari):** Playwright config only wires Chromium-based projects; not required by any Slice 1 AC-ID.

---

## 6. Evidence (fresh runs, Mode B)

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

**DoD cross-check (plan.md §10.1):** all 23 Slice 1 AC-IDs have ≥1 authored test, all `PASS`; this document is the traceability matrix; `npm run test` and `npm run test:e2e` are green (fresh output above — `lint`/`typecheck` are outside tester scope, owned by implementor/dev roles per plan.md §4.2 item 13 note); layer-boundary/NFR sign-off is code-reviewer's remaining step per plan.md §5.5.
