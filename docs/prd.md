# Product Requirements Document — inspoter

**Version:** v3.8
**Status:** Draft v3.8 channel-webhook amendment — source inspected; runtime revalidation pending
**Owner:** Product Analyst
**Date:** 2026-07-18
**Source of truth for:** architect, ui-ux-designer, planner, tester
**Traces to:** `docs/idea.md` (verbatim product brief), `docs/progress.md` (Decisions log through Q-1…Q-13, 2026-07-14), `specs/prototype/`, `specs/inspot-design/`, and `specs/ui.md` (normative design inputs per Q-3)

---

## 1. Product Overview

### What we are building

`inspoter` is a specialized, self-hosted **personal operations dashboard** — comparable to Dashy/Homarr for the bookmarking part, but extended with operational sections for managing domains, VPS servers, mail, messages, logs, and alerts. It is a single deployable Next.js application backed by PostgreSQL. The dashboard supports **workspaces** so a single deployment can serve multiple small teams or projects. Switching workspace changes every visible and operable content area, including Domains, DNS records, Servers, Settings, and webhook tokens. Provider credentials alone remain deployment-scoped `.env` secrets.

### What problem it solves

A self-hosted operator (homelab / small-team / indie infrastructure owner) currently spreads day-to-day operations across many disconnected tools: bookmark managers, registrar/DNS control panels (Cloudflare, Hetzner, GoDaddy), a VPS provider console (Hetzner), mailboxes, chat systems, and log/alert viewers. There is no single pane of glass. inspoter consolidates these into one self-hosted control panel, and adds a **unified webhook ingest API** so third-party systems can push mail, messages, logs, and alerts into the dashboard.

### Expected outcome

A working self-hosted dashboard where the operator can:

1. Organize and open resource bookmarks (categorized, with icon/name/description).
2. Monitor and manage domains and DNS records through provider integrations.
3. Monitor and manage Hetzner VPS servers (status + start/stop/restart).
4. View, filter, and sort mail, logs, and alerts.
5. Organize messages in a Discord-style category/channel structure and let authenticated operators post messages to existing channels.
6. Receive mail, messages, logs, and alerts from external systems via authenticated webhooks.
7. Use real Cloudflare DNS, Hetzner Cloud, Hetzner DNS, and GoDaddy accounts as credentials become available, while retaining deterministic mock behavior when credentials are absent.

### Delivery approach (from Decisions log)

Vertical slices. **Slice 1 (tracer bullet) = dashboard shell + minimal single-operator auth + Bookmarks.** Auth is included in Slice 1 in a minimal, env-seeded single-operator form per the coordinator decision (progress.md Decisions log, debate cycle 1); full user management/RBAC remain out of scope. All other sections are later slices. External-provider integrations (Cloudflare, Hetzner, GoDaddy, mailboxes) sit behind a **provider abstraction with a mock mode**; real API keys are supplied later via environment variables.

**Workspaces were added after Slice 1** as a follow-on slice: the env-seeded operator from Slice 1 became the first workspace owner, a default workspace was created for that operator, and workspace-scoped database content plus an invite-only membership model were layered on top of the existing single-operator auth (see §3.10).

---

## 2. Target Audience

### Primary persona — "The Self-Hosted Operator" (Admin)

- **Who:** A technically proficient individual, or a small team collaborating within one or more workspaces, who self-hosts their own infrastructure.
- **Context:** Runs the dashboard on their own server/homelab via Docker. Owns domains at Cloudflare/Hetzner/GoDaddy and VPS instances at Hetzner. Wants a consolidated operational view, optionally shared with teammates through a workspace.
- **Skill level:** High. Comfortable with environment variables, Docker, API tokens, and reading logs. Does **not** need hand-holding onboarding flows.
- **Deployment model:** Single-user or small-team, self-hosted, with workspace-based collaboration (§3.10). Not a general-purpose multi-tenant SaaS — workspaces exist for one operator/team to organize and optionally share their own infrastructure, not to serve unrelated third-party customers.

### Secondary actor — "External System" (machine, not a human)

- **Who:** Third-party services, scripts, monitoring tools, or CI pipelines.
- **Context:** Authenticate with a token and POST payloads to the webhook ingest API to create mail entries, messages, logs, or alerts.
- **Skill level:** N/A (programmatic).

---

## 3. Functional Requirements

Priority uses MoSCoW mapped to the two-phase roadmap:

- **MVP / Slice 1** — Must Have, delivered in the tracer bullet (dashboard shell + minimal single-operator env-seeded auth + Bookmarks).
- **MVP** (no slice tag) — Must Have for the product to be considered functionally complete, delivered in later slices.
- **Later** — Should/Could Have, sequenced after the core sections.

Every acceptance criterion is executable and objectively verifiable. AC-IDs are stable and never reused or renumbered. AC-IDs appear in logical, not numeric, order (later revisions may insert a lower-numbered ID next to a related one).

> **Confirmed scope boundaries (Q-4…Q-7, Q-14):** The historical Q-5 read-only constraint on Mail is **superseded by Q-14 (2026-07-18)**: Mail is now a full multi-account IMAP/SMTP client (accounts, folders, sync, read/unread, delete/archive/move, attachments, compose/reply/forward — see §3.4). Servers provide inventory/status plus start, stop, and restart only (Q-6). Alerts support viewing, organization, filtering, sorting, and deletion; acknowledge/resolve is deferred (Q-7). Messages accept both webhook posts and authenticated operator posts to existing channels (Q-4). These are confirmed constraints, not provisional interpretations.

The visible UI is Russian-only under the finite allowlist in NFR-I18N-001 (Q-1). The light theme is primary; dark theme and a theme switcher are deferred (Q-2). Q-3 makes `specs/prototype/`, `specs/inspot-design/`, and `specs/ui.md` normative for layouts, flows, and design, but legacy English visible copy in `specs/ui.md` is non-normative and must be translated. Q-13 supersedes D-20 and confirms `specs/ui.md`'s all-content workspace semantics: every section, Settings surface, token, provider resource binding, mock resource, cache, cursor, read, and mutation follows the active workspace. Provider credentials remain deployment-scoped secrets. The switcher layout and its no-full-page-reload flow remain normative.

---

### 3.0 Dashboard Shell & Authentication (Slice 1)

**FR-SHELL-001: Application shell and navigation**

- Description: A persistent shell that hosts all seven sections with a navigation menu.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-SHELL-001** (Slice 1): Given an authenticated user, When they load the dashboard, Then a persistent navigation menu lists all seven sections (Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts).
  - **AC-SHELL-002** (Slice 1): Given the navigation menu, When the user clicks a section link, Then the application routes to that section without a full page reload (client-side navigation).
  - **AC-SHELL-003** (Slice 1): Given a not-yet-implemented section (any section other than Bookmarks in Slice 1), When the user opens it, Then a clearly labeled «Скоро / пока недоступно» placeholder is shown (no error, no blank screen).
  - **AC-SHELL-004** (Slice 1): Given a viewport width of 375px and of 1440px, When the shell renders, Then the navigation and content remain usable with no horizontal overflow of the page body.

**FR-AUTH-001: Panel authentication (minimal single-operator, env-seeded)**

- Description: The dashboard requires authentication before any section is accessible. For Slice 1 and MVP the bootstrap path is a **single operator** whose credentials are **seeded from environment variables** at startup (coordinator decision, debate cycle 1). Beyond that first, env-seeded operator, additional operators are created **invite-only** by a workspace owner (FR-WS-002) — there is no self-service registration screen. RBAC beyond the workspace `role` field remains out of scope.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-AUTH-001** (Slice 1): Given an unauthenticated visitor, When they request any dashboard route (except the login route and webhook API), Then they are redirected to a login screen and no dashboard data is returned.
  - **AC-AUTH-002** (Slice 1): Given the operator credentials seeded from environment variables, When the user submits them, Then a session is established and the user reaches the dashboard.
  - **AC-AUTH-003** (Slice 1): Given invalid credentials, When the user submits them, Then authentication is rejected with an error and no session is created.
  - **AC-AUTH-004** (Slice 1): Given an authenticated session, When the user logs out, Then the session is invalidated and subsequent dashboard requests redirect to login.
  - **AC-AUTH-005** (Slice 1, bootstrap): Given operator credentials supplied via environment variables at startup, When the application boots with no operator yet present, Then exactly one operator account is provisioned from those env values and can authenticate per AC-AUTH-002; Given the required auth environment variables are absent, When the application boots, Then it fails fast (refuses to start or blocks all login) with a clear message and never exposes an unauthenticated dashboard.
  - _Note: Auth mechanism for Slice 1/MVP is fixed by coordinator decision — a single operator whose credentials are seeded from environment variables (progress.md Decisions log, debate cycle 1). The concrete session/hashing implementation is an architecture decision; the PRD mandates only the outcomes above. Multi-account creation exists via workspace-owner invite (FR-WS-002), not self-service registration. OQ-5 is resolved for MVP; future OAuth/SSO requires a new sourced requirement._

---

### 3.1 Bookmarks (Slice 1)

**FR-BM-001: Bookmark categories (CRUD)**

- Description: Bookmarks are organized into user-defined categories. The catalog must support categorization.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-001** (Slice 1): Given the Bookmarks section, When the user creates a category with a name, Then the category is persisted and appears in the section without a full page reload.
  - **AC-BM-002** (Slice 1): Given an existing category, When the user renames it, Then the new name is persisted and displayed.
  - **AC-BM-003** (Slice 1): Given an existing category, When the user deletes it, Then the category is removed; the user is warned that contained bookmarks will be handled per AC-BM-004.
  - **AC-BM-004** (Slice 1): Given a category that contains bookmarks, When the user confirms deletion, Then the contained bookmarks are also deleted (cascade) and no orphaned bookmarks remain.
  - **AC-BM-005** (Slice 1): Given a category-create form, When the user submits an empty name, Then a validation error is shown and no category is created.

**FR-BM-002: Bookmark entries (CRUD)**

- Description: Each bookmark is a link to a resource with an icon, name, description, URL, and optional accent color, belonging to a category.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-006** (Slice 1): Given an existing category, When the user creates a bookmark with a name, URL, optional icon, and optional description, Then the bookmark appears in that category's list without a full page reload.
  - **AC-BM-007** (Slice 1): Given a bookmark-create form, When the user submits without a name or without a URL, Then a validation error is shown and no bookmark is created.
  - **AC-BM-008** (Slice 1): Given a bookmark-create form, When the user submits a URL that is not a valid `http(s)` URL, Then a validation error is shown and no bookmark is created.
  - **AC-BM-009** (Slice 1): Given an existing bookmark, When the user edits its name, URL, icon, description, or category, Then the changes are persisted and reflected in the list.
  - **AC-BM-010** (Slice 1): Given an existing bookmark, When the user deletes it, Then it is removed from the category list without a full page reload.
  - **AC-BM-011** (Slice 1): Given a bookmark with an icon value, When the bookmark is rendered, Then the specified icon is displayed; When no icon is set, Then a deterministic fallback (e.g., derived from the name/URL) is displayed instead of a broken image.
  - **AC-BM-015** (Slice 1): Given a bookmark-create or bookmark-edit form, When the operator picks one of the three available accent-color swatches, Then that color choice is submitted with the bookmark and persisted.
  - **AC-BM-016** (Slice 1): Given a bookmark with an accent color set, When the bookmark is rendered, Then its icon tile uses that color's tone instead of the deterministic hash-based fallback tone.
  - **AC-BM-017** (Slice 1): Given a bookmark with an accent color set, When the operator clears the color via the picker's "no color" option, Then the bookmark's icon tile reverts to the deterministic hash-based fallback tone used when no color was ever set.
  - **AC-BM-018** (Slice 1): Given the accent-color picker, When it is inspected via assistive technology or operated via keyboard, Then each swatch exposes a non-color-only accessible name and is operable without a pointer.

**FR-BM-003: Bookmark display and navigation**

- Description: Bookmarks are presented grouped by category and are openable.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-012** (Slice 1): Given bookmarks exist across multiple categories, When the user views the Bookmarks section, Then bookmarks are displayed grouped under their category with name, icon, and description visible.
  - **AC-BM-013** (Slice 1): Given a displayed bookmark, When the user activates it, Then its URL opens in a new browser tab.
  - **AC-BM-014** (Slice 1): Given no categories and no bookmarks exist, When the user views the Bookmarks section, Then an empty-state prompt to create the first category/bookmark is shown (no error).

**FR-BM-004: Bookmark search/filter**

- Description: The operator can narrow the displayed bookmarks with a client-only, case-insensitive text search over the currently loaded categories; no new API route or schema change is required.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-019** (Slice 1): Given the Bookmarks section with at least one category, When the user types a query into the search input, Then only bookmarks whose name, description, or URL case-insensitively contain the query text remain visible, and any category left with zero matching bookmarks is hidden from the list.
  - **AC-BM-020** (Slice 1): Given an active search query that matches no bookmarks, When the user views the result, Then a no-results state distinct from the first-category empty state (AC-BM-014) is shown, offering an action that clears the query and restores the full, unfiltered list.
  - **AC-BM-021** (Slice 1): Given no categories exist, When the user views the Bookmarks section, Then no search input is rendered, since the first-category empty state (AC-BM-014) governs instead.

**FR-BM-005: Drag-and-drop reordering**

- Description: The operator can reorder categories and can reorder bookmarks within or across categories via a dedicated drag handle, using pointer drag or keyboard operation. Unlike FR-BM-004, this does introduce two new API routes (`PATCH /api/categories/reorder`, `PATCH /api/bookmarks/reorder`) and two new workspace-scoped service functions (`reorderCategories`, `reorderBookmarks`); no schema change is required, since a `position` field already existed on both models from an earlier fix.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-022** (Slice 1): Given multiple categories, When the user drags a category into a new position, Then the new category order is persisted and survives a reload.
  - **AC-BM-023** (Slice 1): Given a category with multiple bookmarks, When the user drags a bookmark to a new position within that same category, Then the new bookmark order is persisted and survives a reload.
  - **AC-BM-024** (Slice 1): Given a bookmark in category X and a target category Y, When the user drags the bookmark from X into Y at a given position, Then after a reload the bookmark appears in Y at that position, its category membership is updated accordingly, and the remaining bookmarks in X are correctly re-indexed with no gaps.
  - **AC-BM-025** (Slice 1): Given a category or bookmark's drag handle, When the operator uses the keyboard alone (Tab to focus the handle, then pick up, move, and drop via keyboard), Then the reorder completes with no pointer input required.

**FR-BM-006: Favicon suggestion**

- Description: The operator can optionally populate a bookmark's icon field by fetching a favicon suggestion from a fixed, hardcoded third-party service (`https://www.google.com/s2/favicons?sz=64&domain=<hostname>`), keyed only on the hostname derived from the bookmark's own URL; the server never contacts the bookmark's own URL/host directly. This is triggered only by explicit operator action, never automatic or background fetching. The icon field remains a plain reference-value string, unchanged in nature from A-2.
- Priority: Should Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-026** (Slice 1): Given a bookmark-create or bookmark-edit form with a valid http(s) URL entered, When the operator clicks the favicon-suggest control, Then a favicon suggestion is fetched from a fixed third-party service and populates the icon field, remaining editable/clearable before submit.
  - **AC-BM-027** (Slice 1): Given a bookmark-create or bookmark-edit form, When the favicon suggestion cannot be resolved (invalid/unreachable URL, timeout, non-image response), Then the icon field is left unchanged and a non-blocking notice is shown.
  - **AC-BM-028** (Slice 1): Given a bookmark whose icon value is an image URL that fails to load, When the bookmark is rendered, Then the deterministic fallback tile is displayed instead of a broken image (extends AC-BM-011's "never a broken image" guarantee to the load-failure case, not just the unset case).

**FR-BM-007: Nested category groups**

- Description: A category may optionally nest one level of subcategories (group → subcategory → bookmarks); a subcategory itself can never have further subcategories. This is the first self-referential relation in the schema (`Category.parentCategoryId` self-relation, additive migration, no change to existing top-level categories). Depth-cap and self-reference invariants are enforced server-side in the Bookmarks service and mirrored client-side in the category form so an operator is never offered a choice the server would reject.
- Priority: Should Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-029** (Slice 1): Given an existing top-level category, When the operator creates a new category and selects it as the "Родительская категория", Then the new category is persisted as its subcategory and renders nested within the parent category's section.
  - **AC-BM-030** (Slice 1): Given an existing subcategory, When the operator opens the category-create or category-edit form's parent-category select, Then that subcategory never appears as a selectable option (only top-level categories are offered as parents).
  - **AC-BM-031** (Slice 1): Given a top-level category that already has at least one subcategory, When the operator edits that category, Then its own parent-category field is disabled and cannot be set to any value, since assigning it a parent would create a three-level chain; the same category remains a normal, selectable parent option when creating or editing a _different_ category.
  - **AC-BM-032** (Slice 1): Given a top-level category with both its own bookmarks and at least one subcategory (itself containing bookmarks), When the operator deletes that category, Then the delete-confirmation warning states the direct bookmark count, the subcategory count, and the nested bookmark count, and confirming the deletion cascades to remove the category, its subcategories, and all bookmarks at both levels, leaving no orphans.
  - **AC-BM-033** (Slice 1): Given a subcategory containing bookmarks, When the Bookmarks section is rendered, Then those bookmarks display nested under their subcategory's own heading within the parent category's section, and remain individually reorderable/movable exactly like any other category's bookmarks.
  - **AC-BM-034** (Slice 1): Given two workspaces, When an operator supplies a `parentCategoryId` that belongs to a category in a different workspace while creating or updating a category, Then the request is rejected and no partial write occurs.

---

### 3.2 Domains

**FR-DOM-001: Domain inventory (list & manage)**

- Description: List and manage domain names monitored across providers (Cloudflare, Hetzner, GoDaddy).
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-DOM-001**: Given at least one configured provider (real or mock), When the user opens the Domains section, Then only domains bound to the active workspace are displayed with their name and provider; a resource bound to another workspace is absent.
  - **AC-DOM-002**: Given the provider abstraction is in mock mode, When the user opens the Domains section, Then deterministic representative mock domains assigned exclusively to the active workspace are returned so the UI is fully exercisable without real credentials; mutations in one workspace never alter another workspace's mock state.
  - **AC-DOM-003**: Given a provider that returns an error or is unreachable, When the user opens the Domains section, Then the section renders with a per-provider error indicator and the domains from healthy providers are still shown.

**FR-DOM-002: DNS record management**

- Description: View and manage DNS records for a selected domain through its provider.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-DOM-004**: Given a domain bound to the active workspace, When the user opens its DNS view, Then its DNS records are listed with type, name, value, and TTL; a foreign or missing local binding returns a non-disclosing not-found response before any provider call.
  - **AC-DOM-005**: Given a domain bound to the active workspace, When the user creates a DNS record with a valid type, name, and value, Then the record is submitted to the provider and, on success, appears in that workspace's record list.
  - **AC-DOM-006**: Given an existing DNS record under a domain bound to the active workspace, When the user edits its value/TTL, Then the change is submitted to the provider and, on success, the updated record is displayed only in that workspace.
  - **AC-DOM-007**: Given an existing DNS record under a domain bound to the active workspace, When the user deletes it and confirms, Then the record is removed via the provider and disappears from that workspace's list.
  - **AC-DOM-008**: Given a DNS record form, When the user submits an invalid record type or malformed value for the selected type, Then a validation error is shown and nothing is submitted to the provider.
  - **AC-DOM-009**: Given a provider that rejects a create/update/delete, When the operation fails, Then an error message is surfaced and the record list reflects the unchanged provider state; foreign-workspace bindings make zero provider calls.

---

### 3.3 Servers

**FR-SRV-001: Server inventory & status (Hetzner)**

- Description: List Hetzner VPS servers with their configuration summary and current state. This iteration supports inventory/status plus start, stop, and restart only; server lifecycle operations are excluded (Q-6).
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-SRV-001**: Given the Hetzner provider (real or mock), When the user opens the Servers section, Then only servers bound to the active workspace are displayed with name, type/configuration summary, and current power status.
  - **AC-SRV-002**: Given the provider is in mock mode, When the user opens the Servers section, Then deterministic representative mock servers assigned exclusively to the active workspace are returned; power actions in one workspace never alter another workspace's mock state.
  - **AC-SRV-003**: Given the Hetzner provider is unreachable or returns an error, When the user opens the Servers section, Then an error state is shown rather than a crash or blank screen.

**FR-SRV-002: Server power actions**

- Description: Start, stop, and restart Hetzner servers.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-SRV-004**: Given a stopped server bound to the active workspace, When the user triggers "start", Then the provider call returns a 2xx AND a status poll within 30 seconds reports `running`; a foreign or missing local binding returns not-found before any provider call.
  - **AC-SRV-005**: Given a running server bound to the active workspace, When the user triggers "stop", Then the provider call returns a 2xx AND a status poll within 30 seconds reports `stopped`; a foreign binding makes zero provider calls.
  - **AC-SRV-006**: Given a running server bound to the active workspace, When the user triggers "restart", Then the provider call returns a 2xx AND a status poll within 60 seconds reports `running`; a foreign binding makes zero provider calls.
  - **AC-SRV-007**: Given a destructive/state-changing action (start/stop/restart), When the user triggers it, Then a confirmation step is required before the action is sent.
  - **AC-SRV-008**: Given the provider rejects or errors on a power action, When the action fails, Then an error is surfaced, the displayed status reflects the provider's actual state, and any ambiguous outcome is reconciled before another mutation is allowed.
  - _Note: In mock mode the polled status transition is deterministic so AC-SRV-004..006 are testable without real Hetzner credentials._

---

### 3.4 Mail

> **Scope revision (Q-14, 2026-07-18):** the Q-5 read-only constraint is lifted. Mail is a full multi-account mail client: workspace owners connect IMAP/SMTP mailboxes (app-passwords, no OAuth), the system synchronizes folders and messages, and operators read, flag, move, delete, compose, reply, and forward mail with attachments. The webhook ingest path (FR-MAIL-002) is preserved unchanged as a per-workspace system «webhook» mailbox. Existing AC-MAIL-001..006 keep their IDs and remain valid against the new three-pane client.

**FR-MAIL-001: Mail viewing, filtering, sorting**

- Description: View mail entries and filter/sort them by various criteria. The list is scoped to the selected account and folder (FR-MAIL-004/AC-MAIL-029..030) and shows a projection without message bodies; the reading pane shows the full sanitized content.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MAIL-001**: Given mail entries exist, When the user opens the Mail section, Then a paginated list of mail entries is displayed with sender, subject, and received timestamp.
  - **AC-MAIL-002**: Given a selected mail entry, When the user opens it, Then its full content (sender, subject, body, timestamp) is displayed.
  - **AC-MAIL-003**: Given the mail list, When the user applies a filter (e.g., by sender or by a text query on subject), Then only matching entries are shown.
  - **AC-MAIL-004**: Given the mail list, When the user sorts by a supported criterion (e.g., received date ascending/descending or sender), Then the list order updates accordingly.
  - **AC-MAIL-005**: Given more mail entries than one page, When the user views the list, Then pagination controls limit the page size and allow navigation across pages (see NFR-PERF-001).

**FR-MAIL-002: Mail ingest via webhook**

- Description: External systems can create mail entries via the unified webhook ingest API (see FR-WH-001). Mail uses the `mail` webhook ingest `type`. The `POST /api/webhooks/mail` contract is unchanged by Q-14; ingested entries land in the workspace's system WEBHOOK mailbox (AC-MAIL-011).
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MAIL-006**: Given a valid webhook request targeting the mail intake with a payload containing sender, subject, and body, When it is accepted, Then a new mail entry is created and becomes visible in the Mail section.

**FR-MAIL-003: IMAP/SMTP account management**

- Description: A workspace owner manages the workspace's mail accounts on `/settings/mail`: create, edit, test, and delete IMAP/SMTP accounts (host/port/TLS mode for IMAP and SMTP, username, password). Passwords are encrypted at rest (AES-256-GCM via `CREDENTIAL_ENCRYPTION_KEY`, same scheme as provider credentials) and never returned to the client. Accounts support MOCK mode (deterministic in-memory driver for dev/e2e) and REAL mode (imapflow/nodemailer, TLS-only). Members may read the account list (without secrets); all mutations are owner-only.
- Priority: Must Have (Q-14 slice)
- Acceptance Criteria:
  - **AC-MAIL-007**: Given a workspace owner, When they create an IMAP account with valid connection fields and a password, Then the account is persisted with the password encrypted (AES-256-GCM), only a masked hint is ever returned by any API response, and a first synchronization is scheduled; Given a non-owner member, When they attempt any account mutation, Then the request is rejected (403) and nothing is persisted.
  - **AC-MAIL-008**: Given the account form, When the operator uses «Проверить подключение», Then a transient driver verifies IMAP and SMTP connectivity from the raw input and returns per-protocol results without persisting anything.
  - **AC-MAIL-009**: Given an existing account, When the owner edits it and leaves the password blank, Then the stored password is kept unchanged (blank-means-keep); When a new password is supplied, Then it replaces the stored one.
  - **AC-MAIL-010**: Given an existing IMAP account, When the owner deletes it, Then the account and all of its folders, messages, and cached attachments are removed (cascade); Given the system WEBHOOK account, When deletion or edit is attempted, Then the request is rejected and the webhook mailbox remains intact.
  - **AC-MAIL-011**: Given any workspace, When Mail is used, Then exactly one system WEBHOOK account exists for that workspace (backfilled by migration for existing workspaces, lazily created for new ones; enforced by a partial unique index), and webhook-ingested entries are stored in its «Входящие» folder.

**FR-MAIL-004: IMAP synchronization**

- Description: A background scheduler (in-process, tick `MAIL_SYNC_TICK_MS`, default 30 s) synchronizes due IMAP accounts: folder list with special-use detection, initial import bounded by `MAIL_INITIAL_SYNC_LIMIT` (default 200 newest messages per folder), incremental import by UID, flag down-sync, and server-side deletion detection. Concurrent syncs of one account are prevented by an atomic lease (5 min); a manual sync can be triggered per account from the UI.
- Priority: Must Have (Q-14 slice)
- Acceptance Criteria:
  - **AC-MAIL-012**: Given a newly created IMAP account, When its first sync completes, Then its folders are persisted with special-use roles and ordering (INBOX first), and each folder contains at most `MAIL_INITIAL_SYNC_LIMIT` of its newest messages with metadata, bodies, flags, and attachment metadata.
  - **AC-MAIL-013**: Given an already-synced folder, When new messages arrive on the server, Then a subsequent sync imports only messages with UID above the last seen UID, and re-running a sync never duplicates a message (idempotent upsert on `[folderId, uid]`).
  - **AC-MAIL-014**: Given a folder whose server UIDVALIDITY changed, When it is synced, Then the locally stored messages of that folder are wiped and re-imported from the server.
  - **AC-MAIL-015**: Given messages already stored locally, When their flags change on the server or they are deleted on the server, Then a sync updates read/answered/flagged state and removes the deleted rows (within the locally stored window; checked in chunks of 500 UIDs).
  - **AC-MAIL-016**: Given a sync in progress for an account, When a second sync is attempted (scheduler or `POST /api/mail/accounts/[id]/sync`), Then the second attempt is skipped or rejected with 409 `SYNC_IN_PROGRESS`, and an expired lease (5 min) allows a later sync to proceed.
  - **AC-MAIL-017**: Given a sync failure (network/auth), When the sync finishes, Then the account records `ERROR` status with a truncated error message, the next sync is still scheduled at the regular interval (no hot-loop), and the UI shows the error state.

**FR-MAIL-005: Message actions (read, delete, archive, move)**

- Description: Operators act on messages from the reading pane. For IMAP accounts, the action is executed on the mail server first (driver call) and mirrored in the database only on success; for WEBHOOK items, actions apply to the database only. Deletion is trash-first: from any folder the message moves to the Trash folder; deleting from Trash permanently removes it after confirmation.
- Priority: Must Have (Q-14 slice)
- Acceptance Criteria:
  - **AC-MAIL-018**: Given an unread message, When the operator opens it, Then it is marked read automatically (server first for IMAP, then the database), the list row loses its unread emphasis, and the folder's unread badge decreases; the operator can toggle read state back via «Прочитано».
  - **AC-MAIL-019**: Given a message outside Trash, When the operator deletes it, Then it is moved to the account's Trash folder; Given a message already in Trash, When the operator deletes it and confirms («Удалить навсегда?»), Then it is permanently removed; Given a WEBHOOK item, When deleted, Then it is removed from the database directly.
  - **AC-MAIL-020**: Given a message, When the operator archives it («В архив») or moves it to a target folder, Then the message is moved on the mail server and re-homed to the target folder locally; When the server operation fails, Then the API returns 502, the local state is unchanged, and a Russian error toast is shown.
  - **AC-MAIL-021**: Given the «Только непрочитанные» filter, When enabled, Then only unread messages are listed, and per-folder unread counters in the sidebar reflect the current read state.

**FR-MAIL-006: Compose, reply, forward (SMTP send)**

- Description: Operators compose plain-text mail in a dialog (To/Cc/Bcc chips, subject, body), reply with `Re:` prefill and quoted original, and forward with `Fwd:` prefill. Sending goes through the account's SMTP transport; the sent message is appended to the account's Sent folder and stored locally. Sending is rate-limited per workspace (`MAIL_SEND_RATE_LIMIT`, default 30 per `MAIL_SEND_RATE_WINDOW_MS`, default 1 h).
- Priority: Must Have (Q-14 slice)
- Acceptance Criteria:
  - **AC-MAIL-022**: Given a valid compose submission on an IMAP account, When it is sent, Then the message is delivered via SMTP, appended to the account's Sent folder on the server, and a corresponding row appears locally in «Отправленные».
  - **AC-MAIL-023**: Given a reply, When it is sent, Then it carries `In-Reply-To`/`References` headers of the original and the compose form was prefilled with `Re:` subject and a quoted body; Given a forward, Then the form is prefilled with `Fwd:` subject and the quoted original (attachments are not forwarded — see Known Limitations).
  - **AC-MAIL-024**: Given an invalid submission (no recipients, more than 50 recipients, or body over 500 KB), When it is submitted, Then it is rejected with a validation error and nothing is sent; Given the workspace exceeds `MAIL_SEND_RATE_LIMIT` sends within the window, When another send is attempted, Then it is rejected with HTTP 429.
  - **AC-MAIL-025**: Given a workspace with no active IMAP account, When the operator opens Mail with only the webhook mailbox, Then compose is unavailable with the hint «Добавьте IMAP-аккаунт, чтобы писать письма» and no send occurs.

**FR-MAIL-007: Attachments**

- Description: Attachment metadata (filename, content type, size) is captured during sync from the message structure; binary content is fetched from IMAP lazily on first download and cached in the database (`bytea`). Downloads carry a safe Content-Type (allowlist, otherwise `application/octet-stream`), an RFC 5987 encoded filename, and are bounded by `MAIL_MAX_ATTACHMENT_BYTES` (default 25 MiB).
- Priority: Must Have (Q-14 slice)
- Acceptance Criteria:
  - **AC-MAIL-026**: Given a synced message with attachments, When the operator opens it, Then attachment chips with filename and size are shown, and downloading an attachment returns its binary content with `Content-Disposition: attachment` and an RFC 5987 filename; the first download fetches from IMAP and caches, subsequent downloads are served from the cache without contacting the server.
  - **AC-MAIL-027**: Given an attachment larger than `MAIL_MAX_ATTACHMENT_BYTES`, When download is attempted, Then the API responds 413 and nothing is cached; Given a message not yet synchronized to the server (no UID), When download is attempted, Then the API responds 409.
  - **AC-MAIL-028**: Given an attachment whose declared content type is outside the safe allowlist, When it is downloaded, Then it is served as `application/octet-stream` (never as an executable/HTML-renderable type).

**Folders and account switching**

- Acceptance Criteria (under FR-MAIL-003/004):
  - **AC-MAIL-029**: Given a synced account, When the operator opens Mail, Then the sidebar lists the workspace's accounts and the selected account's folders with Russian special-use names (Входящие/Отправленные/Черновики/Корзина/Спам/Архив) and unread badges, and selecting a folder scopes the message list to it.
  - **AC-MAIL-030**: Given several accounts (including the system webhook mailbox), When the operator switches the selected account, Then the folder list, message list, and reading pane all switch to that account's content; foreign-workspace account/folder/message ids return a non-disclosing not-found response (consistent with AC-WS-011).

**Known Limitations (Q-14 iteration, documented trade-offs)**

1. **Reply flag is local-first (FR-MAIL-006):** sending a reply sets `isAnswered` only in the local database; `\Answered` is not written to the IMAP server, so the next flag down-sync overwrites it with the server value.
2. **Move/trash may transiently duplicate (FR-MAIL-005):** after a local move/trash the row keeps `uid: null` until the next sync; the next sync of the target folder can import the same message as a new row, and the uid-null row is not picked up by deletion detection. Known simplification; the fix is matching by `Message-ID`.
3. **Send rate limit is in-memory per process (FR-MAIL-006):** it resets on restart and is not shared across replicas — consistent with the webhook rate limiter (ADR-006).
4. **Plain-text compose only; attachments are not forwarded (FR-MAIL-006):** rich-text editing and re-attaching original files on forward are out of this iteration.
5. **No OAuth (FR-MAIL-003):** Gmail/Google OAuth flows are out of scope; app-passwords are the supported credential.
6. **Private-range IMAP/SMTP hosts are allowed deliberately (FR-MAIL-003):** self-hosted operators legitimately run mail servers on private networks; the SSRF trade-off is accepted and recorded in `docs/architecture.md`.
7. **Compose from the webhook mailbox falls back to the first IMAP account (FR-MAIL-006):** when the webhook mailbox is selected and at least one IMAP account exists, sending uses the first IMAP account.

---

### 3.5 Messages

**FR-MSG-001: Category/channel structure (Discord model)**

- Description: Messages are organized into categories that contain channels, mirroring Discord's structure.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MSG-001**: Given the Messages section, When the user creates a category, Then it is persisted and displayed as a container for channels.
  - **AC-MSG-002**: Given an existing category, When the user creates a channel within it, Then the channel is persisted and displayed nested under that category.
  - **AC-MSG-003**: Given an existing category or channel, When the user renames or deletes it, Then the change is persisted; when a category with channels is deleted, its channels are either cascaded (deleted) or reassigned — implementation may choose either strategy; the executable assertion is the no-orphan invariant only (no channel remains pointing to a deleted category).
  - **AC-MSG-004**: Given a selected channel, When the user opens it, Then the messages posted to that channel are displayed in chronological order.
  - **AC-MSG-007**: Given a channel with more messages than one page, When the user views the channel, Then the messages are server-side paginated to the configured page size and older messages are reachable via pagination/scroll-back (satisfies NFR-PERF-001).

**FR-MSG-002: Message ingest via webhook**

- Description: External systems post messages to an existing channel either through a legacy workspace-wide token at `POST /api/webhooks/message` or through a channel-scoped incoming webhook at `POST /api/webhooks/channels/<webhook-id>/<token>`; authenticated operators can also post through FR-MSG-003 (Q-4). A channel-scoped sender cannot select or override the destination channel.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MSG-005**: Given a valid webhook request targeting an existing channel with a message payload, When it is accepted, Then a new message is created in that channel and becomes visible when the channel is viewed.
  - **AC-MSG-006**: Given a webhook request targeting a channel that does not exist, When it is processed, Then it is rejected with a client error (4xx) and no message is created. (MVP behavior — no auto-create.)
  - **AC-MSG-008** (Later, inactive under Q-8): Given channel auto-create is enabled (a future, non-MVP option), When a webhook targets a non-existent channel, Then the channel is auto-created and the message is posted to it. Q-8 rejects auto-create for this iteration, so this criterion remains inactive and untested; AC-MSG-006 governs webhook behavior.

**FR-MSG-003: Authenticated operator message posting**

- Description: An authenticated operator can post a non-empty message to an existing channel. Persisted origin data and the visible feed distinguish operator-authored messages from webhook-authored messages (Q-4, which supersedes the read-only statement in `specs/ui.md`).
- Priority: Must Have
- Acceptance Criteria:
  - **AC-MSG-009**: Given an authenticated operator and an existing channel, When the operator submits non-empty message content, Then exactly one message is persisted in that channel and becomes visible in chronological order.
  - **AC-MSG-010**: Given a message created by an authenticated operator, When it is persisted, Then its stored attribution identifies operator origin and the authoring operator; Given a webhook-created message, Then its stored attribution identifies webhook origin and its available source.
  - **AC-MSG-011**: Given a channel containing both operator-authored and webhook-authored messages, When the operator views the feed, Then each message visibly identifies its origin and the two origins are distinguishable without opening another view.
  - **AC-MSG-012**: Given an authenticated operator, When they submit empty or whitespace-only content, Then the request is rejected with a client error and no message record is created.
  - **AC-MSG-013**: Given an authenticated operator, When they submit a message to a channel that does not exist, Then the request is rejected with a client error, no message or channel is created, and channel auto-create remains disabled.
  - **AC-MSG-014**: Given an operator post cannot be persisted, When the attempt fails, Then the API returns a non-success response, the UI shows the failure without an optimistic success state, and the feed contains only messages confirmed as persisted.

**Messages interaction contract (channel-webhook amendment, 2026-07-18):** The first available channel is selected when the current selection is absent; older pages prepend above the current feed without moving the reader away from the same content; a confirmed operator send refetches the feed, clears the draft only after success, and retains it on failure. The labeled multiline composer uses Enter for a newline and Ctrl+Enter to send. The feed renders `OPERATOR` as «Оператор», `WEBHOOK` as «Внешний источник», and historic/default `LEGACY` as «Источник не определён». Mobile navigation uses one Sheet, while channel actions remain keyboard-accessible in both sidebar and header. The channel settings dialog contains «Обзор» (rename/delete) and «Вебхуки» (independent loading, empty, error, create, one-time copy, list, and irreversible revoke states).

---

### 3.6 Logs

**FR-LOG-001: Log viewing, filtering, sorting**

- Description: View log entries and filter/sort by various criteria.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-LOG-001**: Given log entries exist, When the user opens the Logs section, Then a paginated list is displayed with, per entry, timestamp, severity/level, source, and message.
  - **AC-LOG-002**: Given the log list, When the user filters by level, source, or a text query, Then only matching entries are shown.
  - **AC-LOG-003**: Given the log list, When the user sorts by timestamp (ascending/descending), Then the list order updates accordingly.
  - **AC-LOG-004**: Given more log entries than one page, When the user views the list, Then pagination limits page size and allows navigation (see NFR-PERF-001).

**FR-LOG-002: Log ingest via webhook**

- Description: External systems push log entries via the unified webhook ingest API. Logs use the `log` webhook ingest `type`.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-LOG-005**: Given a valid webhook request with a log payload (level, source, message, optional timestamp), When it is accepted, Then a log entry is created and visible in the Logs section.

---

### 3.7 Alerts

**FR-ALR-001: Alert categories**

- Description: Alerts support categorization.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-ALR-001**: Given the Alerts section, When the user creates an alert category, Then it is persisted and available for grouping/filtering alerts.
  - **AC-ALR-002**: Given an existing alert category, When the user renames or deletes it, Then the change is persisted; when a category with alerts is deleted, its alerts are either reassigned to uncategorized or cascaded (deleted) — implementation may choose either strategy; the executable assertion is the no-orphan invariant only (no alert remains pointing to a deleted category).

**FR-ALR-002: Alert viewing, filtering, sorting**

- Description: View, organize, filter, sort, and delete alerts. Acknowledge and resolve workflows are excluded in this iteration (Q-7).
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-ALR-003**: Given alerts exist, When the user opens the Alerts section, Then a paginated list is displayed with, per alert, category, severity, source, message, and timestamp.
  - **AC-ALR-004**: Given the alert list, When the user filters by category, severity, or a text query, Then only matching alerts are shown.
  - **AC-ALR-005**: Given the alert list, When the user sorts by a supported criterion (e.g., timestamp or severity), Then the order updates accordingly.
  - **AC-ALR-006**: Given more alerts than one page, When the user views the list, Then pagination limits page size and allows navigation (see NFR-PERF-001).
  - **AC-ALR-008**: Given an existing alert, When an authenticated operator confirms deletion, Then the alert is deleted and no longer appears in the list; acknowledge and resolve actions are unavailable.

**FR-ALR-003: Alert ingest via webhook**

- Description: External systems send alerts via the unified webhook ingest API. Alerts use the `alert` webhook ingest `type`.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-ALR-007**: Given a valid webhook request with an alert payload (category, severity, source, message, optional timestamp), When it is accepted, Then an alert is created and visible in the Alerts section.

---

### 3.8 Webhook Ingest API (unified)

**FR-WH-001: Authenticated webhook ingest for Mail, Messages, Logs, Alerts**

- Description: A single, consistent webhook ingest mechanism that lets external systems push entries into the Mail, Messages, Logs, and Alerts sections. It must support token authentication, a defined payload format, optional-key idempotency, size limits, and rate limiting.
- Priority: Must Have (Later). _This is the shared backbone for AC-MAIL-006, AC-MSG-005, AC-LOG-005, AC-ALR-007._
- Acceptance Criteria:
  - **AC-WH-001**: Given a webhook request with no token or an invalid/revoked token, When it is received, Then it is rejected with HTTP 401 and no entry is created.
  - **AC-WH-002**: Given a webhook request with a valid token but a payload that fails schema validation for its target type, When it is received, Then it is rejected with HTTP 400 including a machine-readable error, and no entry is created.
  - **AC-WH-003**: Given a webhook request with a valid token and a valid payload for a supported type (`mail`, `message`, `log`, `alert`), When it is received, Then the corresponding entry is created **synchronously** and the response is **HTTP 201** with the created entry's identifier (the entry is durably persisted before the response returns; see AC-WH-007).
  - **AC-WH-004** (Idempotency): Given two webhook requests carrying the **same client-supplied idempotency key** and the same token, When both are received, Then only one entry is created and the second response indicates the existing entry (returning its identifier) rather than creating a duplicate. Idempotency keys are scoped per token: the same key presented under a different token creates a separate entry.
  - **AC-WH-010** (No-key behavior): Given a webhook request that **omits the optional idempotency key**, When it is received — including on a sender retry — Then it is processed as a new create and MAY produce a duplicate entry; deduplication is guaranteed **only** when an idempotency key is supplied (AC-WH-004).
  - **AC-WH-005** (Rate limiting): Given a token that exceeds its configured request rate, When further requests arrive within the window, Then they are rejected with HTTP 429 and a retry indication, and no entries are created for the throttled requests.
  - **AC-WH-006**: Given a webhook targeting an unsupported type, When it is received, Then it is rejected with HTTP 400 and no entry is created.
  - **AC-WH-011** (Body limits): Given a webhook request whose body exceeds the configured maximum size or whose body is not parseable JSON, When it is received, Then it is rejected with **HTTP 413** (oversized) or **HTTP 400** (unparseable) respectively, and no entry is created.
  - **AC-WH-007**: Given a valid ingest that succeeds, When the target section is subsequently viewed by an authenticated user, Then the ingested entry appears there (end-to-end path is observable; consistent with the synchronous create in AC-WH-003).

**FR-WH-002: Webhook token management**

- Description: Any authenticated member of the active workspace can provision and revoke incoming webhooks for a channel. Every newly created channel webhook is bound to exactly one channel. Pre-existing and newly managed legacy tokens whose `channelId` is null remain workspace-wide for compatibility and continue through `/api/webhook-tokens/**` and `POST /api/webhooks/<type>`; those legacy management routes must neither list nor revoke channel-scoped credentials. This precisely supersedes Q-9 only for new channel webhooks.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-WH-008**: Given an authenticated workspace member and an existing channel in the active workspace, When they create a named channel webhook, Then a 24-random-byte secret is generated, only its SHA-256 hash and display prefix are stored, and the tokenized URL is returned and shown once. List responses never contain the secret or hash.
  - **AC-WH-009**: Given an existing channel webhook, When an authenticated member of the same workspace revokes it, Then the first and repeated revoke return HTTP 204 and subsequent requests presenting that URL are rejected with HTTP 401. Foreign workspace/channel/webhook identifiers return a non-disclosing HTTP 404.

**Channel webhook wire contract:**

- Management requires a session, matching `X-Inspoter-Workspace`, and workspace membership: `GET /api/channels/<channel-id>/webhooks` → `200` metadata array; `POST` to the same path with strict `{ "name": string }` trimmed to 1–80 characters → `201 { webhook, url }`; `DELETE /api/channels/<channel-id>/webhooks/<webhook-id>` → `204`. The returned `url` is a same-origin relative path and is never recoverable after the creation response.
- Public delivery is `POST /api/webhooks/channels/<webhook-id>/<token>` with strict JSON `{ "content": string, "author"?: string }`. Trimmed `content` is 1–4000 characters; optional trimmed `author` is 1–80 and defaults to the webhook name. Unknown fields, including `channelId`, are rejected and the stored webhook relation supplies the destination.
- `Idempotency-Key` is optional; when present it is 1–128 printable ASCII characters. A new committed message returns `201 { id }`; a completed replay returns `200 { id }`; malformed JSON/schema/key returns `400`; invalid, revoked, or cascade-deleted credential returns `401`; an oversized body returns `413`; throttling returns `429` with `Retry-After`. Same-token/key concurrency must commit exactly one message and one idempotency record; a losing transaction returns the winner's id.

---

### 3.9 Provider Abstraction (cross-cutting)

**FR-PROV-001: Provider abstraction with independent per-provider modes**

- Description: External DNS and server integrations use a common provider boundary. Each provider selects its mode independently from its deployment credential: absent means deterministic workspace-owned mock mode, valid means real mode through an exclusive active-workspace resource binding, and configured but invalid or revoked means a provider-specific error without mock fallback (Q-11, Q-13).
- Priority: Must Have (Later) — foundational for Domains/Servers slices.
- Acceptance Criteria:
  - **AC-PROV-001**: Given an individual provider has no configured credential, When Domains or Servers uses that provider, Then it returns deterministic data isolated to the active workspace and makes zero external network calls; every other provider continues in its independently selected mode.
  - **AC-PROV-002**: Given an individual provider has a valid configured credential and a resource is exclusively bound to the active workspace, When Domains or Servers uses that local binding, Then the abstraction routes to the real provider without a code change; an invalid/revoked credential returns a provider-specific authentication error with no mock fallback; a foreign binding returns not-found and makes zero provider calls.
  - **AC-PROV-003**: Given a provider operation is not supported by a given provider, When it is invoked, Then the abstraction returns a well-formed "unsupported operation" result rather than throwing an unhandled error.

---

### 3.10 Workspaces

**FR-WS-001: Workspaces (CRUD)**

- Description: Every visible and operable content area is workspace-scoped: Bookmarks, Domains and DNS records, Servers, Mail, Messages, Logs, Alerts, webhook tokens, Settings state, categories, child entities, provider-resource bindings, mock state, caches, and cursors. Provider credentials remain deployment-scoped `.env` secrets. A workspace owns local provider bindings, never the upstream resource itself. Operators can create, rename, and delete workspaces; a default workspace is provisioned automatically on first operator registration.
- Priority: Must Have (Later, post-Slice-1)
- Acceptance Criteria:
  - **AC-WS-001**: Given the first operator is provisioned (env-seeded bootstrap or a fresh seed run), When registration/seeding completes, Then a default workspace is created and that operator is made its member (owner role) without any additional manual step.
  - **AC-WS-002**: Given an authenticated operator, When they submit a workspace-create request with a name, Then a new workspace is persisted (with a unique slug derived from the name) and the operator becomes its owner; When the name is empty, Then a validation error is shown and no workspace is created.
  - **AC-WS-003**: Given a workspace the operator owns, When they rename it, Then the new name is persisted and reflected everywhere the workspace name is displayed (e.g., the workspace switcher).
  - **AC-WS-004**: Given an owner deletes a workspace after every provider binding is idle, When deletion commits, Then all local content and provider-resource bindings cascade-delete, no upstream domain, DNS record, server, or other provider resource is deleted, and affected sessions fall back deterministically to another membership or to login/workspace selection. The last owner and last workspace membership cannot be removed through rename/delete/member operations.

**FR-WS-002: Workspace membership and invite**

- Description: New operator accounts are **not** self-service; they are created invite-only by an existing workspace owner. An owner can either grant access to an already-existing operator (by username) or create a brand-new operator account as part of adding them to the workspace.
- Priority: Must Have (Later, post-Slice-1)
- Acceptance Criteria:
  - **AC-WS-005**: Given a workspace owner and an existing operator username not yet a member, When the owner adds that operator to the workspace, Then a `WorkspaceMember` record is created linking the operator to the workspace and the operator gains access to that workspace's content on next workspace switch/login.
  - **AC-WS-006**: Given a workspace owner and a username that does not yet exist, When the owner invites a new user by supplying a username and password, Then a new operator account is created and simultaneously added as a member of that workspace, and the new operator can subsequently log in with those credentials.
  - **AC-WS-007**: Given a workspace owner and an existing member of that workspace, When the owner removes that member, Then the corresponding `WorkspaceMember` record is deleted and the removed operator can no longer access that workspace's content (other workspaces they belong to are unaffected).
  - **AC-WS-008**: Given two or more operators are members of the same workspace, When each authenticates and selects it, Then each independently sees and can act on the same shared Bookmarks, Domains/DNS, Servers, Mail, Messages, Logs, Alerts, token, and Settings state permitted by their `OWNER` or `MEMBER` role.

**FR-WS-003: Workspace switching**

- Description: An operator who belongs to more than one workspace can switch which workspace is active. The active workspace scopes every subsequent read, write, cache, cursor, local provider binding, and provider-backed operation. Session-authenticated browser APIs require the workspace id rendered with the current page as a stale-context precondition; this value never selects a workspace or grants authority.
- Priority: Must Have (Later, post-Slice-1)
- Acceptance Criteria:
  - **AC-WS-009**: Given an authenticated operator, When they switch their active workspace, Then the choice is persisted on the session (`activeWorkspaceId`) and is used to resolve the workspace on every subsequent request; When no active workspace is set on the session (e.g., after the active workspace was deleted), Then the workspace resolves to one of the operator's remaining memberships.
  - **AC-WS-010**: Given the workspace switcher in the sidebar, When the operator selects another membership, Then Bookmarks, Domains, DNS records, Servers, Mail, Messages, Logs, Alerts, tokens, and Settings update to the new workspace without a full page reload; stale in-flight responses never repaint the new workspace.
  - **AC-WS-011**: Given an operator with access to multiple workspaces, When they read or mutate any section, category, child, token, provider binding, mock resource, cache entry, or cursor, Then only active-workspace state is visible or operable. Foreign or missing local ids return a non-disclosing not-found response before queries cross the ownership boundary or provider/network calls occur.

Members may use normal content, DNS, server power actions, create workspaces, and list members. Owners additionally manage workspace metadata, membership, provider discovery/claim/removal, and binding transfer. This is the complete `OWNER`/`MEMBER` distinction for this iteration; granular RBAC remains out of scope. AC-WS-008, AC-WS-010, and AC-WS-011 remain `PARTIAL` by facet through R2.7 and become `PASS`, and the workspace family 11/11, only after the R2.8 two-workspace/two-member all-section runtime gate.

---

### 3.11 Real provider enablement

**FR-REAL-001: Incremental real-account provider enablement**

- Description: The operator can use real Cloudflare DNS, Hetzner Cloud, Hetzner DNS, and GoDaddy accounts as credentials become available through environment configuration. Enablement priority is Cloudflare DNS → Hetzner Cloud → Hetzner DNS → GoDaddy (Q-11). Credentials and secret values never appear in this document.
- Priority: Must Have for each provider enabled under Q-11
- Workspace rule: Every `-001` and `-002` criterion operates through an active-workspace local binding with a stable provider-account key and remote resource id. A foreign or missing binding returns a non-disclosing not-found response with zero provider calls. Account identity mismatch blocks the operation; display-name matching never claims or transfers a resource.
- Safety rule: Provider discovery, claim, transfer, removal, and mutation follow the owner/member and reconciliation rules in §3.10. Removing a local binding or workspace never deletes the upstream resource.
- Acceptance Criteria:
  - **AC-REAL-CF-001**: Given a valid configured Cloudflare credential, When the operator opens Domains and its DNS views, Then the UI shows real zones and records from that Cloudflare account.
  - **AC-REAL-CF-002**: Given Cloudflare is enabled with a valid configured credential and a DNS record suitable for mutation, When the operator creates, updates, and deletes the record, Then every create, update, and delete operation reaches Cloudflare, and a subsequent provider reread after each operation confirms respectively that the record exists with the created values, reflects the updated values, and no longer exists.
  - **AC-REAL-CF-003**: Given a configured but invalid or revoked Cloudflare credential, When Domains loads, Then Cloudflare shows a provider-specific authentication error, data from healthy configured providers remains available, and the page does not crash.
  - **AC-REAL-CF-004**: Given Cloudflare real mode is configured or used, When application responses and logs are inspected, Then the Cloudflare credential value is absent.
  - **AC-REAL-HC-001**: Given a valid configured Hetzner Cloud credential, When the operator opens Servers, Then the UI shows real servers and their current states from that Hetzner Cloud account.
  - **AC-REAL-HC-002**: Given a valid configured Hetzner Cloud credential and a supported start, stop, or restart action, When the operator completes the action, Then Hetzner Cloud receives it and a subsequent provider poll confirms the resulting server state.
  - **AC-REAL-HC-003**: Given a configured but invalid or revoked Hetzner Cloud credential, When Servers loads, Then Hetzner Cloud shows a provider-specific authentication error, data from healthy configured providers remains available, and the page does not crash.
  - **AC-REAL-HC-004**: Given Hetzner Cloud real mode is configured or used, When application responses and logs are inspected, Then the Hetzner Cloud credential value is absent.
  - **AC-REAL-HD-001**: Given a valid configured Hetzner DNS credential, When the operator opens Domains and its DNS views, Then the UI shows real zones and records from that Hetzner DNS account.
  - **AC-REAL-HD-002**: Given Hetzner DNS is enabled with a valid configured credential and a DNS record suitable for mutation, When the operator creates, updates, and deletes the record, Then every create, update, and delete operation reaches Hetzner DNS, and a subsequent provider reread after each operation confirms respectively that the record exists with the created values, reflects the updated values, and no longer exists.
  - **AC-REAL-HD-003**: Given a configured but invalid or revoked Hetzner DNS credential, When Domains loads, Then Hetzner DNS shows a provider-specific authentication error, data from healthy configured providers remains available, and the page does not crash.
  - **AC-REAL-HD-004**: Given Hetzner DNS real mode is configured or used, When application responses and logs are inspected, Then the Hetzner DNS credential value is absent.
  - **AC-REAL-GD-001**: Given a valid configured GoDaddy credential, When the operator opens Domains and its DNS views, Then the UI shows real domains and records from that GoDaddy account.
  - **AC-REAL-GD-002**: Given GoDaddy is enabled with a valid configured credential and a DNS record suitable for mutation, When the operator creates, updates, and deletes the record, Then every create, update, and delete operation reaches GoDaddy, and a subsequent provider reread after each operation confirms respectively that the record exists with the created values, reflects the updated values, and no longer exists.
  - **AC-REAL-GD-003**: Given a configured but invalid or revoked GoDaddy credential, When Domains loads, Then GoDaddy shows a provider-specific authentication error, data from healthy configured providers remains available, and the page does not crash.
  - **AC-REAL-GD-004**: Given GoDaddy real mode is configured or used, When application responses and logs are inspected, Then the GoDaddy credential value is absent.

Each provider selects its mode independently under AC-PROV-001..002: an absent credential yields deterministic workspace-isolated mock data and zero external calls; a valid configured credential enables real mode only for resources exclusively bound to the active workspace; and an invalid or revoked credential yields that provider's authentication error without mock fallback. Switching workspace changes the visible and operable Domains/Servers set. Removing a binding or deleting a workspace deletes local state only and never deletes the upstream resource.

---

### 3.12 Optional demo data

**FR-DEMO-001: Optional production-separated demo seed**

- Description: An operator can choose the `db:seed:demo` outcome in a non-production environment to populate a representative, reusable demonstration without changing the default production seed (Q-12).
- Priority: Must Have
- Acceptance Criteria:
  - **AC-DEMO-001**: Given a fresh non-production installation, When the operator runs the optional `db:seed:demo` outcome, Then representative data becomes visible in all seven product sections: Bookmarks, Domains, Servers, Mail, Messages, Logs, and Alerts.
  - **AC-DEMO-002**: Given demo data already exists, When the operator runs the optional demo seed again, Then no duplicate demo records are created and existing demo identities remain stable.
  - **AC-DEMO-003**: Given a production environment or production dataset, When demo seeding is considered or requested, Then demo records are not added to or mixed with production data; the optional demo outcome remains separated in a non-production environment or explicitly designated demo workspace.

## 4. Non-Functional Requirements

**NFR-DEPLOY-001 (Self-hosted / Docker):** The application must be deployable as a self-hosted service via Docker on a single host, backed by PostgreSQL. _Verification:_ a documented `docker`-based startup brings up the app + database and serves the login screen. (Traces to Decisions log: self-hosted, single deploy, PostgreSQL + Prisma.)

**NFR-SEC-001 (Panel authentication):** All dashboard routes and data APIs require an authenticated session; only the login route and the webhook ingest API (token-authenticated) are reachable unauthenticated. _Verification:_ AC-AUTH-001, AC-WH-001.

**NFR-SEC-002 (Provider/webhook secret handling):** Provider API keys and webhook token secrets must be sourced from environment variables or stored such that secret values are never returned in list/detail API responses or rendered in the UI after creation. Channel-webhook creation and public-delivery responses are non-cacheable; the UI keeps the returned URL only in transient dialog state and never in storage, RSC props, toast text, analytics, or logs. Because the channel webhook credential is embedded in the URL, reverse proxies **MUST redact the full request path for `/api/webhooks/channels/*`** in access and error logs. _Verification:_ inspect persistence and API responses for raw secret values (absent except the one-time creation response), inspect cache/referrer headers, close/reopen the dialog to prove non-reveal, and verify proxy-log fixtures contain no tokenized path.

**NFR-SEC-003 (Webhook abuse resistance):** The webhook ingest API must enforce token auth (AC-WH-001), payload validation (AC-WH-002), body-size/parse limits (AC-WH-011), and rate limiting (AC-WH-005) to resist unauthorized or abusive ingestion. Aligns with OWASP API Top 10 (broken auth, unrestricted resource consumption).

**NFR-SEC-004 (Workspace-context precondition):** Every session-authenticated browser API request, including workspace list/create/admin/switch, must present the non-empty ASCII `X-Inspoter-Workspace` value rendered with the page (maximum 128 bytes). The server first authenticates and resolves membership, then compares the header with the session workspace before any business query, cache, write, binding lookup, or provider call. Missing or malformed context returns `400 WORKSPACE_CONTEXT_REQUIRED`; stale or inaccessible context returns `409 WORKSPACE_CONTEXT_STALE`. The header never selects or authorizes a workspace. Login, logout, public webhooks, assets, and direct Server Component reads are excluded. A stale mutation is never retried automatically.

**NFR-PERF-001 (List pagination):** All potentially unbounded lists (Mail, Logs, Alerts, and Messages within a channel) must be paginated (server-side), returning a bounded page size (default target: 50 items/page, configurable) so a single request never loads the entire table. _Verification:_ AC-MAIL-005, AC-LOG-004, AC-ALR-006, AC-MSG-007; response payload item count ≤ configured page size.

**NFR-PERF-002 (Interactive responsiveness):** Under nominal single-user self-hosted load with a warm database, list section reads (a single page) using **equality/range filters and sorted reads** should return in under 500ms server processing time for datasets up to 100k rows in the queried table, assuming appropriate B-tree indexing. **Substring/text-search filters (AC-MAIL-003, AC-LOG-002, and the text-query paths of AC-ALR-004) are excluded from the 500ms target unless** a trigram (`pg_trgm` GIN) or full-text index strategy is adopted; if such an index is not present, substring filters carry no numeric latency guarantee and MUST remain paginated (NFR-PERF-001) to bound work. _Verification:_ measured server timing on a seeded dataset for non-text filters; for text filters, verify either that the trigram/full-text index strategy exists OR that the pagination-only fallback is in place. _(Assumption on dataset scale — see A-3; index-strategy choice is an architecture decision.)_

**NFR-A11Y-001 (Accessibility baseline):** Interactive controls (navigation, forms, list actions) must be keyboard operable and have accessible names; the UI should meet WCAG 2.1 AA for color contrast and focus visibility on the shell and Bookmarks section at minimum. _Verification:_ automated accessibility check (e.g., axe) passes with no critical violations on Slice 1 screens.

**NFR-I18N-001 (Russian-only visible UI):** The finite allowlist of operator-visible non-Russian terms is: `inspoter`, `Cloudflare`, `Hetzner Cloud`, `Hetzner DNS`, `GoDaddy`, `DNS`, `VPS`, `IP`, `URL`, `TTL`, `HTTP`, `HTTPS`, `API`, and `JSON`. Technical identifiers, environment-variable names, and API snippets are exempt only when rendered as code or monospace. All unlisted operator-visible navigation, headings, labels, actions, validation messages, errors, loading states, empty states, and notifications must be Russian. Legacy English visible copy in `specs/ui.md` is non-normative and must be translated. _Verification:_ an automated visible-string scan against this allowlist plus a browser walkthrough of every route, dialog, loading state, error, and empty state finds no unlisted English UI text (Q-1).

**NFR-THEME-001 (Light theme primary):** The product ships with the light theme as its primary and only required theme in this iteration. Dark theme and a theme switcher are deferred. _Verification:_ every product route renders and remains usable in the normative light-theme states; no dark-theme or switcher acceptance is required (Q-2).

**NFR-DESIGN-001 (Normative design conformance):** Visible layout, flows, interaction, and component behavior must conform to `specs/prototype/`, `specs/inspot-design/`, and `specs/ui.md`. Q-3 makes those design properties normative, not legacy English strings, which remain subject to NFR-I18N-001. Q-13 confirms the all-content workspace switcher behavior; Q-4 supersedes only the read-only Messages statement. _Verification:_ the design audit checks every section, stale-workspace recovery, keyed remount, loading/error/empty states, and no-full-page-reload switch flow with no unexplained material delta.

**NFR-BROWSER-001 (Browser support):** The dashboard must function on current evergreen desktop browsers (latest Chrome, Firefox, Edge). Mobile browsers should render the shell without horizontal overflow (AC-SHELL-004) but full mobile optimization is not a goal.

**NFR-STACK-001 (Evidence-backed technology stack):** The product uses Next.js 16.2.10 (App Router) with TypeScript, Tailwind CSS, shadcn/ui, Next.js Route Handlers, Prisma ORM, and PostgreSQL. _Verification:_ `package.json` reports `next` and `eslint-config-next` version 16.2.10 and contains the named stack dependencies; downstream work does not rewrite the architecture in this PRD.

---

## 5. User Stories

- **US-1 (Bookmarks, Slice 1):** As a self-hosted operator, I want to organize my resource links into named categories with icons and descriptions, so that I have a single launchpad for the tools and services I use. → FR-BM-001..005
- **US-2 (Shell, Slice 1):** As an operator, I want one dashboard with a nav for all my ops sections, so that I stop switching between many tools. → FR-SHELL-001
- **US-3 (Auth, Slice 1):** As an operator, I want the dashboard to require login (a single operator seeded from env), so that my consolidated infrastructure view is not exposed publicly. → FR-AUTH-001
- **US-4 (Domains):** As an operator, I want to view my domains and edit their DNS records across Cloudflare/Hetzner/GoDaddy from one place, so that I don't log into three registrar consoles. → FR-DOM-001..002
- **US-5 (Servers):** As an operator, I want to see my Hetzner VPS statuses and start/stop/restart them, so that I can manage compute without the Hetzner console. → FR-SRV-001..002
- **US-6 (Mail):** As an operator, I want to view, filter, and sort incoming mail, so that I can triage messages pushed from my systems. → FR-MAIL-001
- **US-7 (Messages):** As an operator, I want Discord-style categories and channels that both external systems and authenticated operators can post into, so that notifications and operator notes are organized by topic. → FR-MSG-001..003
- **US-8 (Logs):** As an operator, I want to browse, filter, and sort logs pushed from my systems, so that I can investigate incidents in one place. → FR-LOG-001..002
- **US-9 (Alerts):** As an operator, I want categorized alerts that I can filter and sort, fed by my monitoring systems, so that I can respond to problems quickly. → FR-ALR-001..003
- **US-10 (Webhook, external system):** As an external system, I want to POST mail/messages/logs/alerts to the dashboard with a token, so that my events show up in the operator's dashboard reliably — and **without duplicates when I supply an idempotency key** (delivery without a key is at-least-once and may duplicate, per AC-WH-010). → FR-WH-001..002
- **US-11 (Workspaces):** As an operator, I want to create workspaces to organize my infrastructure by project/team. → FR-WS-001
- **US-12 (Workspace invite):** As a workspace owner, I want to invite team members so they can access shared resources. → FR-WS-002
- **US-13 (Workspace switching):** As an operator with multiple workspaces, I want to switch between them seamlessly. → FR-WS-003
- **US-14 (Real providers):** As an operator, I want valid provider credentials to show and change real DNS/server state, so that the dashboard replaces routine provider-console work. → FR-REAL-001
- **US-15 (Demo data):** As an operator evaluating the product, I want an optional, repeatable demo dataset separated from production, so that I can inspect every product section safely. → FR-DEMO-001
- **US-16 (Mail client, Q-14):** As an operator, I want to connect my IMAP/SMTP mailboxes and read, organize, and answer mail directly in the dashboard, so that I do not need a separate mail client for operational mailboxes. → FR-MAIL-003..007

---

## 6. Constraints, Assumptions & Uncertainties

### 6.1 Hard constraints (user-specified)

| ID    | Constraint                                                                                                                                                                                                                                                                                                | Establishing source                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| HC-1  | Stack: Next.js 16.2.10 (App Router) + TypeScript + Tailwind + shadcn/ui; Route Handlers for API/webhooks; Prisma + PostgreSQL.                                                                                                                                                                            | `package.json`; progress.md stack decision                                                      |
| HC-2  | Self-hosted, single-user or small-team deployment.                                                                                                                                                                                                                                                        | Brief Context                                                                                   |
| HC-3  | Provider modes are independent and environment-only: absent credential → deterministic mock with zero external calls; valid configured credential → real; configured invalid/revoked credential → provider-specific error with no mock fallback. Credentials arrive incrementally in Q-11 priority order. | Q-11; progress.md Decisions log                                                                 |
| HC-4  | Delivery in vertical slices; Slice 1 = shell + minimal auth + Bookmarks.                                                                                                                                                                                                                                  | Brief Context / plan; progress.md line 3 + debate-cycle-1 decision                              |
| HC-5  | All visible UI is Russian-only except the finite allowlist in NFR-I18N-001 and code/monospace technical exemptions.                                                                                                                                                                                       | Q-1                                                                                             |
| HC-6  | Seven sections exactly as named: Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts.                                                                                                                                                                                                               | `docs/idea.md`                                                                                  |
| HC-7  | DNS providers: Cloudflare, Hetzner DNS, GoDaddy. Server provider: Hetzner Cloud.                                                                                                                                                                                                                          | `docs/idea.md`; Q-11                                                                            |
| HC-8  | Mail, Messages, Logs, Alerts must each support webhook ingest from external systems.                                                                                                                                                                                                                      | `docs/idea.md`                                                                                  |
| HC-9  | Slice 1 bootstrap = single operator, env-seeded credentials; no self-service registration. Post-Slice-1, additional operators are added invite-only by a workspace owner (FR-WS-002); RBAC beyond the workspace `role` field is still out of scope.                                                       | Coordinator decision, debate cycle 1 (progress.md Decisions log); extended by workspaces (D-13) |
| HC-10 | Light theme is primary; dark theme and the switcher are deferred.                                                                                                                                                                                                                                         | Q-2                                                                                             |
| HC-11 | Normative design inputs are `specs/prototype/`, `specs/inspot-design/`, and `specs/ui.md` for layouts, flows, and design; legacy English visible copy is non-normative and subject to translation.                                                                                                        | Q-3                                                                                             |
| HC-12 | Authenticated operator posting to an existing Messages channel is in scope; missing channels never auto-create.                                                                                                                                                                                           | Q-4; Q-8                                                                                        |
| HC-13 | ~~Mail is read-only~~ (superseded by Q-14, 2026-07-18 — Mail is a full multi-account client, §3.4); Servers excludes lifecycle; Alerts excludes acknowledge/resolve.                                                                                                                                       | Q-5 (superseded); Q-14; Q-6; Q-7                                                                |
| HC-14 | Optional demo data is idempotent, covers all seven sections, and remains separated from production.                                                                                                                                                                                                       | Q-12                                                                                            |
| HC-15 | Every visible/operable area is workspace-scoped, including Domains and Servers; provider credentials alone remain deployment-scoped secrets.                                                                                                                                                              | Q-13                                                                                            |

### 6.2 Assumptions & Uncertainties register

Confidence is categorical: `low` / `medium` / `high` / `unknown`.

| ID  | Assumption / Uncertainty                                                                                                                                                                                                                                                                                                                             | Source / Evidence                                                                                                                                                                                                                      | Impact                    | Confidence | Owner     | Validation method                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------- | --------- | ------------------------------------------------------------- |
| A-1 | Historical constraint, Mail portion superseded by Q-14 (2026-07-18): Mail is a full multi-account client (§3.4). Logs still supports view/filter/sort; Alerts supports view/organize/delete; alert acknowledge/resolve remains out.                                                                                                                   | Q-5 (superseded); Q-14; Q-7                                                                                                                                                                                                            | Scope of Mail/Logs/Alerts | high       | User      | Verify FR-MAIL-001..007/FR-LOG/FR-ALR against Q-14 scope      |
| A-2 | Bookmark "icon" is a reference (icon name/URL/emoji), not an uploaded image asset.                                                                                                                                                                                                                                                                   | Dashy/Homarr parallel; simplest interpretation. Favicon-suggest (A-6) populates this same reference-value field with a service URL; it does not change A-2's nature — the result is indistinguishable from a manually pasted icon URL. | Bookmarks data model      | medium     | Architect | Confirm at Slice 1 design                                     |
| A-3 | Data volumes are modest (self-hosted personal ops); tables in the low-100k-row range at most.                                                                                                                                                                                                                                                        | Persona is single-user/small-team.                                                                                                                                                                                                     | NFR-PERF-002 targets      | medium     | User      | Confirm expected retention/volume                             |
| A-4 | Q-9 remains binding only for legacy null-channel tokens. New channel webhooks are message-only capabilities bound to one channel; no legacy secret is migrated, rotated, or invalidated.                                                                                                                                                             | Q-9, superseded in part by the channel-webhook amendment (2026-07-18)                                                                                                                                                                  | FR-WH-002 scope           | high       | User      | Verify legacy isolation and channel-derived destination       |
| A-5 | Confirmed constraint: Mail, Messages, Logs, and Alerts have no automatic retention or expiry; records remain until an in-scope deletion occurs.                                                                                                                                                                                                      | Q-10                                                                                                                                                                                                                                   | Storage growth            | high       | User      | Verify no automatic deletion; accept R-5                      |
| A-6 | Favicon suggestion for Bookmarks is opt-in only: an explicit operator action fetches a suggestion from a fixed, hardcoded third-party service (Google's public favicon endpoint) keyed on the bookmark URL's hostname; there is no automatic/background fetching of the bookmark's own host (fallback per AC-BM-011/AC-BM-028 covers load failures). | Simplicity; explicit operator action only; not a background crawl.                                                                                                                                                                     | Bookmarks FR              | medium     | User      | Confirm at Slice 1                                            |
| A-7 | Confirmed constraint: Servers covers inventory/configuration viewing, status, start, stop, and restart; lifecycle operations are excluded.                                                                                                                                                                                                           | Q-6                                                                                                                                                                                                                                    | Servers scope             | high       | User      | Verify FR-SRV-001..002; confirm lifecycle controls are absent |

### 6.3 Third-party & stakeholder dependencies

- **Cloudflare API, Hetzner API (DNS + Cloud/servers), GoDaddy API** — external, credential-gated; abstracted with mock mode (availability not guaranteed). Dependency-failure behavior specified in Negative Scenarios.
- **PostgreSQL** — required datastore (HC-1).
- **Mail source** — mail enters through webhook ingest (FR-MAIL-002) into the system webhook mailbox, and, since Q-14, through IMAP synchronization of operator-connected accounts (FR-MAIL-004). Outbound mail uses the account's SMTP transport (FR-MAIL-006).
- **Stakeholder:** the single operator is both admin and primary user; no conflicting multi-role approval flows.

---

## 7. Scope Alternatives & Trade-offs

### Alternative A — Full breadth first (all 7 sections shallow, then deepen)

Build thin versions of all seven sections simultaneously.

- Pros: early visual completeness.
- Cons: high integration risk up front (three DNS providers + Hetzner + webhooks all at once); no working vertical to validate the stack; contradicts the vertical-slice decision.

### Alternative B — Tracer bullet vertical slice (SELECTED)

Deliver Slice 1 = dashboard shell + minimal env-seeded auth + fully working Bookmarks (no external provider dependency), then add sections as later vertical slices, each provider-backed behind the mock-capable abstraction.

- Pros: proves the full stack (Next.js + Prisma + PostgreSQL + shadcn/ui + auth) end-to-end on the lowest-risk section; Bookmarks has zero external-provider dependency so Slice 1 needs no third-party credentials (only env-seeded operator creds); matches HC-4 and the Decisions log.
- Cons: operational sections (the differentiating value) arrive later.

**Decision:** Alternative B, per HC-4 and progress.md line 3 + debate-cycle-1 decision. **Traded away:** early breadth across operational sections in exchange for lower delivery risk and an early working, testable product increment.

### Sub-decision — Webhook ingest: unified vs per-section

Considered four independent per-section webhook endpoints vs one unified, typed ingest mechanism. **Selected: unified** (FR-WH-001) because the four sections share identical needs (token auth, payload validation, idempotency, size limits, rate limiting); one mechanism reduces duplicated security surface. **Traded away:** per-section bespoke payload ergonomics, mitigated by a `type` discriminator in the payload.

---

### Sub-decision — Real providers: all-at-once vs incremental

An all-at-once rollout would delay every provider until all credentials and account prerequisites are ready. **Selected:** incremental enablement in Q-11 order. Each provider independently uses deterministic mock mode with zero external calls when its credential is absent, real mode when its configured credential is valid, and a provider-specific error without mock fallback when its configured credential is invalid or revoked.

**Trade-off:** operators receive real value earlier and one unhealthy provider cannot block the rest; the product may contain a documented mix of mock, real, and provider-error modes until all intended credentials are valid.

## 8. Negative Scenarios

| #    | Scenario                                                                                              | Expected behavior                                                                                                                                                          | Affected AC-IDs                                               |
| ---- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| N-1  | DNS/server provider unreachable or returns 5xx.                                                       | Section renders with per-provider error indicator; healthy providers still shown; no crash.                                                                                | AC-DOM-003, AC-SRV-003, AC-PROV-003                           |
| N-2  | Provider rejects a DNS/power mutation.                                                                | Error surfaced to user; displayed state reflects actual provider (unchanged) state.                                                                                        | AC-DOM-009, AC-SRV-008                                        |
| N-3  | Webhook request with missing/invalid/revoked token.                                                   | HTTP 401; nothing created.                                                                                                                                                 | AC-WH-001, AC-WH-009                                          |
| N-4  | Webhook payload fails schema validation.                                                              | HTTP 400 with machine-readable error; nothing created.                                                                                                                     | AC-WH-002                                                     |
| N-5  | Duplicate webhook delivery WITH same idempotency key.                                                 | Exactly one entry created; second call returns existing entry.                                                                                                             | AC-WH-004                                                     |
| N-5b | Retry/duplicate delivery WITHOUT an idempotency key.                                                  | Processed as new create; duplicate entry may result (at-least-once); no dedup guarantee.                                                                                   | AC-WH-010                                                     |
| N-6  | Webhook sender floods the endpoint.                                                                   | Excess requests get HTTP 429; no entries created for throttled calls.                                                                                                      | AC-WH-005, NFR-SEC-003                                        |
| N-7  | Webhook targets a non-existent channel (Messages).                                                    | HTTP 4xx; no message created (MVP: no auto-create).                                                                                                                        | AC-MSG-006                                                    |
| N-8  | Unauthenticated user requests a dashboard route.                                                      | Redirect to login; no data returned.                                                                                                                                       | AC-AUTH-001                                                   |
| N-8b | Required auth env vars absent at startup.                                                             | App fails fast / blocks login; never serves an unauthenticated dashboard.                                                                                                  | AC-AUTH-005                                                   |
| N-9  | Invalid bookmark input (empty name, bad URL).                                                         | Validation error; nothing persisted.                                                                                                                                       | AC-BM-007, AC-BM-008, AC-BM-005                               |
| N-10 | Deleting a category/channel/alert-category that contains children.                                    | Confirmed cascade or reassignment; no orphans remain.                                                                                                                      | AC-BM-004, AC-MSG-003, AC-ALR-002                             |
| N-11 | Bookmark icon missing or fails to load.                                                               | Deterministic fallback rendered; no broken image.                                                                                                                          | AC-BM-011                                                     |
| N-12 | Large list section (10k+ rows).                                                                       | Server-side pagination bounds each response; UI stays responsive.                                                                                                          | AC-MAIL-005, AC-LOG-004, AC-ALR-006, AC-MSG-007, NFR-PERF-001 |
| N-13 | No real provider credentials configured.                                                              | Each provider independently returns deterministic mock data, makes zero external calls, and remains fully exercisable.                                                     | AC-PROV-001, AC-DOM-002, AC-SRV-002                           |
| N-14 | Webhook body oversized or non-JSON/unparseable.                                                       | HTTP 413 (oversized) or HTTP 400 (unparseable); nothing created.                                                                                                           | AC-WH-011, NFR-SEC-003                                        |
| N-15 | Operator submits empty or whitespace-only message content.                                            | Client error; no message record.                                                                                                                                           | AC-MSG-012                                                    |
| N-16 | Operator posts to a missing channel.                                                                  | Client error; no message or channel; no auto-create.                                                                                                                       | AC-MSG-013; Q-8                                               |
| N-17 | Operator message persistence fails.                                                                   | Visible failure; no optimistic false success; confirmed feed state remains.                                                                                                | AC-MSG-014                                                    |
| N-18 | One configured real-provider credential is invalid or revoked.                                        | That provider returns a provider-specific authentication error with no fallback to mock; unrelated providers retain their independent modes; no crash.                     | AC-PROV-002, AC-REAL-CF/HC/HD/GD-003                          |
| N-19 | One provider credential is absent.                                                                    | Only that provider uses deterministic mock mode and makes zero external calls; unrelated providers retain their independent modes.                                         | AC-PROV-001; Q-11                                             |
| N-20 | Demo seed is repeated or requested against production.                                                | Repeat creates no duplicates; production data is unchanged and remains separate.                                                                                           | AC-DEMO-002..003                                              |
| N-21 | A stale tab submits a request after another tab switches workspace.                                   | Server returns `409 WORKSPACE_CONTEXT_STALE` before business or provider work; client discards stale data, refreshes/remounts, and never retries a mutation automatically. | AC-WS-009..011, NFR-SEC-004                                   |
| N-22 | A local provider binding belongs to another workspace or is missing.                                  | Non-disclosing 404 before provider/network access; no account-name matching or implicit claim.                                                                             | AC-DOM-004..009, AC-SRV-004..008, AC-PROV-002, AC-WS-011      |
| N-23 | A provider mutation times out after a possible upstream commit.                                       | Binding enters reconciliation-required state; reads may reconcile, while mutations, transfer, removal, and workspace deletion stay blocked until resolved.                 | AC-DOM-005..009, AC-SRV-004..008                              |
| N-24 | Workspace deletion includes provider bindings.                                                        | Idle local bindings and local content delete; upstream provider resources remain unchanged.                                                                                | AC-WS-004                                                     |
| N-25 | A member attempts an owner-only workspace, membership, discovery, claim, removal, or transfer action. | Request is denied without changing local or upstream state.                                                                                                                | AC-WS-003..007                                                |

---

## 9. Decisions & Residual Risks

### Decisions

| ID   | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Source / Evidence                                                | Affected requirements                                                                   |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| D-1  | Deliver via vertical slices; Slice 1 = shell + minimal auth + Bookmarks.                                                                                                                                                                                                                                                                                                                                                                                          | progress.md line 3, 37; brief; debate-cycle-1 decision           | All Slice 1 ACs                                                                         |
| D-2  | Provider modes are independent: absent credential means deterministic mock with zero external calls; valid configured credential means real mode; configured invalid/revoked credential means a provider-specific error with no mock fallback.                                                                                                                                                                                                                    | progress.md Decisions log 2026-07-12; Q-11                       | FR-PROV-001, Domains, Servers                                                           |
| D-3  | Unified webhook ingest with `type` discriminator, not four bespoke endpoints.                                                                                                                                                                                                                                                                                                                                                                                     | §7 sub-decision                                                  | FR-WH-001                                                                               |
| D-4  | Historical; the Mail read-only portion is **superseded by D-22/Q-14**. Logs retains view/filter/sort; Alerts retains view/organize/delete; alert acknowledge/resolve remains deferred.                                                                                                                                                                                                                                                                            | Q-5 (superseded); Q-14; Q-7                                      | FR-MAIL-001, FR-LOG-001, FR-ALR-001..002                                                |
| D-5  | Historical; **superseded by D-22/Q-14** for mailbox access: mail now also enters through IMAP synchronization of operator accounts, and outbound compose/send exists via SMTP. Webhook ingest is preserved unchanged.                                                                                                                                                                                                                                             | Q-5 (superseded); Q-14; `docs/idea.md`                           | FR-MAIL-002, FR-MAIL-004, FR-MAIL-006                                                   |
| D-6  | The evidence-backed stack includes Next.js 16.2.10; downstream agents do not redesign it in the PRD.                                                                                                                                                                                                                                                                                                                                                              | `package.json`; HC-1                                             | NFR-STACK-001                                                                           |
| D-7  | Slice 1 auth = minimal single operator, env-seeded credentials; RBAC/user-mgmt out of scope.                                                                                                                                                                                                                                                                                                                                                                      | Coordinator decision, debate cycle 1 (progress.md Decisions log) | FR-AUTH-001, AC-AUTH-002, AC-AUTH-005, HC-9                                             |
| D-8  | Webhook idempotency key is optional and scoped per token; dedup guaranteed only with a key; success = HTTP 201 synchronous create.                                                                                                                                                                                                                                                                                                                                | CH-PRD-002 / CH-PRD-007 resolution; doc-review F-3               | AC-WH-003, AC-WH-004, AC-WH-010, US-10                                                  |
| D-9  | Server power-action success = provider 2xx AND polled status equals target within bound (30/30/60s).                                                                                                                                                                                                                                                                                                                                                              | CH-PRD-003 resolution                                            | AC-SRV-004, AC-SRV-005, AC-SRV-006                                                      |
| D-10 | Messages posts to a missing channel are rejected with a client error; auto-create remains inactive under Q-8, not gated by an open question.                                                                                                                                                                                                                                                                                                                      | Q-8                                                              | AC-MSG-006, AC-MSG-008, AC-MSG-013                                                      |
| D-11 | Substring/text filters excluded from the 500ms perf target unless a trigram/full-text index is adopted; otherwise pagination-only.                                                                                                                                                                                                                                                                                                                                | CH-PRD-010 resolution                                            | NFR-PERF-002                                                                            |
| D-12 | Category/channel and alert-category deletion may cascade or reassign at implementation's discretion; only the no-orphan invariant is asserted.                                                                                                                                                                                                                                                                                                                    | Doc-review F-2                                                   | AC-MSG-003, AC-ALR-002                                                                  |
| D-13 | Workspaces are invite-only: beyond the first env-seeded operator, new operator accounts are created only by an existing workspace owner (via add-existing-member-by-username or create-new-operator-with-password); there is no self-service registration screen.                                                                                                                                                                                                 | Implementation decision, workspaces slice (post-Slice-1)         | FR-WS-002, AC-WS-005..007, HC-9                                                         |
| D-14 | Visible UI is Russian-only under the finite NFR-I18N-001 allowlist; light theme is primary; Q-3 makes the three design inputs normative for layouts, flows, and design, not legacy English visible copy.                                                                                                                                                                                                                                                          | Q-1; Q-2; Q-3                                                    | NFR-I18N-001, NFR-THEME-001, NFR-DESIGN-001                                             |
| D-15 | Authenticated operators may post messages to existing channels with persisted and visible operator-vs-webhook attribution.                                                                                                                                                                                                                                                                                                                                        | Q-4                                                              | FR-MSG-003, AC-MSG-009..014                                                             |
| D-16 | Servers is limited to inventory/status and start/stop/restart.                                                                                                                                                                                                                                                                                                                                                                                                    | Q-6                                                              | FR-SRV-001..002                                                                         |
| D-17 | Q-9 remains for legacy null-channel webhook tokens; each new channel webhook is scoped to exactly one channel. Automatic retention remains disabled and R-5 is accepted.                                                                                                                                                                                                                                                                                          | Q-9, partially superseded 2026-07-18; Q-10                       | FR-WH-002, A-4, A-5, R-5                                                                |
| D-18 | Real providers enable incrementally in Q-11 order. Release accounting is 144 unconditional active criteria + 16 conditionally applicable AC-REAL criteria + 1 inactive criterion = 161 unique criteria. Each AC-REAL is PASS when its provider is enabled or NOT_ENABLED/N/A when disabled. GoDaddy still requires AC-REAL-GD-001..004 PASS or evidenced account/API ineligibility plus a dated explicit user exclusion; missing credentials alone never qualify. | Q-11; `docs/remediation-plan.md` §5 task 3.4                     | FR-PROV-001, FR-REAL-001, §12                                                           |
| D-19 | Optional demo data covers all seven sections, is idempotent, and remains separated from production.                                                                                                                                                                                                                                                                                                                                                               | Q-12                                                             | FR-DEMO-001                                                                             |
| D-20 | **SUPERSEDED by D-21/Q-13.** Historical v3.0 limited workspace scope to database content and excluded Domains/Servers. It remains here only to preserve decision history and is non-normative.                                                                                                                                                                                                                                                                    | Historical `docs/remediation-plan.md` task 3.5                   | Superseded                                                                              |
| D-21 | Switching workspace changes every visible and operable content area, including Domains and Servers. Provider credentials remain deployment-scoped `.env` secrets; provider resources are exclusively assigned through local workspace bindings. Removing a binding or workspace never deletes the upstream resource.                                                                                                                                              | Q-13 binding user decision, 2026-07-14                           | FR-WS-001..003, FR-DOM-001..002, FR-SRV-001..002, FR-PROV-001, FR-REAL-001, NFR-SEC-004 |
| D-22 | **Q-14 (2026-07-18): Mail becomes a full multi-account IMAP/SMTP client** — accounts with app-passwords (no OAuth), folder/message sync, read/unread, delete/archive/move, attachments, compose/reply/forward. Q-5 and the Mail portions of D-4/D-5/HC-13/A-1 are superseded, not deleted. Webhook ingest keeps its contract via the system WEBHOOK mailbox. Rich-text compose, attachment forwarding, and OAuth remain out of scope; trade-offs recorded in §3.4 Known Limitations. | Q-14 binding user decision, 2026-07-18                           | FR-MAIL-001..007, AC-MAIL-007..030, Out of Scope                                        |

### Residual risks

| ID  | Residual risk                                                                                          | Mitigation / Verification / Acceptance                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Provider APIs differ in account eligibility and supported operations.                                  | Verify AC-PROV-003 and each enabled AC-REAL-* family. Dispose GoDaddy only through AC-REAL-GD-001..004 PASS or documented account/API ineligibility evidence plus a dated, explicit user exclusion decision in `docs/progress.md`.                                     |
| R-2 | Future requests could expand confirmed Mail, Servers, Alerts, or Messages boundaries.                  | Treat expansion as a new sourced FR/AC set (exercised by Q-14 → FR-MAIL-003..007/AC-MAIL-007..030); Q-4/Q-6…Q-8 and Q-14 are the accepted boundaries.                                                                                                                  |
| R-3 | Env-seeded single-operator auth (D-7): weak env values or leaked env could expose a self-hosted panel. | Verify AC-AUTH-001..005; architect selects secure hashing/session; operator responsible for env secret strength (accepted).                                                                                                                                            |
| R-4 | Webhook idempotency/rate-limit/size thresholds may need real-world calibration.                        | Accept configurable defaults; verify AC-WH-004/005/010/011 with tests; revisit thresholds post-launch.                                                                                                                                                                 |
| R-5 | No automatic retention can grow the database without bound.                                            | Explicitly accepted by Q-10; operators delete in-scope records manually and any future retention policy requires a new decision.                                                                                                                                       |
| R-6 | Text-search latency (D-11) unbounded without a trigram/FTS index.                                      | Mitigate by pagination-only fallback (NFR-PERF-001); architect decides index strategy; accepted for MVP.                                                                                                                                                               |
| R-7 | Real-provider credentials may arrive late, be invalid, or prove ineligible.                            | Record each conditional AC-REAL as PASS when its provider is enabled or NOT_ENABLED/N/A when disabled; never fall back to mock for configured invalid/revoked credentials. Missing GoDaddy credentials alone neither prove ineligibility nor satisfy its release gate. |
| R-8 | Demo data could be mistaken for production data.                                                       | Verify AC-DEMO-003 and keep the optional demo outcome production-separated.                                                                                                                                                                                            |

---

## 10. Out of Scope

Explicitly **not** part of this work (prevents scope creep):

- **Billing / payments / subscriptions.**
- **RBAC beyond the workspace `role` field.** Workspaces (§3.10) provide basic multi-user membership and an owner role for invite/remove/rename/delete actions, but there is no granular permission system, custom roles, or fine-grained access control.
- **Self-service registration.** MVP bootstrap is a single env-seeded operator (D-7); additional operators are created invite-only by a workspace owner (D-13, FR-WS-002), not via a public sign-up flow.
- **Native mobile applications** (iOS/Android). Responsive web shell only per AC-SHELL-004.
- **Rich-text (HTML) mail composition.** Compose/reply/forward are plain-text only under Q-14 (§3.4 Known Limitations).
- **Forwarding attachments.** Forward prefills the quoted text only; original attachments are not re-attached (Q-14).
- **OAuth mailbox authentication (Gmail/Google and similar).** Only IMAP/SMTP app-password credentials are supported under Q-14.
- **POP3 mailbox access.** Only IMAP is supported for inbound synchronization.
- **Webhook channel auto-create**; AC-MSG-008 remains inactive under Q-8.
- **Discord parity beyond the channel/feed/settings subset:** reactions, attachments, threads, message editing, presence, voice/video calls, realtime push delivery, and Discord wire compatibility are excluded from v1.
- **Channel-webhook secret recovery, re-reveal, automatic rotation/expiry, un-revoke, or hard-delete UI.** Rotation is create-new, sender cutover, then irreversible revoke-old.
- **VPS provisioning / resizing / rebuilding / snapshots / creating new servers.** Only list + status + start/stop/restart (HC-7, A-7).
- **Domain registration/transfer/purchase.** Only inventory + DNS record management for already-owned domains.
- **Additional UI languages, a language switcher, dark theme, and a theme switcher.** Russian-only visible UI and the light theme are required by Q-1/Q-2.
- **Alert acknowledge/resolve, routing, escalation, on-call scheduling, or outbound delivery.** Alerts retain viewing, organization, filtering, sorting, and deletion under Q-7.
- **Analytics dashboards, uptime graphs, metrics time-series** beyond the listed sections.
- **Automatic retention or expiry** for Mail, Messages, Logs, and Alerts; R-5 is accepted under Q-10.
- **Demo records in production data or production environments** (AC-DEMO-003).
- **Real provider credentials in Slice 1** — Slice 1 (Bookmarks) has no provider dependency (only env-seeded operator creds).

---

## 11. Success Metrics

Measurable criteria the tester validates:

- **M-1 (Slice 1 completeness):** 100% of Slice 1 AC-IDs (AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..034) pass automated/manual verification.
- **M-2 (Bookmarks CRUD correctness):** All bookmark and category create/read/update/delete operations persist across a page reload and satisfy their ACs, including validation rejections (AC-BM-005/007/008).
- **M-3 (Auth enforcement):** Zero dashboard routes are reachable unauthenticated (AC-AUTH-001) in a route-coverage test; the operator is bootstrapped from env (AC-AUTH-005); the webhook API is the only token-gated exception (AC-WH-001).
- **M-4 (Webhook reliability):** Duplicate deliveries with an idempotency key produce exactly one entry (AC-WH-004); deliveries without a key are documented at-least-once (AC-WH-010); over-rate deliveries are throttled with 429 (AC-WH-005); invalid tokens/payloads/oversized bodies never create entries (AC-WH-001/002/011).
- **M-5 (Provider mock parity):** Each provider whose credential is absent remains independently exercisable through deterministic active-workspace mock data with zero external network calls; two workspaces never share mutable mock state (AC-PROV-001, AC-DOM-002, AC-SRV-002).
- **M-6 (Pagination bound):** No list endpoint (including channel messages) returns more than the configured page size in a single response for a seeded large dataset (NFR-PERF-001, AC-MSG-007).
- **M-7 (Deployability):** The documented Docker startup brings up app + PostgreSQL and serves the login screen (NFR-DEPLOY-001).
- **M-8 (Accessibility baseline):** Slice 1 screens pass automated a11y checks with no critical violations (NFR-A11Y-001).
- **M-9 (Operator messaging):** AC-MSG-009..014 pass, including attribution, whitespace rejection, missing-channel rejection, and failure-state verification.
- **M-10 (Real-provider outcomes and accounting):** PRD v3 contains exactly 144 unconditional active criteria + 16 conditionally applicable AC-REAL criteria + 1 inactive criterion = 161 unique criteria. All 120 unconditional active criteria PASS. Each conditional AC-REAL is PASS when its provider is enabled or NOT_ENABLED/N/A when disabled. GoDaddy meets this metric only through AC-REAL-GD-001..004 PASS or evidenced account/API ineligibility plus a dated explicit user exclusion in `docs/progress.md`; missing credentials alone never qualify.
- **M-11 (Demo readiness):** AC-DEMO-001..003 pass on a fresh non-production environment and a repeat run.
- **M-12 (Product acceptance):** All gates in §12 pass; technical green checks alone do not constitute product acceptance.
- **M-13 (Workspace isolation):** R2.8 proves two workspaces and two members across Bookmarks, Domains/DNS, Servers, Mail, Messages, Logs, Alerts, Settings, and tokens; only then AC-WS-008/010/011 and the Workspaces family are recorded 11/11 PASS.

---

## 12. Product-ready MVP Definition of Done

The MVP is product-ready only when every gate below is complete:

1. All 144 unconditional active PRD v3 acceptance criteria are recorded as PASS in the current test plan; the sole inactive criterion, AC-MSG-008, is recorded as INACTIVE under Q-8. Workspace facets may advance independently through R2.7, but AC-WS-008/010/011 and the Workspaces family close only after R2.8.
2. All 16 conditionally applicable AC-REAL criteria are recorded per provider: each is PASS when its provider is enabled or NOT_ENABLED/N/A when disabled. GoDaddy clears the release gate only when AC-REAL-GD-001..004 PASS against an enabled, API-eligible real account, or evidenced account/API ineligibility is accompanied by a dated explicit user decision in `docs/progress.md` that excludes GoDaddy. Missing GoDaddy credentials alone never satisfy the gate or constitute exclusion evidence.
3. The operator's end-to-end real-account checklist is completed and signed, covering real DNS data and a confirmed create, update, and delete sequence for each enabled DNS provider, plus real server state and a confirmed power action when Hetzner Cloud is enabled.
4. The final user demo is completed and the user explicitly records acceptance; any requested corrections reopen this gate.

Passing lint, type checks, builds, automated tests, accessibility checks, or technical review alone does not satisfy product acceptance.

---

## Appendix A — Question dispositions

No v3 requirement is gated by an unresolved product question. Q-1…Q-13 are confirmed user decisions dated 2026-07-14.

- **OQ-1 — RESOLVED by Q-5, then REVISED by Q-14 (2026-07-18):** Q-5's read-only disposition is superseded — Mail is a full multi-account IMAP/SMTP client with compose/send (§3.4, D-22). The Q-5 history is preserved, not deleted.
- **Q-14 — RESOLVED, BINDING (2026-07-18):** the operator connects multiple IMAP/SMTP accounts (app-passwords, no OAuth); Mail provides folders, sync, read/unread, delete/archive/move, attachments, and compose/reply/forward; the webhook mailbox remains a system account with an unchanged ingest contract.
- **OQ-2 — RESOLVED by Q-4:** Authenticated operator compose is in scope via FR-MSG-003 and AC-MSG-009..014.
- **OQ-3 — RESOLVED by Q-6:** Servers includes inventory/status and start/stop/restart only; lifecycle is out.
- **OQ-4 — RESOLVED by Q-7:** Alerts retains view/organize/delete; acknowledge/resolve is out. Logs retains its existing view/filter/sort scope.
- **OQ-5 — RESOLVED before v3:** The env-seeded bootstrap operator remains the MVP auth mechanism; invite-only workspace membership remains FR-WS-002.
- **OQ-6 — RESOLVED by Q-8:** Missing-channel webhook posts return 4xx; AC-MSG-008 remains inactive and is not gated by an open question.
- **OQ-7 — RESOLVED by Q-9, PARTIALLY SUPERSEDED (2026-07-18):** legacy null-channel tokens remain workspace-wide and compatible; every newly created channel webhook is message-only and bound to one channel.
- **OQ-8 — OPEN, NON-GATING:** `docs/idea.md` requires a bookmark icon but does not decide reference value versus uploaded asset. v3 retains the stable reference-value behavior in FR-BM-002/AC-BM-011; uploaded assets require a future sourced requirement.
- **OQ-9 — RESOLVED by Q-10:** No automatic retention applies; R-5 is explicitly accepted.
- **Q-13 — RESOLVED, BINDING:** switching workspace changes every visible and operable content area, including Domains and Servers; deployment `.env` credentials are the only global provider state.

---

## Appendix B — AC-ID index and source traceability

All IDs are stable and must not be renumbered, reused, or transferred. v3 has exactly **144 unconditional active criteria + 16 conditionally applicable AC-REAL criteria + 1 inactive criterion = 161 unique criteria**:

- Shell: AC-SHELL-001..004
- Auth: AC-AUTH-001..005
- Bookmarks: AC-BM-001..034
- Domains: AC-DOM-001..009
- Servers: AC-SRV-001..008
- Mail: AC-MAIL-001..030, with AC-MAIL-007..030 added by Q-14 (accounts 007..011, sync 012..017, actions 018..021, send 022..025, attachments 026..028, folders/switching 029..030)
- Messages: AC-MSG-001..014, with AC-MSG-008 INACTIVE under Q-8; AC-MSG-009..014 added by Q-4
- Logs: AC-LOG-001..005
- Alerts: AC-ALR-001..008, with AC-ALR-008 added by Q-7
- Webhook: AC-WH-001..011
- Provider abstraction: AC-PROV-001..003
- Workspaces: AC-WS-001..011
- Real providers: AC-REAL-CF-001..004, AC-REAL-HC-001..004, AC-REAL-HD-001..004, AC-REAL-GD-001..004
- Demo data: AC-DEMO-001..003

### Requirements traceability matrix

| Requirement / AC family           | Normative source                                                     | v3 disposition                                                                                                                                                                                           |
| --------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-SHELL-001                      | `docs/idea.md`; `specs/ui.md` general shell                          | Active; seven-section navigation preserved                                                                                                                                                               |
| FR-AUTH-001                       | `docs/progress.md` Decisions log 2026-07-12; `specs/ui.md` login     | Active; bootstrap and invite-only behavior preserved                                                                                                                                                     |
| FR-BM-001..005                    | `docs/idea.md` Bookmarks; `specs/ui.md` Bookmarks                    | Active                                                                                                                                                                                                   |
| FR-DOM-001..002                   | `docs/idea.md` Domains; `specs/ui.md` Domains/DNS; Q-13              | Unconditional active; active-workspace bindings only; foreign bindings make zero provider calls                                                                                                          |
| FR-SRV-001..002                   | `docs/idea.md` Servers; `specs/ui.md` Servers; Q-6; Q-13             | Unconditional active; lifecycle excluded; active-workspace bindings only                                                                                                                                 |
| FR-MAIL-001..002                  | `docs/idea.md` Mail; `specs/ui.md` Mail; Q-5 (superseded); Q-14      | Active; list/detail/filter/sort/pagination now inside the three-pane client; webhook ingest contract unchanged (system mailbox)                                                                           |
| FR-MAIL-003..007 / AC-MAIL-007..030 | Q-14; `specs/ui.md` Mail (rewritten); `specs/prototype/` mail        | Active; multi-account IMAP/SMTP client — accounts, sync, actions, send, attachments, folders/switching                                                                                                   |
| FR-MSG-001..002                   | `docs/idea.md` Messages; `specs/ui.md` Messages; Q-8                 | Active; AC-MSG-008 inactive                                                                                                                                                                              |
| FR-MSG-003 / AC-MSG-009..014      | Q-4; Q-8                                                             | Active; supersedes only the read-only Messages statement in `specs/ui.md`                                                                                                                                |
| FR-LOG-001..002                   | `docs/idea.md` Logs; `specs/ui.md` Logs                              | Active                                                                                                                                                                                                   |
| FR-ALR-001..003 / AC-ALR-008      | `docs/idea.md` Alerts; `specs/ui.md` Alerts; Q-7                     | Active; acknowledge/resolve excluded                                                                                                                                                                     |
| FR-WH-001..002                    | `docs/idea.md` webhook requirements; `docs/plan.md` §6; Q-9; channel-webhook amendment (2026-07-18) | Active; legacy null-channel tokens remain workspace-wide, new channel webhooks are channel-scoped                                                                                                        |
| FR-PROV-001                       | `docs/progress.md` Decisions log; Q-11; Q-13                         | Unconditional active; independent modes, workspace-exclusive mock/binding state, no invalid-key mock fallback                                                                                            |
| FR-WS-001..003                    | `docs/idea.md` Workspaces; `specs/ui.md` workspace flows; Q-13       | Unconditional active; every visible/operable area follows active workspace; full 11/11 only after R2.8                                                                                                   |
| FR-REAL-001 / AC-REAL-CF-001..004 | `docs/idea.md` Domains; Q-11; `docs/remediation-plan.md` §5          | Conditionally applicable: PASS when Cloudflare is enabled; NOT_ENABLED/N/A when disabled                                                                                                                 |
| FR-REAL-001 / AC-REAL-HC-001..004 | `docs/idea.md` Servers; Q-11; `docs/remediation-plan.md` §5          | Conditionally applicable: PASS when Hetzner Cloud is enabled; NOT_ENABLED/N/A when disabled                                                                                                              |
| FR-REAL-001 / AC-REAL-HD-001..004 | `docs/idea.md` Domains; Q-11; `docs/remediation-plan.md` §5          | Conditionally applicable: PASS when Hetzner DNS is enabled; NOT_ENABLED/N/A when disabled                                                                                                                |
| FR-REAL-001 / AC-REAL-GD-001..004 | `docs/idea.md` Domains; Q-11; `docs/remediation-plan.md` §5 task 3.4 | Conditionally applicable; release gate requires PASS on an enabled eligible account or evidenced account/API ineligibility plus a dated explicit user exclusion; missing credentials alone never qualify |
| FR-DEMO-001 / AC-DEMO-001..003    | Q-12; `docs/remediation-plan.md` §6                                  | Active; optional and production-separated                                                                                                                                                                |
| NFR-DEPLOY-001                    | `docs/progress.md` self-hosted decision; `docs/plan.md` §10          | Active                                                                                                                                                                                                   |
| NFR-SEC-001                       | FR-AUTH-001; `docs/plan.md` §10.1                                    | Active                                                                                                                                                                                                   |
| NFR-SEC-002                       | FR-WH-002; Q-11; AC-REAL-*-004                                       | Active                                                                                                                                                                                                   |
| NFR-SEC-003                       | FR-WH-001; `docs/plan.md` §6                                         | Active                                                                                                                                                                                                   |
| NFR-SEC-004                       | Q-13; FR-WS-003                                                      | Active; expected-workspace stale-context precondition, never authority                                                                                                                                   |
| NFR-PERF-001..002                 | `docs/plan.md` §§6, 10.1; stable v2 decisions D-9/D-11               | Active                                                                                                                                                                                                   |
| NFR-A11Y-001                      | `specs/ui.md` common interaction rules; `docs/plan.md` §10.1         | Active                                                                                                                                                                                                   |
| NFR-I18N-001                      | Q-1; finite allowlist in NFR-I18N-001                                | Active; Russian-only visible UI with code/monospace technical exemptions; legacy English `specs/ui.md` copy is non-normative                                                                             |
| NFR-THEME-001                     | Q-2; `specs/inspot-design/`                                          | Active; dark theme deferred                                                                                                                                                                              |
| NFR-DESIGN-001                    | Q-3; `specs/prototype/`; `specs/inspot-design/`; `specs/ui.md`       | Active for layouts, flows, and design; English visible copy remains subject to NFR-I18N-001 translation                                                                                                  |
| NFR-BROWSER-001                   | `specs/ui.md` responsive/mobile rules                                | Active                                                                                                                                                                                                   |
| NFR-STACK-001                     | `package.json`; `docs/progress.md` stack decision                    | Active at Next.js 16.2.10                                                                                                                                                                                |

No active FR or NFR lacks a named source. The v2 English-only semantic of NFR-I18N-001 is explicitly retired by Q-1. AC-MSG-008 remains the sole inactive criterion under Q-8; no ID is deleted or reused.

---

## Appendix C — Changelog

### v3.8 — 2026-07-18 (channel-scoped incoming webhooks)

- Partially superseded Q-9 only for newly created channel webhooks; legacy null-channel tokens remain workspace-wide and compatible.
- Added channel management/public wire contracts, one-time token URL handling, exact payload/status/idempotency rules, Messages interaction behavior, v1 exclusions, and reverse-proxy full-path redaction as a deployment requirement. No runtime PASS is claimed.

### v3.7 — 2026-07-18 (Mail multi-account client amendment, Q-14)

- Recorded binding user decision **Q-14** (and decision **D-22**): the Q-5 "Mail is read-only" constraint is lifted. The Mail portions of D-4/D-5/HC-13/A-1 and OQ-1's disposition are marked superseded; their history is preserved, nothing is deleted.
- Rewrote §3.4: added **FR-MAIL-003** (IMAP/SMTP account management, owner-only, AES-256-GCM password encryption, MOCK/REAL driver modes), **FR-MAIL-004** (IMAP synchronization with scheduler, lease, UIDVALIDITY handling), **FR-MAIL-005** (read/trash-first delete/archive/move, server-first for IMAP), **FR-MAIL-006** (plain-text compose/reply/forward via SMTP with Sent append and per-workspace rate limit), **FR-MAIL-007** (attachments with lazy IMAP fetch and database cache) with **AC-MAIL-007..030** (accounts 007..011, sync 012..017, actions 018..021, send 022..025, attachments 026..028, folders/account switching 029..030). AC-MAIL-001..006 keep their IDs and semantics.
- Added a §3.4 **Known Limitations** subsection documenting seven accepted trade-offs (local-only `isAnswered` on reply, possible transient duplicate after move/trash, in-memory send rate limit, plain-text-only compose without attachment forwarding, no OAuth, deliberately allowed private-range IMAP hosts, webhook-mailbox compose fallback to the first IMAP account).
- Out of Scope updated: removed the superseded "no compose/send" and "no IMAP polling" bullets; added rich-text composition, attachment forwarding, OAuth, and POP3 as the remaining exclusions. Added US-16. Accounting updated to 144 unconditional active + 16 conditional AC-REAL + 1 inactive = 161 unique criteria (§11 M-10, §12, Appendix B).
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.6 — 2026-07-15 (Bookmarks nested category groups amendment, Phase 4)

- Added FR-BM-007 and AC-BM-029..034 for one level of nested category grouping (group → subcategory → bookmarks), backed by an additive self-relation migration on `Category` (`parentCategoryId`/`parentCategoryWorkspaceId`, first self-referential relation in the schema), server-side depth-cap/self-reference/existing-children validation, and client-side mirroring of the same rules in the category form. Accounting updated to 120 unconditional active + 16 conditional AC-REAL + 1 inactive = 137 unique criteria.
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.5 — 2026-07-15 (Bookmarks favicon-suggest amendment, Phase 3)

- Added FR-BM-006 and AC-BM-026..028 for an opt-in favicon suggestion sourced from a fixed third-party service, plus a broken-icon-URL fallback fix. Accounting updated to 114 unconditional active + 16 conditional AC-REAL + 1 inactive = 131 unique criteria.
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.4 — 2026-07-15 (Bookmarks drag-and-drop reordering amendment, Phase 2)

- Added FR-BM-005 and AC-BM-022..025 for drag-and-drop reordering of categories and of bookmarks within/across categories, backed by two new API routes (`PATCH /api/categories/reorder`, `PATCH /api/bookmarks/reorder`) and two new workspace-scoped service functions; no schema change (position fields already existed). Accounting updated to 111 unconditional active + 16 conditional AC-REAL + 1 inactive = 128 unique criteria.
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.3 — 2026-07-15 (Bookmarks search/filter amendment, Phase 1)

- Added FR-BM-004 and AC-BM-019..021 for a client-only, case-insensitive bookmark search over name/description/URL, its distinct no-results state with a clear-search action, and the no-search-input-when-empty rule. No API route, service function, or schema change was introduced. Accounting updated to 107 unconditional active + 16 conditional AC-REAL + 1 inactive = 124 unique criteria.
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.2 — 2026-07-15 (Bookmarks accent-color amendment, Phase 0)

- Added AC-BM-015..018 under FR-BM-002 for an optional per-bookmark accent color (one of three brand tone tokens) applied to the icon tile, an accessible clear-to-fallback control, and non-color-only swatch names. Accounting updated to 104 unconditional active + 16 conditional AC-REAL + 1 inactive = 121 unique criteria.
- No existing FR or AC ID was renumbered, reused, or retired.

### v3.1 — 2026-07-14 (Q-13 all-content workspace amendment)

- Q-13 supersedes D-20: every user-visible and operable area, including Domains and Servers, now follows the active workspace; only provider credentials remain deployment-scoped.
- FR-DOM, FR-SRV, FR-PROV, FR-REAL, and FR-WS now require active-workspace local bindings, workspace-isolated mocks, non-disclosing foreign-id handling, and zero provider calls for foreign bindings.
- NFR-SEC-004 records the expected-workspace browser precondition and stale-tab response. Owner/member boundaries and last-owner/session fallback behavior are explicit without adding granular RBAC.
- AC-WS-008/010/011 remain stable and close by facet. R2.8 alone may record them and the Workspaces family as PASS/11-of-11.
- No FR or AC ID was renumbered, reused, added, or retired. The approved target remains unimplemented until the remediation slices and runtime gates pass.

### v3.0 — 2026-07-14 (remediation Phase 1 requirements synchronization)

- Applied confirmed decisions Q-1…Q-12 and removed every provisional/gated OQ dependency from active v3 scope.
- Replaced NFR-I18N-001's retired English-only semantic with executable Russian-only visible UI and a finite allowlist; added NFR-THEME-001 and NFR-DESIGN-001; updated NFR-STACK-001 to evidence-backed Next.js 16.2.10.
- Added FR-MSG-003 and AC-MSG-009..014 for authenticated operator posting, persisted/visible origin attribution, rejection cases, and confirmed failure state. AC-MSG-008 remains inactive under Q-8.
- Added AC-ALR-008 to preserve delete while excluding acknowledge/resolve under Q-7.
- Added §3.11 FR-REAL-001 with AC-REAL-CF-001..004, AC-REAL-HC-001..004, AC-REAL-HD-001..004, and AC-REAL-GD-001..004. Provider modes are independent and environment-only; enablement follows Q-11 priority.
- Added FR-DEMO-001 and AC-DEMO-001..003 for the optional, idempotent, production-separated `db:seed:demo` outcome covering all seven sections.
- Confirmed D-4/D-5 and A-1/A-4/A-5/A-7; resolved OQ-1..4/OQ-6/OQ-7/OQ-9 by Q-ID; preserved OQ-8 only as a non-gating material uncertainty.
- Debate cycle 1 — **CH-PRD-001: accepted_and_fixed**. Each DNS provider's `-002` criterion now requires create, update, and delete operations to reach the provider, with a reread confirming state after every operation.
- Debate cycle 1 — **CH-PRD-002: accepted_and_fixed**. The product-ready GoDaddy gate now requires AC-REAL-GD-001..004 PASS or account/API ineligibility evidence plus a dated, explicit user exclusion in `docs/progress.md`; missing credentials alone are insufficient.
- Added complete source traceability, negative cases, refreshed risks, and product-ready DoD requiring 100 unconditional active criteria to PASS, conditional AC-REAL dispositions per provider, a signed operator checklist, and explicit user demo acceptance.
- **Ordinary review rework (not a debate cycle):**
  - **DOC-PRD-001 — historical v3.0 fix, superseded by Q-13:** workspace scope was limited to database content and Domains/Servers were excluded. Only the separate upstream non-deletion safety rule remains normative in v3.1.
  - **DOC-PRD-002 — fixed:** accounting and gates now use 100 unconditional active + 16 conditional AC-REAL + 1 inactive = 117 unique criteria, while preserving the GoDaddy release rule.
  - **DOC-PRD-003 — fixed:** AC-PROV-001..003 now express independent provider modes, zero-call mock behavior, and no mock fallback for configured invalid/revoked credentials.
  - **DOC-PRD-004 — fixed:** NFR-I18N-001 defines a finite allowlist and makes legacy English `specs/ui.md` copy non-normative and translatable.
  - **DOC-PRD-005 — fixed:** the header status reflects adversarial CONSENSUS and ordinary doc-review PASS.
  - **DOC-PRD-006 — historical v3.0 fix, superseded by Q-13:** the former Domains/Servers exception is retained only as review history; the switcher layout and no-full-page-reload flow remain normative.

No stable FR/AC ID was renumbered, reused, or transferred. The English-only semantic was retired only because Q-1 explicitly replaced it; AC-MSG-008 remains present and inactive.

### v2.2 — 2026-07-13 (workspaces added post-Slice-1)

Documents the implemented workspaces feature (multi-user small-team collaboration on a single self-hosted deployment):

- **New §3.10 Workspaces:** Added **FR-WS-001** (workspace CRUD, default workspace on first registration), **FR-WS-002** (invite-only membership — add existing operator or create a new one), and **FR-WS-003** (workspace switching via session `activeWorkspaceId`). Added **AC-WS-001..011**.
- **§1 Product Overview:** "What we are building" now mentions workspace support; "Delivery approach" notes workspaces were added after Slice 1.
- **§2 Target Audience:** Persona updated from "single-user" to "single-user or small-team" with workspace collaboration; deployment model clarified as not a general-purpose multi-tenant SaaS.
- **FR-AUTH-001 (§3.0):** Reworded to state that, beyond the first env-seeded operator, additional operators are invite-only via a workspace owner (FR-WS-002); no self-service registration. AC-AUTH-001..005 unchanged — they still describe the bootstrap operator's auth behavior.
- **User Stories:** Added **US-11, US-12, US-13** for workspace creation, invite, and switching.
- **HC-9 (§6.1):** Reworded — Slice 1 bootstrap is still single-operator/env-seeded, but post-Slice-1 invite-only multi-user access is now in scope; RBAC beyond the workspace `role` field remains out of scope.
- **Decisions (§9):** Added **D-13** (invite-only workspace membership model).
- **Out of Scope (§10):** Removed "Multi-tenancy" (workspaces now provide it) and "User management / RBAC / multiple accounts" (invite is implemented); replaced with "RBAC beyond the workspace `role` field" and "Self-service registration" to precisely scope what remains excluded.
- **Appendix B:** Added Workspaces AC-WS-001..011 to the AC-ID index.

No AC-IDs renumbered, reused, or retired.

### v2.1 — 2026-07-12 (ordinary doc-review wording fixes; not a debate cycle)

Dispositions for doc-review findings F-1..F-4 (wording only; no AC-ID renumbered):

- **F-1 — fixed:** FR-MAIL-002, FR-LOG-002, FR-ALR-003 no longer call the sections a "channel type" (which collided with Messages channels). Now: Mail/Logs/Alerts each "uses the `mail`/`log`/`alert` webhook ingest `type`", matching AC-WH-003's supported-type wording.
- **F-2 — fixed:** AC-MSG-003 and AC-ALR-002 now state explicitly: "implementation may choose either strategy; the executable assertion is the no-orphan invariant only." Recorded as D-12.
- **F-3 — fixed:** AC-WH-004 now specifies idempotency-key scoping: "Idempotency keys are scoped per token: the same key presented under a different token creates a separate entry." D-8 updated accordingly.
- **F-4 — fixed:** Added the note "AC-IDs appear in logical, not numeric, order" beside the ID-stability rule in §3 and Appendix B. No AC-IDs renumbered.

### v2 — 2026-07-12 (adversarial debate cycle 1 resolutions)

Dispositions for challenge ledger CH-PRD-001..010:

- **CH-PRD-001 — accepted_and_fixed:** Added **AC-MSG-007** (server-side pagination of channel messages) under FR-MSG-001; NFR-PERF-001 verification list now cites AC-MSG-007; N-12 and M-6 updated.
- **CH-PRD-002 — accepted_and_fixed:** Idempotency key defined as **optional**. Added **AC-WH-010** (no-key = at-least-once, duplicates possible; dedup only with key). Reworded AC-WH-004 to require the key; clarified US-10; added N-5b; recorded D-8.
- **CH-PRD-003 — accepted_and_fixed:** Reworded **AC-SRV-004/005/006** to a single deterministic standard (provider 2xx AND polled status equals target within 30/30/60s); added mock-determinism note; recorded D-9.
- **CH-PRD-004 — accepted_and_fixed:** Added **AC-AUTH-005** (env-seeded first-credential provisioning + fail-fast when env absent); added N-8b; M-3 updated.
- **CH-PRD-005 — accepted_and_fixed:** Slice 1 redefined as "shell + minimal single-operator env-seeded auth + Bookmarks" in §1, §3 priorities, HC-4, HC-9, D-1/D-7, per coordinator decision.
- **CH-PRD-006 — accepted_and_fixed:** **AC-MSG-006** de-branched to a firm 4xx reject (no auto-create); auto-create moved to new inactive **AC-MSG-008** gated on OQ-6; recorded D-10.
- **CH-PRD-007 — accepted_and_fixed:** **AC-WH-003** fixed to synchronous create returning **HTTP 201** with identifier, consistent with AC-WH-004/007; recorded D-8.
- **CH-PRD-008 — accepted_and_fixed:** Added **AC-WH-011** (HTTP 413 oversized / 400 unparseable, nothing created); added N-14; NFR-SEC-003 and M-4 updated.
- **CH-PRD-009 — accepted_and_fixed:** **D-4** and **D-5** relabeled "provisional — pending OQ-1..OQ-4 / OQ-1" with unconfirmed-confidence notes; cross-referenced from the §3 cross-cutting note and R-2.
- **CH-PRD-010 — accepted_and_fixed:** **NFR-PERF-002** scoped: 500ms target applies to equality/range/sorted reads; substring/text filters excluded unless a trigram/full-text index is adopted, else pagination-only fallback; recorded D-11 and R-6.

No new challenge IDs created. No existing AC-IDs renumbered, reused, or retired.
