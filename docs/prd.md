# Product Requirements Document — inspoter

**Version:** v2.1 (doc-review wording fixes on v2)
**Status:** Draft for review
**Owner:** Product Analyst
**Date:** 2026-07-12
**Source of truth for:** architect, ui-ux-designer, planner, tester
**Traces to:** `specs/idea.md` (verbatim request), `docs/progress.md` (Decisions log 2026-07-12 + debate cycle 1 decision)

---

## 1. Product Overview

### What we are building

`inspoter` is a specialized, self-hosted **personal operations dashboard** — comparable to Dashy/Homarr for the bookmarking part, but extended with operational sections for managing domains, VPS servers, mail, messages, logs, and alerts. It is a single deployable Next.js application backed by PostgreSQL.

### What problem it solves

A self-hosted operator (homelab / small-team / indie infrastructure owner) currently spreads day-to-day operations across many disconnected tools: bookmark managers, registrar/DNS control panels (Cloudflare, Hetzner, GoDaddy), a VPS provider console (Hetzner), mailboxes, chat systems, and log/alert viewers. There is no single pane of glass. inspoter consolidates these into one self-hosted control panel, and adds a **unified webhook ingest API** so third-party systems can push mail, messages, logs, and alerts into the dashboard.

### Expected outcome

A working self-hosted dashboard where the operator can:

1. Organize and open resource bookmarks (categorized, with icon/name/description).
2. Monitor and manage domains and DNS records through provider integrations.
3. Monitor and manage Hetzner VPS servers (status + start/stop/restart).
4. View, filter, and sort mail, logs, and alerts.
5. Organize messages in a Discord-style category/channel structure.
6. Receive mail, messages, logs, and alerts from external systems via authenticated webhooks.

### Delivery approach (from Decisions log)

Vertical slices. **Slice 1 (tracer bullet) = dashboard shell + minimal single-operator auth + Bookmarks.** Auth is included in Slice 1 in a minimal, env-seeded single-operator form per the coordinator decision (progress.md Decisions log, debate cycle 1); full user management/RBAC remain out of scope. All other sections are later slices. External-provider integrations (Cloudflare, Hetzner, GoDaddy, mailboxes) sit behind a **provider abstraction with a mock mode**; real API keys are supplied later via environment variables.

---

## 2. Target Audience

### Primary persona — "The Self-Hosted Operator" (Admin)

- **Who:** A technically proficient individual (or a member of a small team) who self-hosts their own infrastructure.
- **Context:** Runs the dashboard on their own server/homelab via Docker. Owns domains at Cloudflare/Hetzner/GoDaddy and VPS instances at Hetzner. Wants a consolidated operational view.
- **Skill level:** High. Comfortable with environment variables, Docker, API tokens, and reading logs. Does **not** need hand-holding onboarding flows.
- **Deployment model:** Single-user or small-team, self-hosted. Not a multi-tenant SaaS.

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

> **Cross-cutting note on "manage" vs "view" (see Open Questions OQ-1..OQ-4):** For sections where the request says "manage" but only describes viewing (Mail, Logs, Alerts), the **minimal MVP interpretation is read + organize + delete**, not compose/send. Mail sending, log-source configuration, and alert routing are explicitly deferred (see Out of Scope). This interpretation is provisional pending OQ-1..OQ-4 (see D-4/D-5).

---

### 3.0 Dashboard Shell & Authentication (Slice 1)

**FR-SHELL-001: Application shell and navigation**

- Description: A persistent shell that hosts all seven sections with a navigation menu.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-SHELL-001** (Slice 1): Given an authenticated user, When they load the dashboard, Then a persistent navigation menu lists all seven sections (Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts).
  - **AC-SHELL-002** (Slice 1): Given the navigation menu, When the user clicks a section link, Then the application routes to that section without a full page reload (client-side navigation).
  - **AC-SHELL-003** (Slice 1): Given a not-yet-implemented section (any section other than Bookmarks in Slice 1), When the user opens it, Then a clearly labeled "Coming soon / not yet available" placeholder is shown (no error, no blank screen).
  - **AC-SHELL-004** (Slice 1): Given a viewport width of 375px and of 1440px, When the shell renders, Then the navigation and content remain usable with no horizontal overflow of the page body.

**FR-AUTH-001: Panel authentication (minimal single-operator, env-seeded)**

- Description: The dashboard requires authentication before any section is accessible. For Slice 1 and MVP this is a **single operator** whose credentials are **seeded from environment variables** at startup (coordinator decision, debate cycle 1). Multi-account management and RBAC are out of scope.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-AUTH-001** (Slice 1): Given an unauthenticated visitor, When they request any dashboard route (except the login route and webhook API), Then they are redirected to a login screen and no dashboard data is returned.
  - **AC-AUTH-002** (Slice 1): Given the operator credentials seeded from environment variables, When the user submits them, Then a session is established and the user reaches the dashboard.
  - **AC-AUTH-003** (Slice 1): Given invalid credentials, When the user submits them, Then authentication is rejected with an error and no session is created.
  - **AC-AUTH-004** (Slice 1): Given an authenticated session, When the user logs out, Then the session is invalidated and subsequent dashboard requests redirect to login.
  - **AC-AUTH-005** (Slice 1, bootstrap): Given operator credentials supplied via environment variables at startup, When the application boots with no operator yet present, Then exactly one operator account is provisioned from those env values and can authenticate per AC-AUTH-002; Given the required auth environment variables are absent, When the application boots, Then it fails fast (refuses to start or blocks all login) with a clear message and never exposes an unauthenticated dashboard.
  - _Note: Auth mechanism for Slice 1/MVP is fixed by coordinator decision — a single operator whose credentials are seeded from environment variables (progress.md Decisions log, debate cycle 1). The concrete session/hashing implementation is an architecture decision; the PRD mandates only the outcomes above. Multi-account/external-provider auth is retained only as a post-MVP question (OQ-5)._

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

- Description: Each bookmark is a link to a resource with an icon, name, description, and URL, belonging to a category.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-006** (Slice 1): Given an existing category, When the user creates a bookmark with a name, URL, optional icon, and optional description, Then the bookmark appears in that category's list without a full page reload.
  - **AC-BM-007** (Slice 1): Given a bookmark-create form, When the user submits without a name or without a URL, Then a validation error is shown and no bookmark is created.
  - **AC-BM-008** (Slice 1): Given a bookmark-create form, When the user submits a URL that is not a valid `http(s)` URL, Then a validation error is shown and no bookmark is created.
  - **AC-BM-009** (Slice 1): Given an existing bookmark, When the user edits its name, URL, icon, description, or category, Then the changes are persisted and reflected in the list.
  - **AC-BM-010** (Slice 1): Given an existing bookmark, When the user deletes it, Then it is removed from the category list without a full page reload.
  - **AC-BM-011** (Slice 1): Given a bookmark with an icon value, When the bookmark is rendered, Then the specified icon is displayed; When no icon is set, Then a deterministic fallback (e.g., derived from the name/URL) is displayed instead of a broken image.

**FR-BM-003: Bookmark display and navigation**

- Description: Bookmarks are presented grouped by category and are openable.
- Priority: Must Have (Slice 1)
- Acceptance Criteria:
  - **AC-BM-012** (Slice 1): Given bookmarks exist across multiple categories, When the user views the Bookmarks section, Then bookmarks are displayed grouped under their category with name, icon, and description visible.
  - **AC-BM-013** (Slice 1): Given a displayed bookmark, When the user activates it, Then its URL opens in a new browser tab.
  - **AC-BM-014** (Slice 1): Given no categories and no bookmarks exist, When the user views the Bookmarks section, Then an empty-state prompt to create the first category/bookmark is shown (no error).

---

### 3.2 Domains

**FR-DOM-001: Domain inventory (list & manage)**

- Description: List and manage domain names monitored across providers (Cloudflare, Hetzner, GoDaddy).
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-DOM-001**: Given at least one configured provider (real or mock), When the user opens the Domains section, Then a list of domains is displayed with, per domain, its name and its associated provider.
  - **AC-DOM-002**: Given the provider abstraction is in mock mode, When the user opens the Domains section, Then representative mock domains are returned so the UI is fully exercisable without real credentials.
  - **AC-DOM-003**: Given a provider that returns an error or is unreachable, When the user opens the Domains section, Then the section renders with a per-provider error indicator and the domains from healthy providers are still shown.

**FR-DOM-002: DNS record management**

- Description: View and manage DNS records for a selected domain through its provider.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-DOM-004**: Given a selected domain, When the user opens its DNS view, Then its DNS records are listed with type, name, value, and TTL.
  - **AC-DOM-005**: Given a domain's DNS view, When the user creates a DNS record with a valid type, name, and value, Then the record is submitted to the provider and, on success, appears in the record list.
  - **AC-DOM-006**: Given an existing DNS record, When the user edits its value/TTL, Then the change is submitted to the provider and, on success, the updated record is displayed.
  - **AC-DOM-007**: Given an existing DNS record, When the user deletes it and confirms, Then the record is removed via the provider and disappears from the list.
  - **AC-DOM-008**: Given a DNS record form, When the user submits an invalid record type or malformed value for the selected type, Then a validation error is shown and nothing is submitted to the provider.
  - **AC-DOM-009**: Given a provider that rejects a create/update/delete, When the operation fails, Then an error message is surfaced to the user and the record list reflects the unchanged provider state.

---

### 3.3 Servers

**FR-SRV-001: Server inventory & status (Hetzner)**

- Description: List Hetzner VPS servers with their configuration summary and current state.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-SRV-001**: Given the Hetzner provider (real or mock), When the user opens the Servers section, Then a list of servers is displayed with, per server, its name, type/configuration summary, and current power status (e.g., running/stopped).
  - **AC-SRV-002**: Given the provider is in mock mode, When the user opens the Servers section, Then representative mock servers with statuses are returned so the UI is exercisable without real credentials.
  - **AC-SRV-003**: Given the Hetzner provider is unreachable or returns an error, When the user opens the Servers section, Then an error state is shown rather than a crash or blank screen.

**FR-SRV-002: Server power actions**

- Description: Start, stop, and restart Hetzner servers.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-SRV-004**: Given a stopped server, When the user triggers "start", Then the provider call returns a 2xx AND a status poll within 30 seconds reports the server status equal to `running`.
  - **AC-SRV-005**: Given a running server, When the user triggers "stop", Then the provider call returns a 2xx AND a status poll within 30 seconds reports the server status equal to `stopped`.
  - **AC-SRV-006**: Given a running server, When the user triggers "restart", Then the provider call returns a 2xx AND a status poll within 60 seconds reports the server status equal to `running`.
  - **AC-SRV-007**: Given a destructive/state-changing action (start/stop/restart), When the user triggers it, Then a confirmation step is required before the action is sent.
  - **AC-SRV-008**: Given the provider rejects or errors on a power action, When the action fails, Then an error is surfaced and the displayed status reflects the provider's actual (unchanged) state.
  - _Note: In mock mode the polled status transition is deterministic so AC-SRV-004..006 are testable without real Hetzner credentials._

---

### 3.4 Mail

**FR-MAIL-001: Mail viewing, filtering, sorting**

- Description: View mail entries and filter/sort them by various criteria. (MVP interpretation: read-only; see OQ-1.)
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MAIL-001**: Given mail entries exist, When the user opens the Mail section, Then a paginated list of mail entries is displayed with sender, subject, and received timestamp.
  - **AC-MAIL-002**: Given a selected mail entry, When the user opens it, Then its full content (sender, subject, body, timestamp) is displayed.
  - **AC-MAIL-003**: Given the mail list, When the user applies a filter (e.g., by sender or by a text query on subject), Then only matching entries are shown.
  - **AC-MAIL-004**: Given the mail list, When the user sorts by a supported criterion (e.g., received date ascending/descending or sender), Then the list order updates accordingly.
  - **AC-MAIL-005**: Given more mail entries than one page, When the user views the list, Then pagination controls limit the page size and allow navigation across pages (see NFR-PERF-001).

**FR-MAIL-002: Mail ingest via webhook**

- Description: External systems can create mail entries via the unified webhook ingest API (see FR-WH-001). Mail uses the `mail` webhook ingest `type`.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MAIL-006**: Given a valid webhook request targeting the mail intake with a payload containing sender, subject, and body, When it is accepted, Then a new mail entry is created and becomes visible in the Mail section.

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

- Description: External systems post messages to a specific channel via the unified webhook ingest API. (MVP interpretation: intake + view; human composing is deferred — see OQ-2.)
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-MSG-005**: Given a valid webhook request targeting an existing channel with a message payload, When it is accepted, Then a new message is created in that channel and becomes visible when the channel is viewed.
  - **AC-MSG-006**: Given a webhook request targeting a channel that does not exist, When it is processed, Then it is rejected with a client error (4xx) and no message is created. (MVP behavior — no auto-create.)
  - **AC-MSG-008** (Later, inactive — gated on OQ-6): Given channel auto-create is enabled (a future, non-MVP option), When a webhook targets a non-existent channel, Then the channel is auto-created and the message is posted to it. This AC remains inactive and un-tested until OQ-6 is resolved in favor of auto-create; it does not override AC-MSG-006 for MVP.

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

- Description: View alerts and filter/sort by various criteria including category.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-ALR-003**: Given alerts exist, When the user opens the Alerts section, Then a paginated list is displayed with, per alert, category, severity, source, message, and timestamp.
  - **AC-ALR-004**: Given the alert list, When the user filters by category, severity, or a text query, Then only matching alerts are shown.
  - **AC-ALR-005**: Given the alert list, When the user sorts by a supported criterion (e.g., timestamp or severity), Then the order updates accordingly.
  - **AC-ALR-006**: Given more alerts than one page, When the user views the list, Then pagination limits page size and allows navigation (see NFR-PERF-001).

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

- Description: The operator can provision the token(s) that authenticate webhook senders.
- Priority: Must Have (Later)
- Acceptance Criteria:
  - **AC-WH-008**: Given an authenticated operator, When they create a webhook token, Then a secret token value is generated and shown once, and subsequent webhook requests presenting it authenticate successfully (satisfies AC-WH-003).
  - **AC-WH-009**: Given an existing webhook token, When the operator revokes it, Then subsequent webhook requests presenting that token are rejected with HTTP 401 (satisfies AC-WH-001).

---

### 3.9 Provider Abstraction (cross-cutting)

**FR-PROV-001: Provider abstraction with mock mode**

- Description: External integrations (Cloudflare, Hetzner, GoDaddy DNS; Hetzner servers; mail sources) are accessed through a provider abstraction. When real credentials are absent, a mock mode returns representative data so all UI/flows are exercisable. (From Decisions log 2026-07-12.)
- Priority: Must Have (Later) — foundational for Domains/Servers/Mail slices.
- Acceptance Criteria:
  - **AC-PROV-001**: Given no real provider credentials are configured, When a provider-backed section (Domains, Servers) is used, Then the abstraction operates in mock mode and returns deterministic representative data without external network calls.
  - **AC-PROV-002**: Given real provider credentials are supplied via environment variables, When the provider-backed section is used, Then the abstraction routes to the real provider (no code change required to switch modes).
  - **AC-PROV-003**: Given a provider operation is not supported by a given provider, When it is invoked, Then the abstraction returns a well-formed "unsupported operation" result rather than throwing an unhandled error.

---

## 4. Non-Functional Requirements

**NFR-DEPLOY-001 (Self-hosted / Docker):** The application must be deployable as a self-hosted service via Docker on a single host, backed by PostgreSQL. _Verification:_ a documented `docker`-based startup brings up the app + database and serves the login screen. (Traces to Decisions log: self-hosted, single deploy, PostgreSQL + Prisma.)

**NFR-SEC-001 (Panel authentication):** All dashboard routes and data APIs require an authenticated session; only the login route and the webhook ingest API (token-authenticated) are reachable unauthenticated. _Verification:_ AC-AUTH-001, AC-WH-001.

**NFR-SEC-002 (Provider/webhook secret handling):** Provider API keys and webhook token secrets must be sourced from environment variables or stored such that secret values are never returned in list/detail API responses or rendered in the UI after creation. _Verification:_ inspect API responses for the presence of raw secret values (must be absent/redacted); AC-WH-008 shows the secret once only.

**NFR-SEC-003 (Webhook abuse resistance):** The webhook ingest API must enforce token auth (AC-WH-001), payload validation (AC-WH-002), body-size/parse limits (AC-WH-011), and rate limiting (AC-WH-005) to resist unauthorized or abusive ingestion. Aligns with OWASP API Top 10 (broken auth, unrestricted resource consumption).

**NFR-PERF-001 (List pagination):** All potentially unbounded lists (Mail, Logs, Alerts, and Messages within a channel) must be paginated (server-side), returning a bounded page size (default target: 50 items/page, configurable) so a single request never loads the entire table. _Verification:_ AC-MAIL-005, AC-LOG-004, AC-ALR-006, AC-MSG-007; response payload item count ≤ configured page size.

**NFR-PERF-002 (Interactive responsiveness):** Under nominal single-user self-hosted load with a warm database, list section reads (a single page) using **equality/range filters and sorted reads** should return in under 500ms server processing time for datasets up to 100k rows in the queried table, assuming appropriate B-tree indexing. **Substring/text-search filters (AC-MAIL-003, AC-LOG-002, and the text-query paths of AC-ALR-004) are excluded from the 500ms target unless** a trigram (`pg_trgm` GIN) or full-text index strategy is adopted; if such an index is not present, substring filters carry no numeric latency guarantee and MUST remain paginated (NFR-PERF-001) to bound work. _Verification:_ measured server timing on a seeded dataset for non-text filters; for text filters, verify either that the trigram/full-text index strategy exists OR that the pagination-only fallback is in place. _(Assumption on dataset scale — see A-3; index-strategy choice is an architecture decision.)_

**NFR-A11Y-001 (Accessibility baseline):** Interactive controls (navigation, forms, list actions) must be keyboard operable and have accessible names; the UI should meet WCAG 2.1 AA for color contrast and focus visibility on the shell and Bookmarks section at minimum. _Verification:_ automated accessibility check (e.g., axe) passes with no critical violations on Slice 1 screens.

**NFR-I18N-001 (English-only UI):** The UI is English-only; internationalization/localization is explicitly not required. _Verification:_ no i18n framework or translation layer is expected; strings may be inline. (From brief.)

**NFR-BROWSER-001 (Browser support):** The dashboard must function on current evergreen desktop browsers (latest Chrome, Firefox, Edge). Mobile browsers should render the shell without horizontal overflow (AC-SHELL-004) but full mobile optimization is not a goal.

**NFR-STACK-001 (Fixed technology stack):** The stack is fixed by the user: Next.js 15 (App Router) + TypeScript + Tailwind CSS + shadcn/ui; Next.js Route Handlers for API and webhook API; Prisma ORM + PostgreSQL. This is a hard constraint, not an architecture choice for downstream agents to revisit. (Decisions log 2026-07-12.)

---

## 5. User Stories

- **US-1 (Bookmarks, Slice 1):** As a self-hosted operator, I want to organize my resource links into named categories with icons and descriptions, so that I have a single launchpad for the tools and services I use. → FR-BM-001..003
- **US-2 (Shell, Slice 1):** As an operator, I want one dashboard with a nav for all my ops sections, so that I stop switching between many tools. → FR-SHELL-001
- **US-3 (Auth, Slice 1):** As an operator, I want the dashboard to require login (a single operator seeded from env), so that my consolidated infrastructure view is not exposed publicly. → FR-AUTH-001
- **US-4 (Domains):** As an operator, I want to view my domains and edit their DNS records across Cloudflare/Hetzner/GoDaddy from one place, so that I don't log into three registrar consoles. → FR-DOM-001..002
- **US-5 (Servers):** As an operator, I want to see my Hetzner VPS statuses and start/stop/restart them, so that I can manage compute without the Hetzner console. → FR-SRV-001..002
- **US-6 (Mail):** As an operator, I want to view, filter, and sort incoming mail, so that I can triage messages pushed from my systems. → FR-MAIL-001
- **US-7 (Messages):** As an operator, I want Discord-style categories and channels that external systems can post into, so that machine-generated notifications are organized by topic. → FR-MSG-001..002
- **US-8 (Logs):** As an operator, I want to browse, filter, and sort logs pushed from my systems, so that I can investigate incidents in one place. → FR-LOG-001..002
- **US-9 (Alerts):** As an operator, I want categorized alerts that I can filter and sort, fed by my monitoring systems, so that I can respond to problems quickly. → FR-ALR-001..003
- **US-10 (Webhook, external system):** As an external system, I want to POST mail/messages/logs/alerts to the dashboard with a token, so that my events show up in the operator's dashboard reliably — and **without duplicates when I supply an idempotency key** (delivery without a key is at-least-once and may duplicate, per AC-WH-010). → FR-WH-001..002

---

## 6. Constraints, Assumptions & Uncertainties

### 6.1 Hard constraints (user-specified)

| ID   | Constraint                                                                                                                | Establishing source                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| HC-1 | Stack: Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui; Route Handlers for API/webhooks; Prisma + PostgreSQL. | Brief "Стек утверждён"; progress.md line 7                         |
| HC-2 | Self-hosted, single-user or small-team deployment.                                                                        | Brief Context                                                      |
| HC-3 | External integrations behind a provider abstraction with mock mode; real keys via env later.                              | progress.md Decisions log line 38                                  |
| HC-4 | Delivery in vertical slices; Slice 1 = shell + minimal auth + Bookmarks.                                                  | Brief Context / plan; progress.md line 3 + debate-cycle-1 decision |
| HC-5 | UI English-only; i18n not required.                                                                                       | Brief Constraints                                                  |
| HC-6 | Seven sections exactly as named: Bookmarks, Domains, Servers, Mail, Messages, Logs, Alerts.                               | specs/idea.md lines 2-9                                            |
| HC-7 | DNS providers to support: Cloudflare, Hetzner, GoDaddy. Server provider: Hetzner.                                         | specs/idea.md lines 4-5                                            |
| HC-8 | Mail, Messages, Logs, Alerts must each support webhook ingest from external systems.                                      | specs/idea.md lines 6-9                                            |
| HC-9 | Slice 1 auth = single operator, env-seeded credentials; no RBAC/user-mgmt.                                                | Coordinator decision, debate cycle 1 (progress.md Decisions log)   |

### 6.2 Assumptions & Uncertainties register

Confidence is categorical: `low` / `medium` / `high` / `unknown`.

| ID  | Assumption / Uncertainty                                                                                                                    | Source / Evidence                                                     | Impact                    | Confidence | Owner     | Validation method                          |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------- | ---------- | --------- | ------------------------------------------ |
| A-1 | "Manage mail/logs/alerts" means view + organize + delete for MVP, not compose/send/route.                                                   | Brief only describes view/filter/sort for these; "manage" is generic. | Scope of Mail/Logs/Alerts | medium     | User      | Confirm via OQ-1..OQ-4 before those slices |
| A-2 | Bookmark "icon" is a reference (icon name/URL/emoji), not an uploaded image asset.                                                          | Dashy/Homarr parallel; simplest interpretation.                       | Bookmarks data model      | medium     | Architect | Confirm at Slice 1 design                  |
| A-3 | Data volumes are modest (self-hosted personal ops); tables in the low-100k-row range at most.                                               | Persona is single-user/small-team.                                    | NFR-PERF-002 targets      | medium     | User      | Confirm expected retention/volume          |
| A-4 | A single shared webhook token (or a small set) is sufficient; per-source granular scoping is not required for MVP.                          | Small-team self-hosted scale.                                         | FR-WH-002 scope           | low        | User      | Confirm via OQ-7                           |
| A-5 | Messages/Logs/Alerts/Mail entries are retained indefinitely unless the operator deletes them; no automatic retention/expiry policy for MVP. | Not mentioned in brief.                                               | Storage growth            | medium     | User      | Confirm retention needs                    |
| A-6 | Icons/data for Bookmarks are entered by the operator; no automatic favicon fetching is required for MVP (fallback per AC-BM-011 suffices).  | Simplicity; not requested.                                            | Bookmarks FR              | medium     | User      | Confirm at Slice 1                         |
| A-7 | Server "configuration" management (FR-SRV-001) means viewing configuration + power actions, not resizing/reprovisioning/rebuilding VPS.     | Brief lists "start/stop/restart"; reprovision not mentioned.          | Servers scope             | medium     | User      | Confirm via OQ-3                           |

### 6.3 Third-party & stakeholder dependencies

- **Cloudflare API, Hetzner API (DNS + Cloud/servers), GoDaddy API** — external, credential-gated; abstracted with mock mode (availability not guaranteed). Dependency-failure behavior specified in Negative Scenarios.
- **PostgreSQL** — required datastore (HC-1).
- **Mail source** — how mail actually enters the system: for MVP, via webhook ingest (FR-MAIL-002). Direct IMAP/POP mailbox polling is a possible provider but is deferred (see OQ-1 / Out of Scope).
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

## 8. Negative Scenarios

| #    | Scenario                                                           | Expected behavior                                                                           | Affected AC-IDs                                               |
| ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| N-1  | DNS/server provider unreachable or returns 5xx.                    | Section renders with per-provider error indicator; healthy providers still shown; no crash. | AC-DOM-003, AC-SRV-003, AC-PROV-003                           |
| N-2  | Provider rejects a DNS/power mutation.                             | Error surfaced to user; displayed state reflects actual provider (unchanged) state.         | AC-DOM-009, AC-SRV-008                                        |
| N-3  | Webhook request with missing/invalid/revoked token.                | HTTP 401; nothing created.                                                                  | AC-WH-001, AC-WH-009                                          |
| N-4  | Webhook payload fails schema validation.                           | HTTP 400 with machine-readable error; nothing created.                                      | AC-WH-002                                                     |
| N-5  | Duplicate webhook delivery WITH same idempotency key.              | Exactly one entry created; second call returns existing entry.                              | AC-WH-004                                                     |
| N-5b | Retry/duplicate delivery WITHOUT an idempotency key.               | Processed as new create; duplicate entry may result (at-least-once); no dedup guarantee.    | AC-WH-010                                                     |
| N-6  | Webhook sender floods the endpoint.                                | Excess requests get HTTP 429; no entries created for throttled calls.                       | AC-WH-005, NFR-SEC-003                                        |
| N-7  | Webhook targets a non-existent channel (Messages).                 | HTTP 4xx; no message created (MVP: no auto-create).                                         | AC-MSG-006                                                    |
| N-8  | Unauthenticated user requests a dashboard route.                   | Redirect to login; no data returned.                                                        | AC-AUTH-001                                                   |
| N-8b | Required auth env vars absent at startup.                          | App fails fast / blocks login; never serves an unauthenticated dashboard.                   | AC-AUTH-005                                                   |
| N-9  | Invalid bookmark input (empty name, bad URL).                      | Validation error; nothing persisted.                                                        | AC-BM-007, AC-BM-008, AC-BM-005                               |
| N-10 | Deleting a category/channel/alert-category that contains children. | Confirmed cascade or reassignment; no orphans remain.                                       | AC-BM-004, AC-MSG-003, AC-ALR-002                             |
| N-11 | Bookmark icon missing or fails to load.                            | Deterministic fallback rendered; no broken image.                                           | AC-BM-011                                                     |
| N-12 | Large list section (10k+ rows).                                    | Server-side pagination bounds each response; UI stays responsive.                           | AC-MAIL-005, AC-LOG-004, AC-ALR-006, AC-MSG-007, NFR-PERF-001 |
| N-13 | No real provider credentials configured.                           | Mock mode returns deterministic data; UI fully exercisable.                                 | AC-PROV-001, AC-DOM-002, AC-SRV-002                           |
| N-14 | Webhook body oversized or non-JSON/unparseable.                    | HTTP 413 (oversized) or HTTP 400 (unparseable); nothing created.                            | AC-WH-011, NFR-SEC-003                                        |

---

## 9. Decisions & Residual Risks

### Decisions

| ID                                     | Decision                                                                                                                                       | Source / Evidence                                                     | Affected requirements                       |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------- |
| D-1                                    | Deliver via vertical slices; Slice 1 = shell + minimal auth + Bookmarks.                                                                       | progress.md line 3, 37; brief; debate-cycle-1 decision                | All Slice 1 ACs                             |
| D-2                                    | External integrations behind provider abstraction with mock mode; keys via env later.                                                          | progress.md line 38                                                   | FR-PROV-001, Domains, Servers, Mail         |
| D-3                                    | Unified webhook ingest with `type` discriminator, not four bespoke endpoints.                                                                  | §7 sub-decision                                                       | FR-WH-001                                   |
| D-4 (provisional — pending OQ-1..OQ-4) | Mail/Logs/Alerts are read+organize+delete for MVP; no compose/send.                                                                            | A-1 minimal interpretation (medium confidence, unconfirmed)           | FR-MAIL-001, FR-LOG-001, FR-ALR-002         |
| D-5 (provisional — pending OQ-1)       | Mail enters primarily via webhook ingest for MVP; IMAP/POP polling deferred.                                                                   | Simplicity; brief emphasizes webhook (medium confidence, unconfirmed) | FR-MAIL-002; Out of Scope                   |
| D-6                                    | Fixed stack per user; downstream agents do not re-litigate.                                                                                    | HC-1                                                                  | NFR-STACK-001                               |
| D-7                                    | Slice 1 auth = minimal single operator, env-seeded credentials; RBAC/user-mgmt out of scope.                                                   | Coordinator decision, debate cycle 1 (progress.md Decisions log)      | FR-AUTH-001, AC-AUTH-002, AC-AUTH-005, HC-9 |
| D-8                                    | Webhook idempotency key is optional and scoped per token; dedup guaranteed only with a key; success = HTTP 201 synchronous create.             | CH-PRD-002 / CH-PRD-007 resolution; doc-review F-3                    | AC-WH-003, AC-WH-004, AC-WH-010, US-10      |
| D-9                                    | Server power-action success = provider 2xx AND polled status equals target within bound (30/30/60s).                                           | CH-PRD-003 resolution                                                 | AC-SRV-004, AC-SRV-005, AC-SRV-006          |
| D-10                                   | Messages webhook to a missing channel is rejected (4xx) for MVP; auto-create deferred to inactive AC-MSG-008 under OQ-6.                       | CH-PRD-006 resolution                                                 | AC-MSG-006, AC-MSG-008                      |
| D-11                                   | Substring/text filters excluded from the 500ms perf target unless a trigram/full-text index is adopted; otherwise pagination-only.             | CH-PRD-010 resolution                                                 | NFR-PERF-002                                |
| D-12                                   | Category/channel and alert-category deletion may cascade or reassign at implementation's discretion; only the no-orphan invariant is asserted. | Doc-review F-2                                                        | AC-MSG-003, AC-ALR-002                      |

### Residual risks

| ID  | Residual risk                                                                                                                  | Mitigation / Verification / Acceptance                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| R-1 | Provider APIs (Cloudflare/Hetzner/GoDaddy) differ in capabilities; some DNS/server operations may be unsupported per provider. | Mitigate via AC-PROV-003 (graceful "unsupported"); verify per-provider during each slice.                                   |
| R-2 | "Manage" ambiguity (A-1) could expand scope late if user expects sending/routing.                                              | Mitigate by confirming OQ-1..OQ-4 before Mail/Logs/Alerts slices; D-4/D-5 marked provisional; MVP accepts read-only.        |
| R-3 | Env-seeded single-operator auth (D-7): weak env values or leaked env could expose a self-hosted panel.                         | Verify AC-AUTH-001..005; architect selects secure hashing/session; operator responsible for env secret strength (accepted). |
| R-4 | Webhook idempotency/rate-limit/size thresholds may need real-world calibration.                                                | Accept configurable defaults; verify AC-WH-004/005/010/011 with tests; revisit thresholds post-launch.                      |
| R-5 | Unbounded retention (A-5) grows the DB over time.                                                                              | Accepted for MVP; flag retention policy as a post-MVP consideration.                                                        |
| R-6 | Text-search latency (D-11) unbounded without a trigram/FTS index.                                                              | Mitigate by pagination-only fallback (NFR-PERF-001); architect decides index strategy; accepted for MVP.                    |

---

## 10. Out of Scope

Explicitly **not** part of this work (prevents scope creep):

- **Billing / payments / subscriptions.**
- **Multi-tenancy** (organizations, tenant isolation). Single-user/small-team only.
- **User management / RBAC / multiple accounts.** MVP is a single env-seeded operator (D-7).
- **Native mobile applications** (iOS/Android). Responsive web shell only per AC-SHELL-004.
- **Composing and sending outbound email** from the Mail section (MVP is read/organize; D-4, provisional).
- **IMAP/POP mailbox polling** as a mail source for MVP (mail arrives via webhook; D-5, provisional). May become a later provider.
- **Human-authored messages** typed into Messages channels for MVP (messages arrive via webhook; OQ-2). Viewing is in scope.
- **Webhook channel auto-create** (AC-MSG-008 is inactive pending OQ-6).
- **VPS provisioning / resizing / rebuilding / snapshots / creating new servers.** Only list + status + start/stop/restart (HC-7, A-7).
- **Domain registration/transfer/purchase.** Only inventory + DNS record management for already-owned domains.
- **Internationalization / localization** (HC-5).
- **Alert routing / escalation / on-call scheduling / outbound notification delivery** (email/SMS/push out). Alerts are ingested and viewed, not dispatched.
- **Analytics dashboards, uptime graphs, metrics time-series** beyond the listed sections.
- **Real provider credentials in Slice 1** — Slice 1 (Bookmarks) has no provider dependency (only env-seeded operator creds).

---

## 11. Success Metrics

Measurable criteria the tester validates:

- **M-1 (Slice 1 completeness):** 100% of Slice 1 AC-IDs (AC-SHELL-001..004, AC-AUTH-001..005, AC-BM-001..014) pass automated/manual verification.
- **M-2 (Bookmarks CRUD correctness):** All bookmark and category create/read/update/delete operations persist across a page reload and satisfy their ACs, including validation rejections (AC-BM-005/007/008).
- **M-3 (Auth enforcement):** Zero dashboard routes are reachable unauthenticated (AC-AUTH-001) in a route-coverage test; the operator is bootstrapped from env (AC-AUTH-005); the webhook API is the only token-gated exception (AC-WH-001).
- **M-4 (Webhook reliability):** Duplicate deliveries with an idempotency key produce exactly one entry (AC-WH-004); deliveries without a key are documented at-least-once (AC-WH-010); over-rate deliveries are throttled with 429 (AC-WH-005); invalid tokens/payloads/oversized bodies never create entries (AC-WH-001/002/011).
- **M-5 (Provider mock parity):** Every provider-backed section is fully exercisable in mock mode with zero external network calls (AC-PROV-001, AC-DOM-002, AC-SRV-002).
- **M-6 (Pagination bound):** No list endpoint (including channel messages) returns more than the configured page size in a single response for a seeded large dataset (NFR-PERF-001, AC-MSG-007).
- **M-7 (Deployability):** The documented Docker startup brings up app + PostgreSQL and serves the login screen (NFR-DEPLOY-001).
- **M-8 (Accessibility baseline):** Slice 1 screens pass automated a11y checks with no critical violations (NFR-A11Y-001).

---

## Appendix A — Open Questions

These do not block Slice 1 (Bookmarks + shell + minimal auth). Each MVP interpretation uses the **minimal** reading; the alternative is recorded for the user to confirm before the relevant later slice.

- **OQ-1 (Mail scope):** Does "manage mail" require composing/sending outbound email, or only viewing incoming mail? _MVP interpretation:_ view/filter/sort/delete only (D-4, provisional). _Alternative:_ add compose/send.
- **OQ-2 (Messages authoring):** Should the operator be able to type messages into channels from the UI, or is the UI read-only with messages arriving only via webhook? _MVP interpretation:_ view-only + webhook ingest. _Alternative:_ human composing.
- **OQ-3 (Servers scope):** Beyond start/stop/restart, does "manage configurations" include resize/rebuild/create/delete servers? _MVP interpretation:_ view config + power actions only (A-7). _Alternative:_ full lifecycle.
- **OQ-4 (Logs/Alerts management):** Is any mutation beyond view/filter/sort/delete expected (e.g., acknowledge/resolve alert state)? _MVP interpretation:_ view/organize/delete; alert acknowledge state is a candidate add. _Alternative:_ add ack/resolve workflow.
- **OQ-5 (Auth mechanism) — RESOLVED for Slice 1/MVP:** Single operator, credentials env-seeded (coordinator decision, debate cycle 1; AC-AUTH-001..005). Multi-account/external-provider auth remains a post-MVP question only.
- **OQ-6 (Webhook auto-create):** For Messages ingest, should a webhook to a non-existent channel auto-create the channel or be rejected? _MVP interpretation:_ reject with 4xx (AC-MSG-006). _Alternative:_ auto-create (future AC-MSG-008, currently inactive until this is resolved).
- **OQ-7 (Webhook token granularity):** One shared token, or per-source/per-type tokens with scopes? _MVP interpretation:_ one or a few shared tokens (A-4). _Alternative:_ scoped per-source tokens.
- **OQ-8 (Bookmark icon type):** Icon as name/URL/emoji reference vs uploaded image asset? _MVP interpretation:_ reference value (A-2), no upload. _Alternative:_ image upload + favicon auto-fetch.
- **OQ-9 (Retention):** Any retention/expiry policy for mail/messages/logs/alerts? _MVP interpretation:_ retain until deleted (A-5). _Alternative:_ configurable retention.

---

## Appendix B — AC-ID Index (traceability)

Slice 1 AC-IDs are marked. All IDs are stable and must not be renumbered or reused; AC-IDs appear in logical, not numeric, order (e.g., AC-MSG-007 sits inside FR-MSG-001 before AC-MSG-005/006 in FR-MSG-002). No AC-IDs have been retired in v2/v2.1.

- Shell (Slice 1): AC-SHELL-001..004
- Auth (Slice 1): AC-AUTH-001..005 _(AC-AUTH-005 added in v2)_
- Bookmarks (Slice 1): AC-BM-001..014
- Domains: AC-DOM-001..009
- Servers: AC-SRV-001..008 _(AC-SRV-004..006 reworded in v2)_
- Mail: AC-MAIL-001..006
- Messages: AC-MSG-001..008 _(AC-MSG-007, AC-MSG-008 added in v2; AC-MSG-006 de-branched)_
- Logs: AC-LOG-001..005
- Alerts: AC-ALR-001..007
- Webhook: AC-WH-001..011 _(AC-WH-010, AC-WH-011 added in v2; AC-WH-003 fixed to 201)_
- Provider: AC-PROV-001..003

---

## Appendix C — Changelog

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
