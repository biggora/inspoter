# Progress Ledger — UI audit remediation (specs/audit-ui.md)

Separate ledger file: the repo's existing `docs/progress.md` belongs to the earlier remediation-plan effort and was not overwritten.

**Goal**: Verify all findings in specs/audit-ui.md and fix every confirmed defect (UI-001..UI-004).

**Authoritative source**: `specs/audit-ui.md` (user-provided audit report; normative — no PRD re-derivation).

## Profile

- **Profile**: Standard
- **Triage score**: 2 (files>10: 1, novel pattern: 0, ambiguous: 0, irreversible risk: 0, parallelizable: 1). Escalated from Micro: 4 independent findings across >10 files do not fit Micro's single-agent ≤3-file shape.
- **Run counter**: 6 total (1 Explore + 2 frontend-dev + 1 tester + 1 frontend-dev rework + 1 code-reviewer) — within the ≤8 Standard envelope

## Acceptance criteria

- **AC-1 (UI-001)**: Marketing landing `/ru/` and `/lv/` fully localized; strings in `src/messages/{en,ru,lv}/marketing.json`; e2e rejects English marketing copy on ru/lv.
- **AC-2 (UI-002)**: `/settings/webhooks` in en/ru/lv renders translated `mcpAuthHint`; no raw key; no `IntlError: UNCLOSED_TAG`.
- **AC-3 (UI-003)**: `/messages` exposes exactly one `<main>`; timeline pane is a labelled non-main region.
- **AC-4 (UI-004)**: `/settings/api-docs` exposes exactly one page-level `<main>`.
- **AC-5**: `pnpm lint`, `pnpm typecheck`, `pnpm test:unit` green; targeted e2e green.

## Task table

| Slice | Scope | Agent | Status | Evidence summary |
|---|---|---|---|---|
| 0 | Verify findings UI-001..UI-004 | Explore | DONE | 4/4 CONFIRMED with file:line evidence |
| 1 | UI-001 marketing i18n | frontend-dev A | DONE | marketing.json ×3 + 9 components via getTranslations; typecheck/lint/unit 1917/1917 exit 0; curl smoke: /ru,/lv localized, en intact; e2e spec written (not run) |
| 2 | UI-002+UI-003+UI-004 | frontend-dev B | DONE_WITH_CONCERNS | t.rich mcpAuthHint; section aria-label timelineRegion; main→div normalization; typecheck/lint/unit exit 0; e2e assertions written (not run) |
| 3 | Full validation incl. Playwright | tester | BLOCKED (AC-2) | AC-1/3/4/5 PASS; 20/21 e2e; AC-2 FAIL: `<token>` tag unclosed in settings.json ×3 → t.rich INVALID_MESSAGE; fixed test code e2e/api-docs.spec.ts (import.meta → process.cwd()) |
| 2R | AC-2 rework: close rich tag in 3 catalogs | frontend-dev B (resume) | DONE | settings.json ×3 closed `<token>token</token>`; createTranslator proof ×3 locales; build exit 0; playwright settings-webhooks-copy 1 passed (6.7s) |
| 4 | Cross-cutting code review | code-reviewer | DONE | 0 BLOCKER/MAJOR/MINOR; 2 NITs (theoretical post-swap main re-creation in swagger; spec hard-codes en sentence instead of importing bundle) |

Final coordinator Evidence: combined Playwright run of all 4 specs → **21 passed (35.0s)**, incl. the previously failing webhooks test (ok 16).

## Decisions log

- Audit report is the spec; thin delta = numbered plan in conversation. Skipped: PRD/architecture/planner/debate — authoritative spec exists (Standard profile).
- Slices 1 and 2 ran in parallel: disjoint file scopes.
- Slice 1 disclosed scope extension: `src/i18n/messages.ts` (manual namespace registration — without it marketing.json never loads). Accepted.
- Implementers ran typecheck/lint/unit only; Playwright run once by tester to avoid parallel runs. R2.0 harness facts discovered: Playwright builds and runs `next start` on port 3910 with `reuseExistingServer: false`, needs test DB prepared on 3833 (container inspoter-test-db-manual; `docker start` if stopped, never `test-db up`).
- UI-002 root cause refined by tester: next-intl `t.rich` requires a CLOSED tag `<token>chunks</token>`; slice 2 left it unclosed. Rework: close the tag in en/ru/lv `settings.json` (inner text stays literal `token` in all locales).
- Tester fixed e2e test code within its scope (api-docs.spec.ts import.meta issue); implementers must not revert it.
- Per-slice code reviews deferred to one cross-cutting review (Phase 4).

## Open questions

None.

## Session state

- Phase: 5 (Report) — task COMPLETE
- Slice: all done (0, 1, 2, 3, 2R, 4)
- Re-dispatch attempts: slice-2/frontend-dev: 1 (resolved on attempt 2)
- Next pending action: none — all ACs PASS; changes left uncommitted in the working tree (user did not request a commit)
