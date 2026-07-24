# Mail Labels and Filtering Integration Plan

**Status:** Phase 6 remediation complete; awaiting user verification

**Version:** 0.4

**Scope:** Mail labels, automatic filter rules, list highlighting, and label-based filtering

**Target:** Inspoter Mail section

## 1. Outcome

Add local, workspace-scoped labels with persisted message assignments. Filter
rules automatically assign labels to matching future mail. Compact label chips
appear beside the message subject in the existing Mail list.

The first milestone proves one complete operator flow:

1. Open a message.
2. Choose **Filter messages like this**.
3. Create or select a label.
4. Save an exact-sender rule.
5. Receive another matching message.
6. See the label beside its subject.

## 2. MVP Decisions

- Labels are shared across the active workspace.
- Labels exist only in Inspoter. Gmail labels, `X-GM-LABELS`, and IMAP keyword
  synchronization are out of scope.
- All active-workspace members manage label definitions, automatic filter
  rules, manual assignments, and list filtering.
- Rules target one mail account and incoming messages.
- Initial criteria are exact sender and subject substring.
- When both criteria are present, they use AND semantics.
- One rule applies one target label.
- Existing label assignments remain after a rule is edited, disabled, or
  deleted.
- **Apply to existing mail** is optional and unchecked by default.

Deferred Gmail-like capabilities:

- regex and arbitrary OR groups
- nested labels
- body-content matching
- forwarding, deletion, archiving, spam, and read-state rule actions
- remote provider label synchronization
- per-user private labels

## 3. Architecture

### 3.1 Persistence strategy

Use persisted many-to-many assignments. Do not derive labels dynamically while
listing messages and do not store label IDs in JSON.

Persisted assignments support manual labels, stable historical behavior,
indexed filtering, and deterministic pagination. Rule deletion does not change
previously labeled mail.

### 3.2 Prisma models

#### `MailLabel`

- `id`
- `workspaceId`
- `name`
- `normalizedName`
- `color`
- `position`
- `createdAt`
- `updatedAt`
- unique `(id, workspaceId)`
- unique `(workspaceId, normalizedName)`
- index `(workspaceId, position, id)`

Suggested colors: `SLATE`, `RED`, `AMBER`, `GREEN`, `BLUE`, and `VIOLET`.
Color supplements visible text and never carries meaning alone.

Name normalization trims surrounding whitespace, collapses internal whitespace,
and uses canonical case normalization for uniqueness. Entered casing remains the
display value.

#### `MailItemLabel`

- `workspaceId`
- `mailItemId`
- `mailItemWorkspaceId`
- `labelId`
- `labelWorkspaceId`
- `appliedAt`
- unique `(mailItemId, labelId)`
- index `(workspaceId, labelId, mailItemId)`
- compound workspace-safe foreign keys to `MailItem` and `MailLabel`
- database checks requiring relation workspace columns to match `workspaceId`

Add unique `(id, workspaceId)` to `MailItem` for its compound relation.

Do not store one `appliedByRuleId` on this relation. Manual assignment and
multiple matching rules can produce the same message-label pair, making one
provenance field incorrect. Provenance and match counters are deferred.

#### `MailFilterRule`

- `id`
- `workspaceId`
- compound relation to one `MailAccount`
- compound relation to one `MailLabel`
- `name`
- `fromAddress`
- `subjectContains`
- `isActive`
- `position`
- `createdAt`
- `updatedAt`
- at least one populated predicate
- unique `(id, workspaceId)`
- index `(workspaceId, accountId, isActive, position, id)`

#### `MailFilterRun`

Add in the historical-backfill slice:

- `id`
- `workspaceId`
- rule reference
- immutable criteria and target-label snapshot
- status: `PENDING`, `RUNNING`, `COMPLETED`, or `FAILED`
- cutoff tuple: `(cutoffCreatedAt, cutoffId)`
- cursor tuple: `(cursorCreatedAt, cursorId)`
- processed and matched counts
- attempts and last error
- lease expiry
- start and completion timestamps
- partial unique index permitting one pending/running run per rule

Add `MailItem` index `(workspaceId, accountId, createdAt, id)` for backfill.

### 3.3 Limits

- 100 labels per workspace
- 100 active rules per account
- label name: 40 characters
- rule name: 80 characters
- sender criterion: 320 characters
- subject criterion: 200 characters
- no per-message label cap

Label/rule count limits must be enforced transactionally under a scoped
advisory lock. Database uniqueness prevents duplicate message-label pairs.

## 4. Matching and Execution

Use one pure TypeScript matcher for future-message evaluation and historical
backfill.

Canonical matching normalization:

1. Unicode NFKC normalization.
2. Trim surrounding whitespace.
3. Locale-stable lowercase conversion.
4. Exact comparison for sender.
5. Substring comparison for subject.

Do not implement backfill matching with PostgreSQL `ILIKE`; JavaScript and
database collation behavior can diverge.

Create a shared message-persistence seam used by:

- webhook ingestion in `src/lib/services/mail.ts`
- IMAP synchronization in `src/lib/services/mail-sync.ts`
- future eligible message sources

SMTP Sent copies remain outside incoming-rule scope for MVP.

For deterministic concurrent behavior:

- Every rule mutation and message-persistence transaction acquires the same
  transaction-scoped account advisory lock.
- Active rules load after the lock is acquired in `(position, id)` order.
- Message, attachment metadata, label assignments, and related state commit
  atomically.
- Webhook-event emission happens after commit.
- Assignment inserts use conflict-safe writes against unique
  `(mailItemId, labelId)`.

Current UIDVALIDITY handling deletes and recreates folder messages. Automatic
labels reapply during import. Manual labels may be lost. Do not restore them by
guessing through nullable or non-unique `Message-ID` values.

## 5. API Contracts

All routes require the existing active-workspace authentication contract,
strict Zod validation, workspace-scoped service queries, existing response
helpers, and non-disclosing 404 responses for foreign IDs.

### Labels

```text
GET    /api/mail/labels
POST   /api/mail/labels
PATCH  /api/mail/labels/[id]
DELETE /api/mail/labels/[id]
```

- Normalized duplicate names return `409 LABEL_NAME_CONFLICT`.
- Deleting a label referenced by a rule returns `409 LABEL_IN_USE`.
- Deleting an unreferenced label cascades its message assignments.

### Manual assignment

```text
PUT    /api/mail/[id]/labels/[labelId]
DELETE /api/mail/[id]/labels/[labelId]
```

Both operations are idempotent.

### Filter rules

```text
GET    /api/mail/filter-rules?accountId=...
POST   /api/mail/filter-rules
PATCH  /api/mail/filter-rules/[id]
DELETE /api/mail/filter-rules/[id]
```

### Historical runs

```text
GET  /api/mail/filter-runs/[id]
POST /api/mail/filter-runs/[id]/retry
```

### Existing Mail list

Extend `GET /api/mail` with `labelId`.

`labelId` intersects account, folder, unread, query, sort, and pagination.
List and detail DTOs gain:

```ts
labels: Array<{
  id: string;
  name: string;
  color: MailLabelColor;
}>;
```

List responses remain metadata-only. They never include message bodies or
attachment bytes.

Upgrade the keyset cursor to include workspace identity and a normalized filter
fingerprint. A cursor from another workspace or different account, folder,
label, query, unread state, or sort resets safely. UI filter changes always
reset pagination and selected detail.

## 6. User Experience

### Message list

Insert label chips beside the subject in
`src/components/mail/message-list.tsx`.

- Subject renders first.
- Chips remain noninteractive inside the existing row button.
- Show at most two chips in the desktop list column.
- Show one chip on narrow/mobile layouts.
- Collapse remaining labels into `+N`.
- Truncate long names while exposing full accessible text.
- Include label names in the row's accessible name.
- Keep subject truncation and prevent horizontal overflow at 375px.

### Sidebar

Add a Labels section below folders in the existing Mail sidebar and mobile
sheet. Selecting a label filters the current account/folder view. **All labels**
clears only the label facet.

### Reading pane

Add:

- complete applied-label display
- keyboard-accessible label picker
- **Filter messages like this** action
- sender-prefilled rule dialog
- inline label selection or creation

Dialogs and popovers must remain within mobile viewport and restore focus when
closed.

### Localization

Add all copy to:

- `src/messages/en/mail.json`
- `src/messages/ru/mail.json`

## 7. Numbered Development Checklist

Complete tasks in order. Each phase is an independently verifiable increment.
Do not start the next phase until its preceding phase gate is checked and the
user has verified the completed phase.

### Phase 1 — Architecture and contract preparation (Tasks 1–7)

1. [x] Record MVP decisions: workspace-scoped local labels, member-managed rules,
       member-managed message assignments, incoming account-scoped rules, and no
       remote Gmail/IMAP label synchronization.
2. [x] Add `FR-MAIL-008`, `FR-MAIL-009`, and `AC-MAIL-031..045` to
       `docs/prd.md` without changing existing acceptance-criterion IDs.
3. [x] Update `docs/architecture.md` with persisted-assignment rationale,
       workspace trust boundaries, authorization rules, matching semantics,
       advisory-lock protocol, scheduler ownership, and UIDVALIDITY limitation.
4. [x] Update `docs/design.md` with list-chip placement, overflow behavior,
       sidebar filtering, reading-pane controls, dialogs, mobile behavior, keyboard
       flow, and accessible naming.
5. [x] Define additive migration, deployment, feature exposure, data backup,
       and rollback strategy before changing schema.
6. [x] Extend `docs/test-plan.md` with service, API, concurrency, isolation,
       accessibility, responsive, migration, and performance coverage.
7. [x] Pass Phase 1 gate: confirm the PRD, architecture, design, migration,
       rollout, rollback, and test-plan documents are mutually consistent and pass
       a blocking-finding-free document review. Then stop execution and wait for
       user verification before starting Phase 2.

### Phase 2 — Slice 1: Exact-sender tracer (Tasks 8–26)

8. [x] Add `MailLabelColor`, `MailLabel`, `MailItemLabel`, and minimal
       `MailFilterRule` definitions to `prisma/schema.prisma`, including compound
       workspace relations, uniqueness constraints, and indexes.
9. [x] Create additive Prisma migration with raw workspace-equality checks and
       verify both fresh-database and existing-database application.
10. [x] Regenerate Prisma Client through project tooling; do not edit
        `src/generated` manually.
11. [x] Add Zod schemas for label creation and exact-sender rule creation,
        including normalization and documented field limits.
12. [x] Implement one pure canonical matcher using NFKC normalization, trimming,
        locale-stable lowercase conversion, and exact sender comparison.
13. [x] Add `mail-labels.ts` service with workspace-scoped create/list behavior,
        normalized uniqueness handling, authorization, and transactional limits.
14. [x] Add `mail-filter-rules.ts` service with account/label ownership checks,
        exact-sender creation/listing, stable rule order, and member authorization.
15. [x] Introduce shared message-label evaluation seam and transaction-scoped
        account advisory lock; load active rules only after acquiring the lock.
16. [x] Integrate evaluator into webhook mail persistence and emit webhook events
        only after database commit.
17. [x] Add minimal label and filter-rule create/list API routes using existing
        authentication, workspace-header, error-response, and Zod patterns.
18. [x] Extend Mail list/detail service projections and DTOs with bounded label
        metadata while keeping bodies and attachment bytes out of list responses.
19. [x] Extend `src/components/mail/api.ts` with typed label and exact-sender rule
        contracts.
20. [x] Add noninteractive `LabelChip` rendering beside subject in the existing
        message-row button.
21. [x] Add minimal **Filter messages like this** dialog that prefills account and
        sender and allows label selection or creation.
22. [x] Wire reading-pane action, dialog state, post-save refresh, and future
        matching-message chip display into `mail-client-view.tsx`.
23. [x] Add complete English and Russian strings for Slice 1 UI, validation,
        errors, empty states, and success feedback.
24. [x] Add unit, API, and component tests for normalization, workspace isolation,
        exact-sender matching, duplicate assignment prevention, DTO body omission,
        and chip rendering.
25. [x] Add Playwright tracer test: create filter through UI, ingest matching and
        nonmatching webhook messages, then verify only matching row shows label.
26. [x] Pass Phase 2 gate: Prisma validation, targeted tests, full unit suite,
        blocking-finding-free code review, and desktop/375px operator demo. Then
        stop execution and wait for user verification before starting Phase 3.

### Phase 3 — Slice 2: Manual labels and label browsing (Tasks 27–35)

27. [x] Complete label rename, recolor, reorder, and safe-delete services and API
        routes; return `409 LABEL_IN_USE` for rule-referenced labels.
28. [x] Add idempotent manual assignment/removal service and
        `PUT|DELETE /api/mail/[id]/labels/[labelId]` routes.
29. [x] Add `labelId` to Mail list validation and query composition so it
        intersects account, folder, unread, text query, sort, and workspace scope.
30. [x] Upgrade keyset cursor to carry normalized filter fingerprint and safely
        reset on workspace or filter mismatch.
31. [x] Add Labels section to desktop sidebar and existing mobile Mail sheet,
        including selected state and **All labels** reset behavior.
32. [x] Add reading-pane label picker with keyboard add/remove behavior, focus
        restoration, loading state, and error recovery.
33. [x] Finish list/detail chip behavior: two desktop chips, one narrow chip,
        `+N` overflow, truncation, full accessible names, and no 375px overflow.
34. [x] Add concurrent-limit, CRUD, assignment, combined-filter, pagination,
        foreign-ID, keyboard, Axe, and responsive tests.
35. [x] Pass Phase 3 gate: unit/API/Playwright suites and desktop/mobile keyboard
        demo prove manual labeling and combined label filtering. Then stop execution
        and wait for user verification before starting Phase 4.

### Phase 4 — Slice 3: Complete future-message rules (Tasks 36–42)

36. [x] Add subject-substring criterion to schema validation, canonical matcher,
        service contracts, API DTOs, and filter-rule UI.
37. [x] Implement rule rename, edit, enable, disable, reorder, and delete flows;
        preserve all previously applied message-label assignments.
38. [x] Integrate shared evaluator into IMAP sync without holding database locks
        during remote IMAP I/O.
39. [x] Apply transaction-scoped account advisory lock to every rule mutation and
        eligible webhook/IMAP message-persistence transaction.
40. [x] Add controlled race tests for rule create, edit, disable, and delete
        against message persistence, including multiple rules targeting one label.
41. [x] Run shared matcher contract tests through live webhook, live IMAP, and
        batch-style paths with Unicode, case, whitespace, and empty-field boundaries.
42. [x] Pass Phase 4 gate: webhook/IMAP parity, concurrency tests, review, and UI
        demo for create/edit/disable/delete behavior. Then stop execution and wait
        for user verification before starting Phase 5.

### Phase 5 — Slice 4: Existing-message backfill and hardening (Tasks 43–54)

43. [x] Add `MailFilterRun` schema, immutable matcher snapshot, cutoff/cursor
        tuples, lease fields, indexes, and one-active-run partial unique constraint.
44. [x] Create and replay additive backfill migration against fresh and populated
        databases.
45. [x] Implement atomic run claim, five-minute lease renewal, retry ceiling,
        expired-lease takeover, and terminal-state transitions.
46. [x] Implement 200-message keyset batches using `(createdAt, id)`; atomically
        commit assignments, counts, and cursor progress per batch.
47. [x] Reuse the canonical TypeScript matcher for backfill and keep rule/run
        snapshots immutable while work is active.
48. [x] Wire bounded backfill processing into instrumentation startup; reuse the
        existing Mail scheduler; do not add another scheduler or interval.
49. [x] Add filter-run status/retry APIs and UI with bounded polling that stops on
        completed or failed state.
50. [x] Add tests for same-timestamp cutoff, crash before/after commit, two
        workers, lease expiry, retry ceiling, live/backfill overlap, and rule changes
        during an active snapshot run.
51. [x] Measure labeled 50-row list performance and 200-row backfill batches with
        large seeded mail data; record results and any index adjustments.
52. [x] Update PRD, architecture, design, execution plan, test plan, environment
        documentation, and known limitations to match delivered behavior.
53. [x] Rehearse rollback: back up label tables, disable feature exposure, remove
        routes/UI, and prove Mail accounts, folders, messages, attachments, flags,
        and bodies remain intact.
54. [x] Pass Phase 5 final gate: Prisma validation, database preparation, lint,
        typecheck, unit/integration/Playwright suites, production build, migration
        replay, accessibility review, responsive review, code review, and restart
        recovery demo. Then stop execution and wait for user verification before
        declaring the implementation complete.

### Phase 6 — Verification remediation: standalone label management (Tasks 55–59)

55. [x] Add typed client wrappers for label update and delete using the existing
        workspace-scoped API contracts.
56. [x] Add a member-visible **Manage labels** header action and responsive dialog
        for standalone create, rename, recolor, keyboard reorder, and confirmed
        safe delete.
57. [x] Refresh sidebar, message list, and reading pane after mutations; clear an
        active deleted-label facet before reloading results.
58. [x] Add complete English/Russian copy plus focused unit and responsive
        Playwright coverage for name/color creation, CRUD controls, member
        visibility, focus restoration, accessibility, and overflow.
59. [x] Pass the Phase 6 gate: formatting, typecheck, lint, focused unit/E2E,
        blocking-finding-free independent review, and user-visible verification.
        Then stop execution and wait for user verification.

## 8. Acceptance Criteria

Preserve existing `AC-MAIL-001..030`. Add two requirements:

### `FR-MAIL-008` — Mail labels

- **AC-MAIL-031:** Workspace label CRUD works and normalized duplicates are
  rejected.
- **AC-MAIL-032:** Manual label assignment/removal is idempotent.
- **AC-MAIL-033:** Applied labels appear beside the list subject and in the
  reading pane.
- **AC-MAIL-034:** At 375px and desktop widths, chip overflow collapses to
  `+N` without hiding row activation or causing body overflow.
- **AC-MAIL-035:** Label identity uses visible/accessibly exposed text, not
  color alone.
- **AC-MAIL-036:** Label filtering intersects account, folder, unread, search,
  sort, and keyset pagination.
- **AC-MAIL-037:** Foreign-workspace label, rule, account, and message IDs
  return non-disclosing 404 responses and create no writes.
- **AC-MAIL-038:** List responses remain metadata-only and contain no message
  body or attachment bytes.

### `FR-MAIL-009` — Mail filter rules

- **AC-MAIL-039:** An active-workspace member can create an active account-scoped rule with at
  least one supported predicate and a target label.
- **AC-MAIL-040:** Matching uses canonical case-insensitive AND semantics.
- **AC-MAIL-041:** Future matching webhook and IMAP messages receive the target
  label.
- **AC-MAIL-042:** Retries, overlapping rules, and concurrent ingestion never
  duplicate message-label assignments.
- **AC-MAIL-043:** **Filter messages like this** prefills account and sender but
  permits edits before saving.
- **AC-MAIL-044:** Rule edits, disabling, and deletion do not remove labels
  already applied.
- **AC-MAIL-045:** Optional existing-message application runs in bounded,
  resumable batches and exposes progress and failure state.

## 9. Test Matrix

| Area          | Required coverage                                                        |
| ------------- | ------------------------------------------------------------------------ |
| Label service | normalization, uniqueness, limits, CRUD, referenced-label conflict       |
| Assignment    | add/remove idempotency, cascade, duplicate prevention                    |
| Matcher       | sender, subject, AND behavior, Unicode, case, whitespace, empty criteria |
| Persistence   | webhook and IMAP entry paths, atomic label assignment                    |
| Concurrency   | rule create/edit/disable/delete versus message persistence               |
| List          | label DTO, body omission, combined filter predicates                     |
| Pagination    | filter fingerprint, stable pages, workspace cursor rejection             |
| Isolation     | foreign IDs return 404 and cause zero cross-workspace writes             |
| UI            | chip placement, truncation, `+N`, picker, sidebar, prefilled rule dialog |
| Accessibility | named rows, text labels, keyboard flows, focus restoration, Axe          |
| Responsive    | 375px, 420px list column, 1440px, no body overflow                       |
| Backfill      | cutoff boundary, crash recovery, lease takeover, retry, two workers      |
| Migration     | fresh replay, upgrade with existing mail, rollback rehearsal             |
| Performance   | 50-row labeled list and 200-row backfill batches                         |

## 10. Risks and Controls

- **Rule cost growth:** bounded rule counts and predicate lengths; prefetch active
  rules once per account batch.
- **Duplicate assignments:** database unique constraint plus conflict-safe
  inserts.
- **Activation races:** shared transaction-scoped account advisory lock and
  post-lock rule loading.
- **Backfill inconsistency:** immutable run snapshot and shared TypeScript
  matcher.
- **Backfill interruption:** durable cursor, atomic batch transaction, lease,
  and retry ceiling.
- **List inflation:** existing 50-row page limit and bounded workspace labels.
- **Sensitive logs:** record IDs, counts, durations, and error codes only; never
  subjects, bodies, or addresses.
- **Provider divergence:** UI and docs call these **Inspoter labels** and do not
  imply remote mailbox mutation.
- **UIDVALIDITY reset:** automatic labels reapply; manual-label loss remains a
  documented limitation until a safe reconciliation identity exists.
- **Existing move/reimport duplication:** current Mail limitation remains and
  should not be hidden by this feature.

## 11. File Impact

Modify:

- `prisma/schema.prisma`
- new Prisma migrations
- `src/lib/services/mail.ts`
- `src/lib/services/mail-sync.ts`
- `src/lib/services/mail-scheduler.ts`
- `src/lib/validation/mail.ts`
- `src/components/mail/api.ts`
- `src/components/mail/mail-client-view.tsx`
- `src/components/mail/message-list.tsx`
- `src/components/mail/message-pane.tsx`
- `src/components/mail/mail-sidebar.tsx`
- `src/messages/en/mail.json`
- `src/messages/ru/mail.json`
- Mail unit and E2E tests
- `docs/prd.md`
- `docs/architecture.md`
- `docs/design.md`
- `docs/plan.md`
- `docs/test-plan.md`

Add:

- `src/lib/services/mail-labels.ts`
- `src/lib/services/mail-filter-rules.ts`
- `src/lib/services/mail-filter-runs.ts`
- label, filter-rule, assignment, and filter-run API routes
- `src/components/mail/label-chip.tsx`
- `src/components/mail/label-picker.tsx`
- `src/components/mail/manage-labels-dialog.tsx`
- `src/components/mail/filter-rule-dialog.tsx`
- focused service, API, component, and accessibility tests

Do not edit `src/generated` manually.

## 12. Verification Commands

```text
corepack pnpm exec prisma validate
corepack pnpm test:db:prepare
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test:unit
corepack pnpm exec playwright test e2e/mail-client.spec.ts
corepack pnpm build
```

## 13. Recommendation

Start with Phase 1 only. After user verification, Phase 2 delivers the
exact-sender tracer and requested label-next-to-subject behavior.
