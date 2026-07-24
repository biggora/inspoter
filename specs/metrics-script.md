# VPS Metrics Agent — Implementation Plan

> **⚠ PARTIALLY SUPERSEDED (2026-07-24).** The token model in this plan no longer matches the implementation. Migration `20260724100000_universal_api_tokens` dropped the `ServerAgentToken` model, so everything in this document that depends on it is historical only:
>
> - the `ServerAgentToken` state machine (`UNBOUND` → `BOUND` → `REVOKED`), per-server token binding, one-active-bound-per-server index, 15-minute unbound expiry, and the token state-field CHECK;
> - the `tokenState` field in the `POST /api/server-metrics` response (the body is now `{ code, localServerId }`);
> - the owner-only token-management acceptance criteria (token management is member-level);
> - the `/api/server-metrics/tokens/**` management routes (removed).
>
> Replacement: **universal API tokens** — workspace-level `WebhookToken` rows (`channelId: null`) authenticate both webhook ingestion and `POST /api/server-metrics`, with list/create/revoke/rotate on `/api/webhook-tokens/**`. Server identity is resolved per ingest from reported global IPv4 address claims (claim match → provider discovery → agent-only auto-create), and metrics states are reduced to `not_configured`/`live`/`stale`. See `docs/architecture.md` §7C for the current design. The rest of this plan (schema for `LocalServer`/`LocalServerAddress`/`ServerMetricSnapshot`, agent container, payload validation, discovery deadline) remains historically accurate.

**Artifact version:** v0.8
**Status:** Draft implementation-ready after Slice 0 document/ADR approval; implementation has not started
**Owner:** Implementation Planner
**Date:** 2026-07-21
**Target repository:** `E:\Projects\inspot\inspot-dashboard`
**Delivery method:** Vertical slices with an integration tracer first
**Subordinate implementation contract after approval:** this plan operationalizes the amended documents in the §0 order of authority and never overrides them

## 0. Normative inputs

The implementation must follow these inputs in descending authority:

1. `docs/prd.md`, after Slice 0 incorporates the approved server-metrics amendment and stable AC mappings.
2. `docs/design.md` plus normative design inputs indexed by `specs/README.md`.
3. `docs/architecture.md` plus the approved `ADR-MET-001` disposition recorded by Slice 0.
4. `docs/plan.md` and `docs/test-plan.md` for implementation order and verification traceability.
5. Current repository source for `CURRENT` facts only.

The task conversation and Requirements Analyst base/delta reports are **non-normative provenance** used to draft the amendment. They record the approved intent—Dockerized 60-second HTTPS push, latest snapshot only, 180-second stale threshold, hash-only bearer tokens, narrow read-only host mounts, separate GHCR agent image, explicit IP reporting, deterministic attach-or-create behavior, and no monitoring stack—but do not outrank the amended PRD, Design, or Architecture.

Repository source remains authoritative for `CURRENT`. This document defines `TARGET` only. No target behavior may be reported as implemented until its slice gate passes.

### 0.1 Revision-cycle-1 challenge ledger

All adversarial findings are retained below. No challenge was silently removed.

| ID | Disposition | Evidence and exact correction |
|---|---|---|
| CH-PLAN-001 | `accepted_and_fixed` | Cycle 1 introduced compound tenant checks and controlled deletion; v0.5 retains them on the source-compatible workspace-local credential/remote tuple described in §0.3. |
| CH-PLAN-002 | `accepted_and_fixed` | A nullable Prisma unique was insufficient to model current address claims. §§8–9 now separate source observations from one partial-unique current IPv4 enrollment claim and define atomic refresh, IP-change, revoke, missing, conflict, and retirement behavior; §17 covers dual-source, reuse, and concurrent claims on PostgreSQL. |
| CH-PLAN-003 | `accepted_and_fixed` | The v0.2 model allowed multiple bound tokens and retained enrollment expiry after binding. §§3, 8, and 9 now require a partial unique index for one active bound token, atomic rotation, a fixed 15-minute unbound expiry, and `expiresAt = NULL` on binding. |
| CH-PLAN-004 | `accepted_and_fixed` | v0.2 wrote reconciliation state before match cardinality was known. §§3 and 9 now require all provider discovery and candidate selection to be read-only and in memory before the single final transaction; ambiguous/outage paths write nothing. |
| CH-PLAN-005 | `accepted_and_fixed` | Current `hetzner.ts` performs one list request while Hetzner lists are paginated, and Hetzner public IPv6 is a network rather than a concrete host literal. §§3, 5, 9, 15, and 17 now require every `meta.pagination.next_page`, fail closed on any page, IPv4-only auto-match, and IPv6 metadata-only in v1. |
| CH-PLAN-006 | `accepted_and_fixed` | Current `src/proxy.ts` exempts only Authentik and `/api/webhooks`. §§6, 13, 15, and 17 now require an exact `/api/server-metrics` exemption and tests proving token-management routes remain session-protected. |
| CH-PLAN-007 | `accepted_and_fixed` | The checked-in OpenAPI checker and unit test assert the complete public surface. §§13, 15, and 17 now include `tests/unit/openapi/public-openapi.test.ts`, route-source existence, bearer security, body limits, responses, and secret-free examples. |
| CH-PLAN-008 | `accepted_and_fixed` | Current UI keys, error maps, and pollers use remote IDs and the single-server poll replaces the composed object. §§10, 13, 15, and 17 now define a discriminated DTO, make `localServerId` the sole UI identity, and require the single-server endpoint to return the composed DTO. |
| CH-PLAN-009 | `accepted_and_fixed` | Whole-host `/proc` and `/` mounts were broader than collection requires. §§11, 17, and 20 now bind only five required proc files plus an empty root-filesystem probe directory; the disposable tracer must prove equal `statvfs` totals. |
| CH-PLAN-010 | `accepted_and_fixed` | Existing provider retries can exceed the v0.2 10-second agent timeout. §§9, 11, 17, and 20 now define a 45-second server discovery deadline, 60-second first-enrollment client timeout, 10-second bound-push timeout, and disconnect/lease-free retry tests. |
| CH-PLAN-011 | `accepted_and_fixed` | The expiry and IPv6 questions incorrectly gated work after their schema impact, and amd64 app evidence did not prove VPS architecture. §§3, 12, 15, and 22 resolve 15-minute expiry and IPv4-only matching before Slice 0 and require `linux/amd64,linux/arm64` agent release builds. |
| CH-PLAN-012 | `accepted_and_fixed` | Cycle 1 added future/out-of-order protection but retained an uptime exception; the cycle-2 correction in §0.2 supersedes that exception. |
| CH-PLAN-013 | `accepted_and_fixed` | Cycle 1 attempted binding reuse; Data Identity analysis later disproved the required stable Hetzner account identity. The v0.5 supersession in §0.3 is authoritative. |

**Cycle-1 result at time of submission:** none. The cycle-2 recheck below supersedes this result for remaining work.

### 0.2 Revision-cycle-2 challenge ledger

| ID | Disposition | Evidence and exact correction |
|---|---|---|
| CH-PLAN-001 | `accepted_and_fixed` | §8 now uses the actual quoted Prisma camelCase PostgreSQL identifiers in every normative CHECK/partial index and makes execution against disposable PostgreSQL 16, including malformed-row rejection, a Slice 0 gate rather than a source inspection. |
| CH-PLAN-002 | `accepted_and_fixed` | §§8–9 now define effective-claim transfer before provider-missing and credential-detach transitions. A bound agent’s current global IPv4 becomes the claim atomically; conflict aborts detach or retains the conservative prior hold for owner resolution, so no duplicate enrollment window opens. |
| CH-PLAN-003 | `accepted_and_fixed` | §8 adds a token state-field CHECK for valid `UNBOUND`, `BOUND`, and `REVOKED` field combinations and requires executed malformed-state migration tests. |
| CH-PLAN-010 | `accepted_and_fixed` | The stale durable-lease task is removed. §§9, 11, and 15 consistently use read-only request-local discovery with a 45-second deadline, no persisted enrollment lease/state, and one locked final transaction. |
| CH-PLAN-011 | `accepted_and_fixed` | §§12, 15, and 17 require `docker/setup-qemu-action` pinned to a verified immutable 40-hex SHA, a job-local registry, and manifest assertions for both `linux/amd64` and `linux/arm64`. |
| CH-PLAN-012 | `accepted_and_fixed` | §§3, 6, 9, and 17 remove the decreasing-uptime exception. Any `capturedAt <= stored.capturedAt` is ignored without changing snapshot data or `receivedAt`; future samples remain rejected. |
| CH-PLAN-013 | `needs_decision` | Cycle 2 correctly refused to invent `accountKey`; the new Data Identity evidence and narrow v0.5 ADR disposition in §0.3 resolve this former account-identity gate. |

**Cycle-2 result at time of submission:** `CH-PLAN-013` remained open. Section 0.3 supersedes that result.

### 0.3 Final CH-PLAN-013 disposition

| ID | Disposition | Evidence and correction |
|---|---|---|
| CH-PLAN-013 | `rejected_with_evidence` for `ProviderResourceBinding` reuse; `accepted_and_fixed` through explicit narrow supersession | Data Identity analysis found no source-grounded stable Hetzner Project/account ID. Current source exposes workspace credential ID and remote server ID only; credential ID, label, API token/hash, IP, or display name cannot safely become Q-13 `accountKey`. `ADR-MET-001` therefore keeps `ProviderResourceBinding` authoritative where already used but declares the metrics `LocalServer` a workspace-local projection keyed by `(workspaceId, providerCredentialId, providerRemoteId)`. It is not a global upstream ownership claim and never authorizes power. §§3, 8–10, 17, and 21 define the relation, deletion policy, residual duplicate-across-workspaces risk, and isolation/power non-leakage tests. |

**Unresolved challenge IDs:** none. The former account-identity OQ is removed; no `accountKey` is invented.

### 0.4 Final revision-cycle-3 ledger

| ID | Disposition | Evidence and exact correction |
|---|---|---|
| CH-PLAN-001 | `accepted_and_fixed` | §§8, 13, 15, and 17 now name the live `deleteCredential()` and `deleteWorkspace()` services, their route files, direct-delete replacements, ordered transactions, and executed credential/workspace deletion tests. `Restrict` detach semantics and complete four-model workspace cleanup are explicit. |
| CH-PLAN-002 | `accepted_and_fixed` | §§8–9 and §17 now define the reverse effective-claim transition on provider reappearance. Same-IP claims transfer agent→provider; different provider IP is claimed while the active agent IP remains claimed by the same local server; any conflict rolls back the complete reconciliation with previous claims intact. |
| CH-PLAN-013 | `accepted_and_fixed` | Residual operational references to provider bindings were replaced with workspace-local provider tuple/credential scope in enrollment, fixtures, gates, and conflicts. `ProviderResourceBinding` remains mentioned only in the historical challenge/ADR explanation of why it is not used for metrics. |

**Final unresolved challenge IDs:** none.

### 0.5 Ordinary doc-review rework ledger

| Item | Disposition |
|---|---|
| DOC-MET-001 | `accepted_and_fixed` — §0 restores PRD → Design → Architecture/ADR → Plan/Test authority; analyst reports are provenance only. |
| DOC-MET-002 | `accepted_and_fixed` — §8 lists only Prisma inverse relations actually represented in the shown models and makes `prisma validate` plus migration execution mandatory. |
| DOC-MET-003 | `accepted_and_fixed` — §17.1 maps every AC-MET-001..063 exactly once to an owning slice, exact test path, and named case/group. |
| DOC-MET-004 | `accepted_and_fixed` — §13 now includes the Servers list route, direct `ipaddr.js` dependency/lockfile, and exact metrics rate-limit/config/test files. |
| DOC-MET-005 | `accepted_and_fixed` — §10 defines deterministic `not_configured`, `waiting`, `live`, `stale`, and `revoked` precedence plus exact rows/actions/tests. |
| DOC-MET-006 | `accepted_and_fixed` — §§6, 11, 13, 15, and 17 define the per-token fixed-window limiter, defaults/env/`Retry-After`, bound-state success response, 60→10-second timeout switch, and lost-201 recovery test. |
| DOC-MET-007 | `accepted_and_fixed` — the artifact header now identifies this plan as a subordinate implementation contract; the §0 PRD → Design → Architecture/ADR → Plan/Test authority remains controlling. |
| DOC-MET-008 | `accepted_and_fixed` — §10 makes `UNBOUND` enrollment workspace page/dialog state only; per-server `waiting` now requires a server-bound `BOUND` token with no snapshot, the named test moved out of the metrics-state group, and the provider/agent table is explicitly non-exhaustive. |
| DOC-MET-009 | `accepted_and_fixed` — §17.1 assigns AC-MET-001..004 to the Slice 0 `RUN_ONCE` tracer and gives AC-MET-005/009 exact Python named cases while retaining applicable TypeScript validation coverage. |

**Ordinary doc-review unresolved items:** none.

## 1. Problem and goal

### 1.1 Problem

Hetzner Cloud API provides provider-side inventory, power state, CPU activity, network, and disk I/O, but it does not expose operating-system facts such as:

- free filesystem space;
- actual memory and swap usage;
- Linux load average;
- host uptime.

The current Servers page displays provider configuration values such as allocated vCPU, RAM, and disk capacity. It has no host metrics agent, persisted local server identity, latest metric snapshot, or representation for a server that exists only because an agent enrolled.

The new IP enrollment requirement also means a metric snapshot cannot simply be keyed by a transient Hetzner response. The system needs a durable local identity that can represent:

- a provider-managed VPS;
- an agent-only VPS;
- a provider-managed VPS temporarily unavailable from the provider;
- a formerly provider-managed VPS no longer present in the latest successful inventory.

### 1.2 Goal

Deliver a minimal Dockerized Linux agent and dashboard integration that:

1. reads host CPU, memory, swap, load, root-filesystem, uptime, hostname, and explicitly configured host IPs;
2. pushes one snapshot every 60 seconds over HTTPS;
3. enrolls using a workspace-scoped, one-time bootstrap token;
4. discovers the server by public/global IP during enrollment only;
5. attaches to exactly one deterministic provider server when possible;
6. creates an agent-only local server when there is no provider match;
7. never auto-links when matching is ambiguous;
8. never trusts workspace or server identity supplied by the agent;
9. persists only the latest snapshot;
10. displays live, waiting, stale, provider-unavailable, provider-missing, and agent-only states;
11. preserves all current power-action behavior for confirmed provider-managed servers;
12. exposes no power action for agent-only or unconfirmed servers.

## 2. CURRENT / GAP / TARGET

| Area | CURRENT | GAP | TARGET |
|---|---|---|---|
| Server inventory | Provider DTOs returned through `src/lib/services/servers.ts` | No durable local server identity | Persist `LocalServer` and reconcile provider inventory to stable provider identity |
| Provider server identity | Current API uses provider credential ID plus remote server ID | Inventory disappears when the provider is unavailable | Keep a local identity and provider-presence timestamps; do not silently delete |
| Agent-only VPS | Unsupported | An agent cannot create a Servers entry | Create an agent-only `LocalServer` after a successful unambiguous enrollment |
| IP identity | One primary provider IPv4 string is displayed | No canonical multi-address matching; Docker bridge discovery is unreliable | Agent receives explicit `SERVER_IPS`; TypeScript and Python parse/canonicalize addresses |
| Metrics | Configuration capacity strings only | No OS metrics | Latest `ServerMetricSnapshot` per local server |
| Authentication | Operator session and webhook bearer patterns exist | No server-agent token lifecycle | One-time enrollment token transitions to a server-bound token |
| UI | Provider cards and power actions | No metrics/freshness/agent-only states | Add a metrics block and agent lifecycle controls without changing power semantics |
| Release | Existing app release builds `ghcr.io/${{ github.repository }}` | No agent image | Separate release workflow and package suffix `-metrics-agent` |
| Deployment | App + PostgreSQL Compose | No VPS-side agent Compose | Independent agent Compose on each monitored VPS |
| Public API docs | Checked-in OpenAPI covers public webhook ingress | Metrics ingress is another public machine endpoint | Amend OpenAPI and its contract checker |
| Product documents | Servers requirements cover inventory and power | Persisted agent-created inventory is a material scope addition | PRD, Design, Architecture/ADR, Plan, and test-plan amendment before implementation |

## 3. Decisions

### DEC-MET-001 — Local identity first

`LocalServer` is the durable workspace-local identity used by metrics snapshots and agent tokens. A provider-backed row uses only the tuple available and verifiable in current source:

```text
workspaceId + providerCredentialId + providerRemoteId
```

This tuple is a local composition key, not a global upstream ownership claim. The same upstream VPS may be represented in two workspaces if separately configured credentials expose it; v1 accepts that residual risk because Hetzner provides no verified stable Project/account ID. Tenant checks prevent data or token crossing, and this projection never authorizes provider mutations. Agent-only rows have no provider tuple. IP is not part of permanent identity.

### DEC-MET-002 — IP is enrollment discovery only

Public global-unicast IPv4 addresses may select a server only while an enrollment token is unbound. IPv6 literals, including global IPv6, are metadata-only in v1 because Hetzner exposes a public IPv6 network and the agent reports a host literal; CIDR-containment identity is outside this release.

After binding:

- the token’s `localServerId` is authoritative;
- later IP changes update address metadata only;
- IP changes never move a token or snapshot to another server;
- a provider identity change never occurs through IP matching.

### DEC-MET-003 — Explicit `SERVER_IPS`

The Docker agent receives a comma-separated `SERVER_IPS` environment variable. It does not infer host IPs from its Docker bridge interface.

Example:

```dotenv
SERVER_IPS=203.0.113.20,2001:db8:1234::20
```

Empty or malformed input fails fast. Loopback, unspecified, multicast, reserved, and broadcast values are rejected. Private, link-local, and IPv6 values may be retained as non-matchable metadata, but only a public global-unicast IPv4 literal participates in v1 auto-match.

### DEC-MET-004 — Four persisted models

The minimum model set is:

- `LocalServer`;
- `LocalServerAddress`;
- `ServerAgentToken`;
- `ServerMetricSnapshot`.

No history table, alert table, queue, Prometheus-compatible storage, or separate agent service is added.

### DEC-MET-005 — Enrollment token becomes bound token

An owner creates a dedicated enrollment token for one VPS. It expires 15 minutes after creation while `UNBOUND`. The same secret transitions atomically from `UNBOUND` to `BOUND`, `expiresAt` is cleared in that transaction, and the container does not need to rewrite its environment after enrollment.

The token is not a reusable workspace-wide enrollment credential. A PostgreSQL partial unique index permits only one non-revoked `BOUND` token per `LocalServer`. Rotation generates the replacement secret first, then revokes the old token and creates the replacement in one transaction.

### DEC-MET-006 — Latest snapshot only

`ServerMetricSnapshot.localServerId` is unique. Every accepted push upserts that row. No time-series history is stored.

### DEC-MET-007 — Freshness uses server receive time

The UI calculates freshness from `receivedAt`, which is generated by Inspoter. Agent `capturedAt` is informational and cannot control the live/stale state.

Snapshot ordering is nevertheless enforced:

- reject `capturedAt` more than five minutes in the future with `422 CLOCK_SKEW_FUTURE`;
- accept a strictly newer `capturedAt`;
- ignore an equal or older sample without changing snapshot fields or `receivedAt`, regardless of uptime changes.

An ignored sample may update only token `lastUsedAt` and returns a successful `SNAPSHOT_IGNORED_OUT_OF_ORDER` code so the agent does not retry it. This strict v1 rule may temporarily ignore samples after a backwards host-clock correction until `capturedAt` advances past the stored value; it never converts an older replay into a fresh snapshot.

### DEC-MET-007A — Canonical current address claim

`LocalServerAddress` stores observations, but only one current global IPv4 observation per workspace may be the enrollment claim for an address. A partial unique PostgreSQL index enforces this independently of provider/agent source. IPv6 and non-global IPv4 rows never receive an enrollment claim.

For a provider-backed server the provider observation owns the claim; the same agent-reported address remains a separate non-claim observation. For an agent-only bound server, an address change atomically retires old claims before attempting new claims. A conflicting new address is retained as non-claim metadata, metrics still update by bound token identity, and the conflict is surfaced for owner action.

### DEC-MET-008 — Provider failure fails closed during unbound enrollment

Unbound enrollment performs provider I/O and candidate selection read-only, before any enrollment write. Hetzner inventory is requested with `per_page=50` and follows every `meta.pagination.next_page` until absent, with a defensive maximum of 100 pages. If any page or configured server provider fails:

- do not create a `LocalServer`;
- do not bind the token;
- do not write a snapshot;
- return a retryable `503 PROVIDER_INVENTORY_UNAVAILABLE`.

A bound token never requires a provider call to submit later snapshots. The server discovery deadline is 45 seconds; exceeding it has the same zero-write 503 result.

### DEC-MET-009 — No ambiguous auto-link

Enrollment fails with `409 SERVER_MATCH_AMBIGUOUS` when:

- reported matchable IPv4 addresses resolve to more than one current provider server;
- separate reported IPs resolve to different local servers;
- provider inventory contains duplicate ownership of the same normalized global IP;
- a public IP is already claimed by a conflicting active agent-only identity.

No “first match wins” behavior is permitted.

### DEC-MET-010 — Power actions remain provider-only

Metrics identity never authorizes power. Existing power actions remain authorized by the current authenticated active-workspace provider flow and live provider presence, and are rendered only when all are true:

- the live provider DTO was returned by a credential loaded for the authenticated active workspace;
- its credential ID and remote server ID match the composed local projection;
- the latest provider refresh confirms the resource is present;
- provider inventory is currently available;
- existing reconciliation and workspace rules permit the action.

Agent-only, provider-missing, provider-unavailable, and ambiguous entries expose no start, stop, or restart control. `localServerId`, addresses, metrics tokens, and snapshots are ignored as mutation authority.

### DEC-MET-010A / ADR-MET-001 — Narrow metrics identity exception

`ProviderResourceBinding` remains authoritative for features that already have a source-grounded stable provider `accountKey`. It is unsuitable for Hetzner metrics v1 because no stable Project/account ID can be derived from current source or verified provider data without inventing identity. Metrics explicitly supersede binding reuse only for their local read/composition projection. The local tuple is workspace-scoped, cannot claim global upstream ownership, cannot transfer ownership, and cannot grant power access.

### DEC-MET-011 — Release isolation

The app remains:

```text
ghcr.io/biggora/inspoter:<release-tag>
```

The agent becomes:

```text
ghcr.io/biggora/inspoter-metrics-agent:<release-tag>
```

Identical tags do not conflict because these are separate packages.

## 4. Scope

### 4.1 Included

- Linux host collection from `/proc` and root filesystem statistics;
- CPU utilization percentage;
- load average 1/5/15;
- memory total and available;
- swap total and free;
- root filesystem total and available;
- uptime;
- hostname;
- explicit IP metadata;
- secure token creation, listing, rotation/replacement, and revocation;
- deterministic enrollment;
- provider inventory reconciliation into local identity;
- agent-only Servers entries;
- latest snapshot API and UI;
- EN/RU strings;
- accessibility states and labels;
- agent Dockerfile and VPS Compose example;
- agent CI and release workflows;
- public OpenAPI contract;
- unit, contract, integration, UI, and container smoke tests.

### 4.2 Excluded

- Grafana, Prometheus, Alertmanager, Netdata;
- metrics history or graphs;
- threshold alerts;
- service/process/container monitoring;
- SSH polling;
- opening an inbound port on the VPS;
- Docker socket access;
- automatic installation over SSH;
- automatic host-IP discovery through Docker networking;
- multi-root or arbitrary mount dashboards in v1;
- Windows agents;
- provider lifecycle operations;
- creating, deleting, rebuilding, resizing, or migrating Hetzner VPS instances;
- HMAC request signing, nonce persistence, or replay tables;
- production deployment and live GHCR publication as implementation verification.

## 5. Requirements and acceptance criteria

### REQ-MET-001 — Host metric collection

- **AC-MET-001:** Given valid host `/proc` and root mounts, when the agent samples the host, then it produces CPU usage, load 1/5/15, memory total/available, swap total/free, root-filesystem total/available, uptime, hostname, and configured IPs.
- **AC-MET-002:** CPU usage is calculated from two host `/proc/stat` samples and is finite within `0..100`.
- **AC-MET-003:** Root available bytes use `f_bavail`, not `f_bfree`.
- **AC-MET-004:** Agent collection reads host paths, not the container’s overlay filesystem or container cgroup values.

### REQ-MET-002 — Strict address handling

- **AC-MET-005:** Python validates each `SERVER_IPS` value with the standard-library `ipaddress` parser.
- **AC-MET-006:** Dashboard validation uses a real IP parser such as `ipaddr.js`; regex-only IP validation is forbidden.
- **AC-MET-007:** Public global-unicast IPv4 addresses are canonicalized and eligible for enrollment matching.
- **AC-MET-008:** IPv6, private IPv4, and link-local values are metadata-only; loopback, unspecified, multicast, reserved, and broadcast values are rejected; none triggers provider auto-linking.
- **AC-MET-009:** A malformed configured address makes the agent fail fast before transmitting any token or payload.

### REQ-MET-003 — Enrollment authentication

- **AC-MET-010:** An owner can generate a dedicated enrollment token; the raw secret is returned once.
- **AC-MET-011:** The database stores only SHA-256 token hash and a display prefix.
- **AC-MET-012:** Workspace and server authority come only from the authenticated token and server-side lookup, never from payload fields.
- **AC-MET-013:** Invalid, expired, or revoked tokens return `401 UNAUTHORIZED`.
- **AC-MET-014:** A token already bound to server A cannot be rebound to server B by changing hostname or IPs.

### REQ-MET-004 — Deterministic enrollment

- **AC-MET-015:** Given exactly one current provider server matching a reported global address, enrollment attaches the token and snapshot to that provider server’s `LocalServer`.
- **AC-MET-016:** Given no matching current provider server and no conflicting local identity, enrollment creates one agent-only `LocalServer`.
- **AC-MET-017:** Given more than one eligible match, enrollment returns `409 SERVER_MATCH_AMBIGUOUS` and writes no local server, token association, address, or snapshot.
- **AC-MET-018:** Given configured provider inventory cannot be completed, unbound enrollment returns `503 PROVIDER_INVENTORY_UNAVAILABLE` and writes nothing.
- **AC-MET-019:** Concurrent enrollments for the same public address result in at most one address claim; the losing request re-reads and either attaches safely or returns `409`.
- **AC-MET-020:** Successful enrollment atomically binds the token and stores the first snapshot.

### REQ-MET-005 — Stable identity and IP reuse

- **AC-MET-021:** Once a token is bound, later snapshots are resolved by `token.localServerId`.
- **AC-MET-022:** A changed reported IP never changes `localServerId` or provider identity.
- **AC-MET-023:** A provider server is reconciled only inside its workspace by `(workspaceId, providerCredentialId, providerRemoteId)`, not display name, token payload, or IP; the tuple grants no provider mutation authority.
- **AC-MET-024:** When a successful complete inventory no longer contains a provider server, the local row is marked provider-missing and retained.
- **AC-MET-025:** Provider-missing addresses are not eligible for new IP enrollment claims.
- **AC-MET-026:** Reappearance of the same stable provider identity clears provider-missing state.
- **AC-MET-027:** Reinstallation of an agent-only server uses an owner-created replacement token pre-bound server-side to that `LocalServer`; it does not rely on a reused IP.

### REQ-MET-006 — Latest snapshot ingestion

- **AC-MET-028:** A valid bound-token request upserts exactly one snapshot row for the local server.
- **AC-MET-029:** Repeated pushes do not create metric history rows.
- **AC-MET-030:** `receivedAt` is set by the dashboard.
- **AC-MET-031:** Payloads over the configured fixed maximum return `413 PAYLOAD_TOO_LARGE`.
- **AC-MET-032:** Invalid schema version or invalid metric invariants return a structured 4xx response and leave the prior snapshot unchanged.
- **AC-MET-033:** Excessive submissions from one token return `429 RATE_LIMITED` without affecting other agents.

### REQ-MET-007 — UI behavior

- **AC-MET-034:** The Servers page shows provider-managed and agent-only local servers in the active workspace only.
- **AC-MET-035:** A fresh snapshot received within 180 seconds shows live metrics.
- **AC-MET-036:** A local server with a pre-bound `BOUND` token and no snapshot shows `waiting`; an `UNBOUND` workspace enrollment token creates no per-server waiting state.
- **AC-MET-037:** A snapshot older than 180 seconds shows stale state and last receive time.
- **AC-MET-038:** Provider outage and provider-missing are distinct from agent stale state.
- **AC-MET-039:** Agent-only entries are visibly identified and expose no power controls.
- **AC-MET-040:** Existing start, stop, restart, confirmations, polling, errors, focus restoration, and toasts remain unchanged for confirmed provider servers.
- **AC-MET-041:** Metrics and agent states have EN/RU strings, keyboard-operable controls, non-color-only labels, and accessible status announcements.

### REQ-MET-008 — Container security

- **AC-MET-042:** The agent runs as a non-root image user with a read-only container filesystem and all Linux capabilities dropped.
- **AC-MET-043:** Only required individual proc files and an empty directory on the host root filesystem are mounted read-only; neither all `/proc` nor `/` is mounted.
- **AC-MET-044:** No `privileged`, host PID namespace, Docker socket, or inbound port is used.
- **AC-MET-045:** HTTPS certificate verification is enabled by default.
- **AC-MET-046:** The token and full payload never appear in normal logs.
- **AC-MET-047:** A failed push does not terminate the long-running agent; the next interval submits a newly collected snapshot rather than replaying an old queue.

### REQ-MET-009 — Release isolation

- **AC-MET-048:** Existing `.github/workflows/release-image.yml` remains functionally unchanged.
- **AC-MET-049:** A separate workflow builds `metrics-agent/Dockerfile` with context `metrics-agent`.
- **AC-MET-050:** A published release tag builds the same tag for the agent package.
- **AC-MET-051:** `latest` is written only for a non-prerelease, matching the app workflow.
- **AC-MET-052:** CI builds and smoke-tests the agent without pushing it.
- **AC-MET-053:** Production publication remains an external release gate and is not faked by a local build.

### REQ-MET-010 — Adversarial identity and integration corrections

- **AC-MET-054:** Hetzner enrollment follows every `meta.pagination.next_page`; a failure on any page returns 503 with zero enrollment writes, and a multi-page fixture can match a server beyond page one.
- **AC-MET-055:** A no-cookie request reaches exactly `POST /api/server-metrics`, while `/api/server-metrics/tokens/**` remains session-protected.
- **AC-MET-056:** At most one non-revoked bound token exists per local server; rotation is atomic; unbound expiry is 15 minutes and is cleared when binding succeeds; PostgreSQL rejects every malformed UNBOUND/BOUND/REVOKED field combination.
- **AC-MET-057:** Duplicate or out-of-order samples do not replace the snapshot or refresh `receivedAt`; decreasing uptime does not bypass this rule.
- **AC-MET-058:** A sample more than five minutes in the future is rejected and leaves snapshot/`receivedAt` unchanged.
- **AC-MET-059:** `localServerId` keys cards, errors, polling, and comparisons; a composed single-server poll retains metrics even when equal remote IDs exist under different provider credentials.
- **AC-MET-060:** Narrow proc-file mounts plus the root-filesystem probe directory produce the same metric values and root `statvfs` totals as the disposable Linux host without mounting all `/proc` or `/`.
- **AC-MET-061:** A provider-backed `LocalServer` has an all-or-none same-workspace credential/remote tuple; provider-missing, provider-reappearance, and credential-detach transitions atomically preserve/transfer effective global IPv4 claims with no uniqueness gap; identical remote servers visible in two workspaces never share local rows, tokens, snapshots, addresses, or power authority.
- **AC-MET-062:** Unbound provider discovery, pagination, and candidate selection perform no database writes; ambiguous match, provider failure, client disconnect, or deadline expiry leaves token/server/address/snapshot state unchanged.
- **AC-MET-063:** Credential deletion follows active-agent detach or inactive-graph delete semantics under `Restrict`; workspace deletion performs ordered local graph cleanup and leaves zero server-metrics rows; both API routes use the guarded services.

## 6. Public ingestion contract

### 6.1 Endpoint

```http
POST /api/server-metrics
Authorization: Bearer <agent-token>
Content-Type: application/json
```

No workspace ID, local server ID, provider credential ID, or Hetzner server ID is accepted from the payload.

`src/proxy.ts` must exempt only `pathname === "/api/server-metrics"` from the optimistic session-cookie redirect. It must not use a `/api/server-metrics` prefix exemption: `/api/server-metrics/tokens` and every management descendant remain protected by the existing session/DAL boundary. Proxy tests cover the exact public path, a trailing/child path, and token-management paths without a cookie.

### 6.2 Payload v1

```json
{
  "schemaVersion": 1,
  "agentVersion": "0.1.0",
  "capturedAt": "2026-07-21T09:15:00Z",
  "hostname": "web-prod-01",
  "ips": [
    "203.0.113.20",
    "2001:db8:1234::20",
    "10.10.0.20"
  ],
  "cpu": {
    "usagePercent": 23.4,
    "load1": 0.42,
    "load5": 0.31,
    "load15": 0.28
  },
  "memory": {
    "totalBytes": 16777216000,
    "availableBytes": 9126805504,
    "swapTotalBytes": 2147483648,
    "swapFreeBytes": 2147483648
  },
  "filesystem": {
    "mount": "/",
    "totalBytes": 171798691840,
    "availableBytes": 112742891520
  },
  "uptimeSeconds": 348120
}
```

### 6.3 Validation invariants

- strict object schemas; unknown fields rejected;
- `schemaVersion === 1`;
- maximum body: 16 KiB;
- hostname length `1..255`;
- agent version length `1..64`;
- maximum 16 unique canonical IPs;
- all numeric fields finite and JSON-safe integers where appropriate;
- `0 <= usagePercent <= 100`;
- `availableBytes <= totalBytes`;
- `swapFreeBytes <= swapTotalBytes`;
- filesystem mount is exactly `/` in v1;
- load values are non-negative;
- uptime is non-negative;
- `capturedAt` must be a valid UTC timestamp and must not be more than five minutes ahead of server time;
- ordering is compared with the stored `capturedAt`; every equal/older sample is ignored without an uptime exception;
- freshness remains based only on `receivedAt`.

### 6.4 Responses

| Status | Code | Meaning |
|---:|---|---|
| 200 | `SNAPSHOT_UPDATED` | Bound token snapshot updated; body includes `tokenState: "BOUND"` |
| 200 | `SNAPSHOT_IGNORED_OUT_OF_ORDER` | Duplicate/older sample ignored; `receivedAt` unchanged; body includes `tokenState: "BOUND"` |
| 201 | `AGENT_ENROLLED` | Enrollment bound and first snapshot stored; body includes `tokenState: "BOUND"` |
| 400 | `INVALID_PAYLOAD` | Schema or invariant failure |
| 401 | `UNAUTHORIZED` | Missing, invalid, expired, or revoked token |
| 409 | `SERVER_MATCH_AMBIGUOUS` | More than one eligible server |
| 409 | `ADDRESS_CONFLICT` | Public address is claimed by a conflicting identity |
| 409 | `TOKEN_ALREADY_BOUND` | An enrollment operation attempts an invalid rebinding |
| 413 | `PAYLOAD_TOO_LARGE` | Body exceeds 16 KiB |
| 422 | `UNSUPPORTED_SCHEMA_VERSION` | Unsupported version |
| 422 | `CLOCK_SKEW_FUTURE` | `capturedAt` is over five minutes ahead |
| 429 | `RATE_LIMITED` | Token submission limit exceeded |
| 503 | `PROVIDER_INVENTORY_UNAVAILABLE` | Unbound enrollment could not safely inspect configured providers |

All responses set `Cache-Control: no-store`.

### 6.5 Per-token fixed-window rate limit

Use the existing in-process fixed-window pattern from `src/lib/webhooks/ratelimit.ts`, implemented without altering webhook behavior in `src/lib/server-metrics/ratelimit.ts`.

```text
SERVER_METRICS_RATE_LIMIT=12
SERVER_METRICS_RATE_WINDOW_MS=60000
```

Rules:

1. Defaults allow 12 authenticated requests per token per 60-second window, enough for the normal one-per-minute agent plus bounded restart/manual retries.
2. Request processing order is bounded body read → bearer authentication → per-token rate check → JSON/schema handling. Invalid/unknown tokens never create limiter keys.
3. Limiter key is `ServerAgentToken.id`, never raw secret, hash, IP, workspace, or local server ID.
4. The thirteenth request in the same window returns `429 RATE_LIMITED` with `Retry-After: max(1, ceil((windowEnd-now)/1000))` seconds and does not modify token, addresses, or snapshot.
5. Windows reset independently per token. The accepted v1 single-process limitation matches the existing webhook limiter and must remain documented; multi-replica durable limiting is out of scope.
6. `src/lib/config/env.ts` validates positive integer values, `.env.example` documents defaults, Compose passes them to the app, and `scripts/test-env.mjs` allowlists deterministic test overrides.

## 7. Authenticated management contract

All management routes require:

- authenticated operator session;
- `X-Inspoter-Workspace`;
- workspace owner authorization for mutations.

Proposed routes:

```text
GET    /api/server-metrics/tokens
POST   /api/server-metrics/tokens
POST   /api/server-metrics/tokens/[id]/rotate
DELETE /api/server-metrics/tokens/[id]
```

Create body:

```json
{
  "name": "web-prod-01"
}
```

Optional trusted reinstall body, used only from an existing server card:

```json
{
  "name": "web-prod-01 replacement",
  "localServerId": "server-side-selected-id"
}
```

`localServerId` is accepted only on the authenticated owner route and is checked against the active workspace. It is never accepted by public ingestion.

Creation response returns the raw token once plus an installation template. List responses expose only token prefix, state, expiry, bound server summary, creation time, last use, and revocation time.

## 8. Data model

The Prisma names below are normative. Exact migration SQL must be reviewed against PostgreSQL 16.

```prisma
enum LocalServerOrigin {
  PROVIDER
  AGENT
}

enum ServerAddressFamily {
  IPV4
  IPV6
}

enum ServerAddressScope {
  GLOBAL
  PRIVATE
  LINK_LOCAL
  LOOPBACK
  RESERVED
  OTHER
}

enum ServerAddressSource {
  PROVIDER
  AGENT
}

enum ServerAgentTokenState {
  UNBOUND
  BOUND
  REVOKED
}

model LocalServer {
  id                            String    @id @default(cuid())
  workspaceId                   String
  workspace                     Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  origin                        LocalServerOrigin
  displayName                   String
  hostname                      String?
  providerCredentialId          String?
  providerCredentialWorkspaceId String?
  providerCredential            ProviderCredential? @relation(fields: [providerCredentialId, providerCredentialWorkspaceId], references: [id, workspaceId], onDelete: Restrict)
  providerRemoteId              String?
  providerLastSeenAt            DateTime?
  providerMissingAt             DateTime?
  createdAt                     DateTime @default(now())
  updatedAt                     DateTime @updatedAt
  addresses                     LocalServerAddress[]
  agentTokens                   ServerAgentToken[]
  metricSnapshot                ServerMetricSnapshot?

  @@unique([id, workspaceId])
  @@unique([workspaceId, providerCredentialId, providerRemoteId])
  @@index([workspaceId, origin, createdAt, id])
  @@index([workspaceId, providerMissingAt])
}

model LocalServerAddress {
  id              String @id @default(cuid())
  workspaceId     String
  localServerId   String
  localServer     LocalServer @relation(fields: [localServerId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  address         String
  family          ServerAddressFamily
  scope           ServerAddressScope
  source          ServerAddressSource
  matchKey        String?
  isCurrent       Boolean @default(true)
  isEnrollmentClaim Boolean @default(false)
  retiredAt       DateTime?
  claimConflictAt DateTime?
  firstSeenAt     DateTime @default(now())
  lastSeenAt      DateTime @default(now())

  @@unique([workspaceId, localServerId, address, source])
  @@index([workspaceId, address])
  @@index([workspaceId, localServerId])
}

model ServerAgentToken {
  id                       String @id @default(cuid())
  workspaceId              String
  workspace                Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  localServerId            String?
  localServer              LocalServer? @relation(fields: [localServerId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  name                     String
  tokenHash                String @unique
  tokenPrefix              String
  state                    ServerAgentTokenState @default(UNBOUND)
  expiresAt                DateTime?
  createdAt                DateTime @default(now())
  boundAt                  DateTime?
  lastUsedAt               DateTime?
  revokedAt                DateTime?

  @@unique([id, workspaceId])
  @@index([workspaceId, state, createdAt, id])
  @@index([workspaceId, localServerId])
}

model ServerMetricSnapshot {
  localServerId            String @id
  workspaceId              String
  localServer              LocalServer @relation(fields: [localServerId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  schemaVersion            Int
  agentVersion             String
  hostname                 String
  capturedAt               DateTime
  receivedAt               DateTime @default(now())
  cpuUsagePercent          Float
  load1                    Float
  load5                    Float
  load15                   Float
  memoryTotalBytes         BigInt
  memoryAvailableBytes     BigInt
  swapTotalBytes           BigInt
  swapFreeBytes            BigInt
  filesystemTotalBytes     BigInt
  filesystemAvailableBytes BigInt
  uptimeSeconds            BigInt

  @@index([workspaceId, receivedAt])
}
```

Required existing-model changes:

- add only `localServers` and `serverAgentTokens` inverse relations to `Workspace`, matching the direct `Workspace` relations shown on `LocalServer` and `ServerAgentToken`;
- do not add `localServerAddresses` or `serverMetricSnapshots` inverse relations to `Workspace`; those models carry `workspaceId` for scoped indexes/invariants but relate through `LocalServer` in the shown schema;
- add `localServers` plus `@@unique([id, workspaceId])` to `ProviderCredential` for the compound tenant-safe relation;
- do not add a global provider-ownership relation to metrics `LocalServer`.

The completed schema must pass `pnpm exec prisma validate` before migration SQL is generated or reviewed. A relation that exists only on one side of the shown Prisma schema is a Slice 0 failure, not a documentation shorthand.

The hand-authored PostgreSQL migration must add and test these constraints that Prisma cannot fully express:

```sql
ALTER TABLE "LocalServer"
ADD CONSTRAINT "LocalServer_origin_provider_tuple_check" CHECK (
  ("origin" = 'AGENT'
    AND "providerCredentialId" IS NULL
    AND "providerCredentialWorkspaceId" IS NULL
    AND "providerRemoteId" IS NULL)
  OR
  ("origin" = 'PROVIDER'
    AND "providerCredentialId" IS NOT NULL
    AND "providerCredentialWorkspaceId" = "workspaceId"
    AND "providerRemoteId" IS NOT NULL
    AND length(trim("providerRemoteId")) > 0)
);

ALTER TABLE "ServerAgentToken"
ADD CONSTRAINT "ServerAgentToken_state_fields_check" CHECK (
  ("state" = 'UNBOUND'
    AND "localServerId" IS NULL
    AND "boundAt" IS NULL
    AND "revokedAt" IS NULL
    AND "expiresAt" IS NOT NULL
    AND "expiresAt" > "createdAt")
  OR
  ("state" = 'BOUND'
    AND "localServerId" IS NOT NULL
    AND "boundAt" IS NOT NULL
    AND "revokedAt" IS NULL
    AND "expiresAt" IS NULL)
  OR
  ("state" = 'REVOKED'
    AND "revokedAt" IS NOT NULL
    AND (("localServerId" IS NULL AND "boundAt" IS NULL AND "expiresAt" IS NOT NULL)
      OR ("localServerId" IS NOT NULL AND "boundAt" IS NOT NULL AND "expiresAt" IS NULL)))
);

CREATE UNIQUE INDEX server_agent_token_one_active_bound_per_server
ON "ServerAgentToken" ("localServerId")
WHERE "state" = 'BOUND' AND "revokedAt" IS NULL;

CREATE UNIQUE INDEX local_server_address_one_current_ipv4_claim
ON "LocalServerAddress" ("workspaceId", "matchKey")
WHERE "isCurrent" = true
  AND "isEnrollmentClaim" = true
  AND "matchKey" IS NOT NULL;
```

Additional address CHECKs, also written with quoted camelCase identifiers, require a claim row to be current, non-retired, `family=IPV4`, `scope=GLOBAL`, and `matchKey=address`; every non-claim row must have `matchKey = NULL`. Slice 0 must apply the migration to disposable PostgreSQL 16 and execute real INSERT/UPDATE rejection tests for malformed provider tuples, cross-workspace credentials, blank remote IDs, all malformed token-state combinations, multiple active bound tokens, and duplicate current claims. `prisma validate` or SQL text review alone does not satisfy this gate.

`matchKey` rules:

- current global IPv4 provider observation: canonical `matchKey` and `isEnrollmentClaim=true`;
- same-server agent observation of that address: current metadata with no claim;
- initial/current agent-only global IPv4: canonical claim while its bound token is active;
- IPv6/private/link-local/non-global address: metadata with no claim;
- provider-missing with no active bound agent: retire provider observations and clear claims;
- provider-missing with an active bound agent: in the same transaction promote its current global IPv4 agent observation to the effective claim, then retire provider observations; if the agent has not yet reported a global IPv4, conservatively retain the last provider claim as an owner-resolution hold rather than opening a duplicate-enrollment window;
- provider reappears with the same IPv4: atomically clear the agent observation’s claim and assign that address claim to the current provider observation; both observations remain, but only the provider row claims that IP;
- provider reappears with a different IPv4: atomically claim the new provider IPv4 while retaining every current global IPv4 still reported by the active bound agent as claims owned by the same `LocalServer`; the older agent claim retires only when the bound agent stops reporting it, the token is revoked, or an owner-approved detach lifecycle retires it;
- conflicting bound-agent address: current metadata with no claim and `claimConflictAt` set;
- revoking the last active token of an agent-only server atomically retires its claims.

`ProviderCredential` deletion remains `Restrict` while provider-backed local rows exist. The existing owner-only credential deletion transaction must lock the credential and related local rows. If a local row has an active bound agent, it claims the agent’s current global IPv4 observations before clearing the credential/remote tuple and switching to `origin=AGENT`; provider observations are then retired. A claim conflict aborts credential deletion with `409 ADDRESS_CONFLICT` and leaves identity/claims unchanged. If no active agent exists, the transaction deletes the local row (cascading addresses/tokens/snapshot) before deleting the credential. Workspace deletion follows the same ordered cleanup. No database cascade may silently convert provider identity.

The implementation must replace the current direct `db.providerCredential.delete()` in `src/lib/services/credentials.ts::deleteCredential()` with that transaction. It must also replace the direct `db.workspace.delete()` in `src/lib/services/workspaces.ts::deleteWorkspace()` with an ordered transaction that deletes the workspace’s `LocalServer` rows first (their address/token/snapshot relations cascade), then deletes the workspace so credential and remaining content cascades cannot be blocked by `Restrict`. Both existing API routes continue calling their services; no route may bypass the policy.

## 9. Enrollment algorithm

### 9.0 Workspace-local provider projection

Provider-backed metrics enrollment uses the provider inventory already returned for credentials belonging to the token-bound workspace. It does not establish, reuse, or supersede global upstream ownership.

1. Full paginated discovery returns each server together with the current workspace’s `ProviderCredential.id` and stable remote server ID.
2. After unique IPv4 match cardinality is proven, finalization creates/finds `LocalServer` by `(workspaceId, providerCredentialId, providerRemoteId)`.
3. The compound credential relation and CHECK prove that the credential belongs to the same workspace; a foreign credential cannot be attached.
4. The tuple is used only to compose provider inventory with metrics. It is never accepted from the public payload and never passed as authorization evidence.
5. The same upstream VPS may create separate local projections in separate workspaces. Tests require fully separate IDs, tokens, addresses, snapshots, and UI state.
6. Existing power routes retain their authenticated active-workspace credential lookup and live provider presence checks. The local projection may enrich the returned DTO but cannot enable, select, or authorize a power operation.

### 9.1 Token claim

1. Hash bearer token with SHA-256.
2. Load token by hash.
3. Reject missing, expired, or revoked token.
4. If `BOUND`, skip enrollment and ingest by `localServerId`.
5. If `UNBOUND`, retain only the authenticated in-memory token/workspace projection and perform no write.
6. Provider I/O, pagination, normalization, and cardinality selection occur outside a database transaction and before any enrollment write.
7. The final transaction locks/re-reads the token and requires it still be unbound, non-revoked, and within its 15-minute expiry.

There is no persisted `ENROLLING` state or lease in v1. Concurrent work is resolved by the locked token, workspace-local provider-tuple uniqueness, active-token partial unique index, and address-claim partial unique index in the final transaction. A disconnected client before final commit leaves no enrollment writes.

### 9.2 Provider discovery

1. Resolve workspace only from the token.
2. List every configured server provider for that workspace.
3. For Hetzner, request `per_page=50` and follow every `meta.pagination.next_page` until absent; cap at 100 pages as a defensive malformed-pagination guard.
4. Normalize provider public global-unicast IPv4 literals. Retain provider IPv6 CIDR data only in the in-memory provider DTO/fixture; it is not an enrollment match key or `LocalServerAddress` literal in v1.
5. If any configured provider page fails or the 45-second discovery deadline expires, return 503 without resetting or writing any database row.
6. Detect duplicate IPv4 ownership and multi-server cardinality in memory; ambiguity fails closed.
7. Carry the unique provider result’s server-side workspace credential ID and remote server ID into finalization; never accept either from the agent payload.
8. Full provider reconciliation and missing-marker maintenance are separate from enrollment: they run only after a successful complete Servers read refresh. Enrollment persists only the selected local identity during finalization.

### 9.3 Candidate selection

Create sets:

```text
reportedGlobalIpv4s
providerServersWhoseGlobalIpv4sIntersect(reportedGlobalIpv4s)
eligibleWorkspaceProviderServers
```

Outcome:

- exactly one provider server → create/find its workspace-local provider-backed `LocalServer` by credential/remote tuple;
- zero provider identities → create agent-only `LocalServer`, unless a conflicting active claim exists;
- more than one provider/local identity → 409, no token association, address, or snapshot.

IPv6, private, and link-local addresses never enter candidate selection.

### 9.4 Atomic finalize

In one short transaction:

1. lock and re-read the token; require `UNBOUND`, non-revoked, and unexpired;
2. create/re-read the selected credential/remote-backed `LocalServer`, or create the agent-only row;
3. create current address observations and claim only eligible global IPv4 keys;
4. resolve provider-tuple, one-active-token, and claim uniqueness conflicts deterministically;
5. set token `BOUND`, set `localServerId`, set `boundAt`, and clear `expiresAt`;
6. upsert the first snapshot only if its ordering/skew rules pass;
7. update `lastUsedAt`.

A failure before commit leaves no partial enrollment.

### 9.5 Bound address and snapshot updates

A bound push performs no provider discovery. It resolves only `token.localServerId`, then in one transaction:

1. apply future-skew and snapshot-ordering rules;
2. retire agent observations absent from the new payload;
3. insert/update current agent observations;
4. for an agent-only server, release old IPv4 claims before attempting current ones;
5. on a new-claim conflict, keep the new row as non-claim metadata with `claimConflictAt`, do not rebind, and continue the metrics upsert;
6. for a provider-backed server, keep claims owned by current provider observations; agent observations never compete for the same claim;
7. update snapshot and `receivedAt` only for an accepted sample.

Duplicate/out-of-order samples do not modify observations or snapshot receive time. Any `capturedAt <= stored.capturedAt` is ignored without exception; decreasing uptime never overrides ordering. A request over five minutes in the future is rejected.

On a successful complete provider refresh that marks a bound-agent server provider-missing, the same transaction transfers the effective enrollment claim from provider observation to the agent’s current global IPv4 before retiring provider observations. If no current agent IPv4 exists, the last provider claim remains as a conservative hold with an owner-resolution marker. On conflict, no claim is released. Credential deletion/detach uses the same transfer-before-clear sequence and aborts fully on conflict.

Provider reappearance is the atomic reverse transition:

1. Lock the `LocalServer` and all its current claim rows.
2. If provider and active-agent observations have the same IPv4, remove claim status from the agent row and assign it to the provider row within the same transaction.
3. If the provider returns a different IPv4, claim the new provider address and retain the agent’s still-reported old global IPv4 claim; both claims belong to the same `LocalServer` and remain individually unique in the workspace.
4. Clear `providerMissingAt` only after all claim changes succeed.
5. If any new provider claim conflicts with another local server, roll back the entire reconciliation: keep `providerMissingAt` and all previous claims unchanged, surface `ADDRESS_CONFLICT`, and permit no enrollment against an intermediate gap.

## 10. Provider reconciliation and Servers read model

`src/lib/services/servers.ts` becomes the composition boundary for:

- live provider inventory;
- persisted local identities;
- latest snapshots;
- agent/token state.

It must not let agent records call provider power methods.

The read model is a discriminated union. `localServerId` is the sole UI identity; remote IDs are transport coordinates only:

```ts
interface ServerMetricsDto {
  state: "not_configured" | "waiting" | "live" | "stale" | "revoked";
  receivedAt: string | null;
  cpuUsagePercent: number | null;
  load1: number | null;
  load5: number | null;
  load15: number | null;
  memoryTotalBytes: string | null;
  memoryAvailableBytes: string | null;
  swapTotalBytes: string | null;
  swapFreeBytes: string | null;
  filesystemTotalBytes: string | null;
  filesystemAvailableBytes: string | null;
  uptimeSeconds: string | null;
}

interface ProviderServerDto {
  localServerId: string;
  origin: "provider";
  providerCredentialId: string;
  providerId: string; // current transport alias for providerCredentialId
  remoteServerId: string;
  providerAvailability:
    | "present"
    | "unavailable"
    | "missing";
  powerActionsAvailable: boolean;
  metrics: ServerMetricsDto;
  // existing provider/configuration fields remain
}

interface AgentOnlyServerDto {
  localServerId: string;
  origin: "agent";
  providerCredentialId: null;
  providerId: null;
  remoteServerId: null;
  providerAvailability: "not_applicable";
  powerActionsAvailable: false;
  metrics: ServerMetricsDto;
  // provider-neutral name, hostname, addresses, and unmanaged status
}

type ServerDto = ProviderServerDto | AgentOnlyServerDto;
```

BigInt values are serialized as decimal strings.

React card keys, `cardErrors`, polling maps, action comparisons, focus targets, and update reducers must use `localServerId`. `GET /api/servers/[providerId]/[id]` must return the same composed provider discriminant, including its latest metrics, rather than replacing it with the raw provider DTO after power polling. The power route preserves current authorization: authenticate the active workspace, resolve `providerId` only among that workspace’s credentials, confirm the remote server is present in the live provider result, then invoke the provider. It must not authorize from `localServerId`, local tuple, token, address, or snapshot.

### UI state rules

Per-server metrics state is derived in this exact precedence; provider availability is orthogonal and never rewrites it:

1. If a non-revoked `BOUND` token exists:
   - no snapshot → `waiting`;
   - snapshot age `< 180 seconds` by server `receivedAt` → `live`;
   - snapshot age `>= 180 seconds` → `stale`.
2. Otherwise, if any token for the local/provider server was revoked → `revoked`.
3. Otherwise → `not_configured`.

An `UNBOUND` token belongs to the active workspace enrollment page/dialog and has no `localServerId`; it never creates or changes a server card and never produces per-server `waiting`. First enrollment binds the token and writes the first snapshot in one transaction, so its first server-card state is `live`. Per-server `waiting` is reserved for an existing local server with a server-side pre-bound `BOUND` token and no snapshot, including a replacement/reinstallation flow. An old revoked token never overrides a newer active token. A retained snapshot under `revoked` may be displayed as last-known data, but the state remains `revoked`, not `stale`.

| Metrics state | Required card rows and behavior |
|---|---|
| `not_configured` | “Monitoring not connected”; no metric values; owner sees setup action, member does not. |
| `waiting` | “Waiting for agent”; a pre-bound token is active but no snapshot exists; no fabricated metric values and no unbound-token expiry is shown; owner may revoke/reissue, member sees status only. The raw secret remains available only in its one-time creation result. |
| `live` | CPU usage, memory used/total, root disk available/total, load 1/5/15, uptime, and localized last-update row; semantic live badge. |
| `stale` | Same last-known rows plus localized stale badge and exact last receive time; values are visibly historical. |
| `revoked` | Revoked badge, last receive time and optional last-known values read-only; owner sees reconnect action, no token secret is recoverable. |

`tests/unit/ui/servers-view.test.tsx` owns named cases `enrollment:unbound-workspace-token-is-page-level-only`, `metrics:not-configured`, `metrics:waiting-bound-no-snapshot`, `metrics:live-179s`, `metrics:stale-180s`, `metrics:revoked-with-last-snapshot`, and `metrics:active-token-precedes-revoked-history`. The enrollment case asserts that the page/dialog may show the unbound token while no corresponding server card or per-server `waiting` state exists. `e2e/server-metrics.spec.ts` owns `metrics state transitions waiting → live → stale → revoked` with controlled server time.

The following provider/agent table is intentionally non-exhaustive: it illustrates composition only. The exact metrics-state precedence above applies unchanged to every provider-present and agent-only combination; provider availability and power behavior are derived independently.

| Provider state | Agent state | UI | Power |
|---|---|---|---|
| present | live | Provider card + live metrics | Existing actions |
| present | stale | Provider card + stale notice | Existing actions |
| present | waiting/not configured | Configuration + setup state | Existing actions |
| unavailable | any | Provider unavailable badge + available local metrics | Disabled/hidden |
| missing | any | Provider missing badge + retained local metrics | Hidden |
| not applicable | live/stale | Agent-only badge + metrics | Hidden |

The current configuration rows remain configuration values. Live metrics are displayed in a separately labeled section so allocated RAM/disk is never presented as actual usage.

## 11. Agent design

### 11.1 Files

```text
metrics-agent/
  Dockerfile
  collector.py
  compose.yml
  README.md
  tests/
    fixtures/
      proc/
    test_collector.py
    test_payload.py
```

Python uses only the standard library:

- `pathlib`;
- `os`;
- `time`;
- `json`;
- `socket`;
- `ssl`;
- `urllib.request`;
- `urllib.error`;
- `ipaddress`;
- `unittest`.

### 11.2 Environment

```text
METRICS_ENDPOINT       required; HTTPS by default
METRICS_TOKEN          required
SERVER_IPS             required; comma-separated IP literals
METRICS_INTERVAL       optional; default 60
METRICS_TIMEOUT        optional bound-push timeout; default 10
METRICS_ENROLL_TIMEOUT optional first-enrollment timeout; default 60
HOST_PROC              internal/default /host/proc
HOST_ROOT_PROBE        internal/default /host/rootfs-probe
RUN_ONCE               test/smoke only; default false
```

Normal logs may include timestamp, HTTP status class, and error category. They must not include the bearer token, authorization header, or full JSON payload.

### 11.3 Collection

- CPU: delta between two `/host/proc/stat` samples approximately one second apart;
- memory/swap: `/host/proc/meminfo`;
- load: `/host/proc/loadavg`;
- uptime: `/host/proc/uptime`;
- filesystem: `os.statvfs("/host/rootfs-probe")`; the empty host probe directory must reside on the host root filesystem;
- hostname: `/host/proc/sys/kernel/hostname`, with `socket.gethostname()` only as a documented fallback;
- IPs: explicit `SERVER_IPS`.

### 11.4 Compose security baseline

```yaml
services:
  metrics-agent:
    image: ghcr.io/biggora/inspoter-metrics-agent:${AGENT_TAG}
    restart: unless-stopped
    read_only: true
    cap_drop:
      - ALL
    security_opt:
      - no-new-privileges:true
    tmpfs:
      - /tmp:size=8m,noexec,nosuid,nodev
    volumes:
      - /proc/stat:/host/proc/stat:ro
      - /proc/meminfo:/host/proc/meminfo:ro
      - /proc/loadavg:/host/proc/loadavg:ro
      - /proc/uptime:/host/proc/uptime:ro
      - /proc/sys/kernel/hostname:/host/proc/sys/kernel/hostname:ro
      - /var/lib/inspoter-metrics-agent/rootfs-probe:/host/rootfs-probe:ro
    environment:
      METRICS_ENDPOINT: ${METRICS_ENDPOINT}
      METRICS_TOKEN: ${METRICS_TOKEN}
      SERVER_IPS: ${SERVER_IPS}
      METRICS_INTERVAL: ${METRICS_INTERVAL:-60}
```

Installation creates the empty probe with `install -d -m 0555 /var/lib/inspoter-metrics-agent/rootfs-probe`. The disposable Linux tracer must prove its `statvfs` totals equal a host `/` probe before this design passes. Whole `/proc` and `/` mounts are not part of v1; they may be reconsidered only if that spike fails and the user explicitly accepts the broader read exposure.

The agent starts with the 60-second enrollment timeout. It switches its in-process mode to the 10-second normal timeout after **any authenticated 2xx response whose JSON contains `tokenState: "BOUND"`**, not only after `201 AGENT_ENROLLED`. If the first 201 response is lost after server commit, the next request still uses 60 seconds; the already-bound route returns a 200 bound-state success, and the agent then switches to 10 seconds. Container restart safely begins in 60-second mode again and converges on the first bound-state success. The server-side read-only provider discovery budget is 45 seconds. A timeout or client disconnect before the final transaction produces no enrollment write, and the next fresh sample retries safely.

## 12. GitHub Actions and release design

### Existing workflow

Do not repurpose or rename:

```text
.github/workflows/release-image.yml
```

### New workflows

```text
.github/workflows/metrics-agent-ci.yml
.github/workflows/release-metrics-agent.yml
```

Release workflow:

- trigger: published GitHub Release;
- checkout exact release tag;
- permissions: `contents: read`, `packages: write`;
- set up QEMU with `docker/setup-qemu-action` pinned to a reviewed full 40-hex commit SHA; tags such as `@v3` and placeholder SHAs are forbidden in the committed workflow;
- Slice 3 resolves the maintained release tag to its immutable commit with `git ls-remote`, records tag/SHA evidence, and reviews that upstream commit before insertion rather than inventing a hash in this plan;
- set up Buildx after QEMU;
- context: `./metrics-agent`;
- Dockerfile: `./metrics-agent/Dockerfile`;
- platforms: `linux/amd64,linux/arm64` for v1;
- image: `ghcr.io/${{ github.repository }}-metrics-agent`;
- raw release tag;
- `latest` only when `prerelease == false`;
- pinned action SHAs consistent with the existing release workflow.

Normal implementation verification must not push to GHCR. CI starts a job-local disposable `registry:2`, builds and pushes the multi-platform test image only to `localhost`, then uses `docker buildx imagetools inspect` to assert one manifest index containing both `linux/amd64` and `linux/arm64`. The registry container/network are removed in an `if: always()` cleanup step. Publication to GHCR is validated only after an explicitly authorized real release.

## 13. Exact affected paths

### Documentation and contracts

```text
specs/metrics-script.md
docs/prd.md
docs/design.md
docs/architecture.md
docs/plan.md
docs/test-plan.md
specs/openapi.json
scripts/check-public-openapi.mjs
.env.example
package.json
pnpm-lock.yaml
docker-compose.yml
docker-compose.prod.yml
docker-compose.test.yml
```

### Database

```text
prisma/schema.prisma
prisma/migrations/<timestamp>_add_local_servers_and_metrics/migration.sql
src/generated/prisma/**                    # generated, not hand-edited
```

### Backend

```text
src/lib/validation/server-metrics.ts
src/lib/services/serverMetrics.ts
src/lib/server-metrics/ratelimit.ts
src/lib/config/env.ts
src/lib/services/servers.ts
src/lib/services/credentials.ts
src/lib/services/workspaces.ts
src/lib/providers/servers/types.ts
src/lib/providers/servers/hetzner.ts
src/lib/providers/servers/mock.ts
src/proxy.ts
src/app/api/server-metrics/route.ts
src/app/api/server-metrics/tokens/route.ts
src/app/api/server-metrics/tokens/[id]/route.ts
src/app/api/server-metrics/tokens/[id]/rotate/route.ts
src/app/api/servers/[providerId]/[id]/route.ts
src/app/api/servers/[providerId]/[id]/power/route.ts
src/app/api/servers/route.ts
src/app/api/credentials/[id]/route.ts
src/app/api/workspaces/[id]/route.ts
src/lib/api/errors.ts
scripts/test-env.mjs
```

### Frontend

```text
src/components/servers/api.ts
src/components/servers/servers-view.tsx
src/components/servers/metrics-agent-dialog.tsx
src/components/servers/server-metrics.tsx
src/messages/en/servers.json
src/messages/ru/servers.json
```

### Agent and workflows

```text
metrics-agent/**
.github/workflows/metrics-agent-ci.yml
.github/workflows/release-metrics-agent.yml
```

### Tests

```text
tests/unit/validation/server-metrics.test.ts
tests/unit/services/serverMetrics.test.ts
tests/unit/services/servers.test.ts
tests/unit/api/server-metrics.test.ts
tests/unit/providers/hetzner-cloud.test.ts
tests/unit/openapi/public-openapi.test.ts
tests/unit/proxy.test.ts
tests/unit/server-metrics/ratelimit.test.ts
tests/unit/config/env.test.ts
tests/unit/api/server-metrics-deletion.test.ts
tests/unit/services/credentials.test.ts
tests/unit/services/workspaces.test.ts
tests/unit/integration/workspace-isolation.test.ts
tests/unit/integration/server-metrics-migration.test.ts
tests/unit/ui/servers-view.test.tsx
tests/unit/workflows/metrics-agent-workflows.test.ts
tests/unit/integration/server-metrics-enrollment.test.ts
e2e/server-metrics.spec.ts
scripts/server-metrics-container-smoke.mjs
metrics-agent/tests/**
metrics-agent/tests/test_transport.py
```

Integration cases live at `tests/unit/integration/server-metrics-enrollment.test.ts`, matching the repository’s existing `tests/unit/integration/**` convention; no test-runner configuration weakening is permitted.

**IP parser dependency decision:** add `ipaddr.js` as a direct runtime dependency in `package.json` and update `pnpm-lock.yaml` with the repository’s pinned pnpm version. `src/lib/validation/server-metrics.ts` imports it directly for IPv4/IPv6 parsing, canonicalization, and range classification. Regex-only validation and reliance on an undeclared transitive dependency are forbidden. If the selected package version lacks bundled TypeScript declarations, add the matching `@types/ipaddr.js` dev dependency in the same lockfile change; do not use a handwritten broad cast.

## 14. Decomposition alternatives

### Alternative A — Provider-first overlay

Keep provider inventory transient and join snapshots to provider responses by IP on each page load.

Rejected because:

- agent-only servers cannot exist reliably;
- provider outage removes the identity needed to display metrics;
- IP reuse can silently move snapshots;
- power authorization becomes coupled to an untrusted discovery value;
- it contradicts the new persisted-inventory requirement.

### Alternative B — Local identity first with vertical tracer

Persist a minimal local server identity, reconcile live providers to stable remote IDs, and use IP only for initial enrollment.

Selected because:

- provider and agent-only servers share one safe read model;
- provider outage does not destroy identity;
- bound-token identity is stable;
- IP reuse cannot rebind an existing token;
- the first slice can prove the entire enrollment path.

### Alternative C — Agent self-declares provider/server identifiers

Allow the payload to contain workspace, credential, or Hetzner server ID.

Rejected because it crosses the authorization boundary and permits cross-workspace or wrong-server attachment when a token or payload is misconfigured.

## 15. Vertical implementation slices

### Slice 0 — Documentation amendment and enrollment tracer

**Goal:** prove:

```text
workspace enrollment token
→ agent POST with SERVER_IPS
→ provider inventory match
→ LocalServer create/link
→ snapshot
→ GET /api/servers readback
```

**Tasks:**

1. Amend PRD with proposed `FR-SRV-003` and map `AC-MET-*`.
2. Amend Design with live/stale/waiting/agent-only/provider-missing states and setup flow.
3. Amend Architecture with the persisted inventory exception and `ADR-MET-001`.
4. Amend `docs/plan.md` and `docs/test-plan.md`.
5. Freeze payload and error contracts.
6. Add the four models, compound `ProviderCredential` relation, raw CHECK/partial-unique indexes, and forward migration.
7. Add strict address/payload validation.
8. Add token hash/authentication service sufficient for a seeded enrollment token.
9. Add full Hetzner pagination and IPv4-only provider matching; store agent IPv6 as metadata only.
10. Add workspace-local credential/remote projection, read-only discovery, matching, one final transaction, address-claim lifecycle, snapshot ordering/skew protection, and upsert.
11. Replace direct `deleteCredential()` and `deleteWorkspace()` database deletes with the ordered Restrict/detach/cleanup transactions; keep `src/app/api/credentials/[id]/route.ts` and `src/app/api/workspaces/[id]/route.ts` service-only.
12. Add provider-missing and atomic provider-reappearance claim transitions, including same-IP transfer, different-IP dual current claims, and rollback-on-conflict.
13. Add minimal latest-snapshot merge in `GET /api/servers` without changing power authorization.
14. Add `collector.py` `RUN_ONCE` mode.
15. Run one built container against a disposable app/database and read the resulting snapshot back.
16. Test 0, 1, and more-than-1 matches plus provider outage.

**Dependencies:** approved documentation amendments; PostgreSQL 16 test database.

**Gate:**

- migration applies cleanly from current schema and executed PostgreSQL malformed-row tests reject every documented invalid CHECK/index case;
- `prisma validate` passes;
- validation/service/contract tests pass;
- container tracer creates or attaches exactly one server;
- provider outage writes zero enrollment state;
- provider-backed tracer proves the local tuple came from server-side active-workspace credential inventory, while spoofed/foreign tuple values cannot enter through payload or cross-workspace relations;
- ambiguous result, failed pagination page, deadline, and disconnect write zero enrollment state;
- database rejects malformed provider tuples, cross-workspace credentials, blank remote IDs, a second active token, and duplicate current claims;
- credential deletion with an active agent detaches safely; without one it deletes the local metrics graph; workspace deletion leaves zero LocalServer/Address/Token/Snapshot rows and does not fail on credential `Restrict`;
- provider reappearance transitions claims atomically for same/different IP and rolls back fully on conflict;
- no UI work begins until this gate passes.

### Slice 1 — Token lifecycle and hardened agent

**Goal:** deliver an operable owner-controlled agent installation lifecycle.

**Resolved defaults before this slice:** owner-only mutation authority; unbound expiry 15 minutes; expiry cleared on binding; one active bound token.

**Tasks:**

1. Owner-only token list/create/rotate/revoke routes.
2. Dedicated token per VPS with one-time raw secret display.
3. Fixed 15-minute unbound expiry, one-active-bound-token constraint, and atomic rotation.
4. Trusted pre-bound replacement token for reinstall.
5. Bound-token ingestion without provider calls.
6. Request size limit plus `src/lib/server-metrics/ratelimit.ts` fixed window: 12/token/60 seconds, validated env/defaults, Compose/test-env wiring, 429 body, and dynamic `Retry-After`.
7. Exact `src/proxy.ts` exemption for `/api/server-metrics` only, with management routes still protected.
8. Full Python collector loop, 60/10-second timeout budgets, bound-state success mode switch, lost-201 recovery, and error handling.
9. Non-root Dockerfile and narrow-mount Compose.
10. Agent unit tests and container security/root-probe inspection.
11. Public OpenAPI operation, checker, and `public-openapi.test.ts` update.

**Gate:**

- raw secret never persists;
- foreign-workspace management returns non-disclosing 404/403 per project convention;
- revoked and expired tokens return 401;
- rebinding by changed IP is impossible;
- container runs as non-root with no capabilities or ports;
- HTTPS is required by default;
- OpenAPI lint and contract checks pass.
- no-cookie public POST reaches bearer authentication while token-management requests remain session-protected.
- per-token isolation, thirteenth-request 429, exact `Retry-After`, window reset, and zero-write rejection tests pass;
- lost 201 followed by a bound 200 switches the agent from 60-second to 10-second timeout without duplicate enrollment.

### Slice 2 — Provider reconciliation and Servers UI

**Goal:** display provider-managed, provider-missing, provider-unavailable, and agent-only servers with latest metrics while preserving power behavior.

**Tasks:**

1. Reconcile provider inventory into `LocalServer`.
2. Mark missing only after a successful complete provider listing.
3. Extend the discriminated server DTO and composed list/single-server APIs.
4. Add metric formatting and freshness state.
5. Implement the §10 precedence and exact rows/actions for `not_configured`, `waiting`, `live`, `stale`, and `revoked`.
6. Add agent enrollment/replacement/revoke dialog.
7. Preserve current action confirmation, polling, card errors, focus, and toasts.
8. Disable or omit actions for every unmanaged/unconfirmed state.
9. Add EN/RU messages and accessibility behavior.
10. Add UI and end-to-end tests at supported viewports.

**Gate:**

- agent-only server appears without power controls;
- provider-present server retains current power tests;
- stale/provider-unavailable/provider-missing are distinct;
- workspace switch cannot leak server, token, address, or snapshot data;
- keyboard and screen-reader assertions pass;
- current Servers tests remain green.
- duplicate remote IDs under different credentials retain separate local cards and polling never drops metrics.
- every metrics state and precedence edge has its named unit case, and the waiting→live→stale→revoked e2e passes.

### Slice 3 — CI, release readiness, rollout documentation

**Goal:** make the agent independently buildable and releasable without changing the app package.

**Tasks:**

1. Add path-scoped agent CI workflow.
2. Add separate release workflow.
3. Resolve and review the QEMU action release to a full immutable SHA; commit only the SHA-pinned `docker/setup-qemu-action` step.
4. Build `linux/amd64` and `linux/arm64` into a disposable job-local registry and inspect the manifest index.
5. Verify Compose parsing and image user/security metadata.
6. Document install, token rotation, upgrade, removal, and troubleshooting.
7. Record external release gates.

**Gate:**

- app workflow diff is empty or documentation-only if an unavoidable comment is approved;
- both images resolve to distinct names;
- tag generation matches the existing release behavior;
- QEMU and every third-party action use reviewed full commit SHAs;
- inspected local manifest contains exactly the required amd64 and arm64 platforms;
- local build and smoke pass;
- no image is published during implementation verification.

## 16. Dependency graph

```text
Slice 0 docs/ADR freeze
        ↓
Slice 0 schema + tracer
        ↓
Slice 1 token lifecycle + agent
        ↓
Slice 2 reconciliation + UI
        ↓
Slice 3 CI/release readiness
        ↓
External staging rollout
        ↓
External production release
```

Workspace-local credential/remote tuple fixtures, full pagination, and IPv4 normalization must complete before Slice 0 enrollment matching. Token authority/expiry and IPv4-only matching are resolved defaults. Package visibility gates the real release only.

## 17. Test matrix

| Layer | Cases |
|---|---|
| Python unit | `/proc/stat` delta; `meminfo`; load; uptime; `statvfs`; malformed fixtures; IPv4/IPv6 parsing; invalid `SERVER_IPS`; payload JSON |
| TS validation | strict schema; unknown fields; numeric bounds; available ≤ total; IPv4 canonicalization; IPv6 metadata-only; private/link-local classification; max IP count/body; future skew |
| Token service | hash-only persistence; 15-minute unbound expiry; expiry clear on bind; one active bound partial unique; atomic revoke/rotation; one-time display; workspace isolation |
| Enrollment | zero provider matches; one match; multiple matches; multiple reported IPv4s mapping to different servers; full multi-page inventory; failed later page; provider outage/deadline/disconnect; no configured provider; concurrent same-IP enrollments; zero-write failure assertions |
| Identity | workspace-local credential/remote projection; malformed/cross-workspace credential DB constraints; bound-token IP change; dual-source observation; atomic claim retirement; provider-missing provider→agent claim transfer; same-IP agent→provider reverse transfer; different-IP provider+agent claims on one LocalServer; reappearance rollback-on-conflict; credential-detach transfer/abort-on-conflict; IP reuse; agent-only replacement token; same upstream visible in two workspaces remains fully isolated |
| Deletion | `deleteCredential()` active-agent detach; inactive local graph delete; conflict rollback; `deleteWorkspace()` ordered local graph cleanup; zero residual LocalServer/Address/Token/Snapshot rows; routes call services only |
| Snapshot | first insert; later upsert; exactly one row; receivedAt freshness; duplicate/out-of-order ignored even when uptime decreases; future rejected; invalid request preserves prior snapshot |
| Provider merge | successful reconciliation; incomplete/failing inventory; missing marker only after success; no upstream deletion |
| API | 200/201/400/401/409/413/422/429/503; no-store headers; no payload authority fields |
| Tenant security | foreign token management; foreign local server; foreign credential; identical public/private remote server visibility in two workspaces; zero cross-workspace joins; local metrics tuple cannot enable or select power actions |
| UI | composite local identity; equal remote IDs across credentials; composed power poll retains metrics; live/waiting/stale; provider unavailable/missing; agent-only; metric formatting; no power for unmanaged; existing power actions |
| Accessibility | accessible names; keyboard dialog; focus restoration; non-color-only states; live-region announcement where appropriate |
| Container | non-root user; read-only root; no capabilities; no exposed ports; five proc-file mounts only; root-probe totals equal host `/`; `RUN_ONCE` push; 60/10-second budgets |
| Contract | exact proxy exemption; protected management prefix; OpenAPI lint; checked-in operation/path/security scheme; public OpenAPI unit test/checker; route-source existence |
| Regression | `pnpm lint`; `pnpm typecheck`; `pnpm test`; `pnpm build`; existing Servers tests |
| Release | metadata tags for stable/prerelease; distinct package; build without push |

### 17.1 Complete AC ownership and named-test traceability

Every AC appears exactly once in this table. `docs/test-plan.md` must reproduce these ownership rows with final PASS evidence; splitting a named group into more individual tests does not change AC ownership.

| AC IDs | Owning slice | Exact test path and required named case/group |
|---|---|---|
| AC-MET-001..004 | Slice 0 | `metrics-agent/tests/test_collector.py`: `collector: complete host payload`, `collector: cpu delta bounds`, `collector: favail`, `collector: host paths not overlay`; the Slice 0 tracer executes the real collector through `RUN_ONCE` before snapshot readback |
| AC-MET-005 | Slice 0 | `metrics-agent/tests/test_payload.py::test_validates_ip_literals`; `tests/unit/validation/server-metrics.test.ts`: `addresses: strict parser and canonicalization` |
| AC-MET-006..008 | Slice 0 | `tests/unit/validation/server-metrics.test.ts`: `addresses: IPv4 match eligibility`, `addresses: metadata-only ranges`, `addresses: reject invalid and forbidden` |
| AC-MET-009 | Slice 0 | `metrics-agent/tests/test_payload.py::test_invalid_server_ips_fails_before_http`; `tests/unit/validation/server-metrics.test.ts`: `addresses: reject invalid and forbidden` |
| AC-MET-010..011 | Slice 1 | `tests/unit/services/serverMetrics.test.ts`: `token: raw once and hash only` |
| AC-MET-012 | Slice 0 | `tests/unit/api/server-metrics.test.ts`: `authority: reject payload workspace/server/provider identity fields` |
| AC-MET-013..014 | Slice 1 | `tests/unit/api/server-metrics.test.ts`: `auth: invalid expired revoked`, `auth: bound token cannot rebind` |
| AC-MET-015..020 | Slice 0 | `tests/unit/integration/server-metrics-enrollment.test.ts`: `enrollment: one match`, `enrollment: zero match creates agent-only`, `enrollment: ambiguous zero writes`, `enrollment: provider outage zero writes`, `enrollment: concurrent claim`, `enrollment: atomic first snapshot` |
| AC-MET-021..027 | Slice 0 | `tests/unit/integration/server-metrics-enrollment.test.ts`: `identity: bound token fixed`, `identity: changed IP no rebind`, `identity: workspace tuple not display/IP`, `identity: missing retained`, `identity: missing claim excluded`, `identity: reappearance`, `identity: trusted replacement` |
| AC-MET-028..030 | Slice 0 | `tests/unit/services/serverMetrics.test.ts`: `snapshot: insert then single-row upsert`, `snapshot: server receivedAt` |
| AC-MET-031..033 | Slice 1 | `tests/unit/api/server-metrics.test.ts`: `limits: 16KiB and invalid preserve snapshot`; `tests/unit/server-metrics/ratelimit.test.ts`: `rate: per-token 12 per 60s Retry-After and reset`; `tests/unit/config/env.test.ts`: `metrics rate env defaults and positive bounds` |
| AC-MET-034..041 | Slice 2 | `tests/unit/ui/servers-view.test.tsx`: `servers: workspace provider and agent-only`, all `metrics:*` state cases from §10, `power: existing confirmations preserved`, `a11y: status and keyboard`; `e2e/server-metrics.spec.ts`: `metrics state transitions waiting → live → stale → revoked` |
| AC-MET-042..047 | Slice 1 | `metrics-agent/tests/test_collector.py`: `container paths`; `metrics-agent/tests/test_transport.py`: `transport: TLS default, redact, next-fresh retry`, `transport: lost 201 then bound 200 switches 60s to 10s`; `scripts/server-metrics-container-smoke.mjs`: `container: non-root readonly no-cap no-port narrow-mount` |
| AC-MET-048..053 | Slice 3 | `tests/unit/workflows/metrics-agent-workflows.test.ts`: `workflow: app workflow unchanged`, `workflow: agent context/package/tags`, `workflow: stable vs prerelease latest`, `workflow: local-only CI no GHCR push`, `workflow: external publication gate` |
| AC-MET-054 | Slice 0 | `tests/unit/providers/hetzner-cloud.test.ts`: `pagination: follows next_page beyond page one`, `pagination: later-page failure fail closed`, `pagination: 100-page guard` |
| AC-MET-055 | Slice 1 | `tests/unit/proxy.test.ts`: `proxy: exact public metrics path`, `proxy: metrics management and child paths protected` |
| AC-MET-056 | Slice 1 | `tests/unit/services/serverMetrics.test.ts`: `token: one active bound and atomic rotation`; `tests/unit/integration/server-metrics-migration.test.ts`: `token CHECK: malformed states rejected` |
| AC-MET-057..058 | Slice 0 | `tests/unit/services/serverMetrics.test.ts`: `ordering: duplicate and older ignored including lower uptime`, `ordering: future over five minutes rejected` |
| AC-MET-059 | Slice 2 | `tests/unit/ui/servers-view.test.tsx`: `identity: localServerId keys cards errors pollers`; `tests/unit/api/server-metrics.test.ts`: `poll: composed DTO retains metrics across equal remote IDs` |
| AC-MET-060 | Slice 1 | `scripts/server-metrics-container-smoke.mjs`: `mounts: narrow proc and root-probe statvfs equivalence` |
| AC-MET-061 | Slice 0 | `tests/unit/integration/workspace-isolation.test.ts`: `metrics tuple: cross-workspace credential rejected`, `metrics tuple: same upstream isolated and no power leakage`; `tests/unit/integration/server-metrics-enrollment.test.ts`: `claims: missing/reappearance/detach atomic transitions` |
| AC-MET-062 | Slice 0 | `tests/unit/integration/server-metrics-enrollment.test.ts`: `zero-write: pagination ambiguity outage deadline disconnect` |
| AC-MET-063 | Slice 0 | `tests/unit/services/credentials.test.ts`: `deleteCredential: detach active or delete inactive graph, conflict rollback`; `tests/unit/services/workspaces.test.ts`: `deleteWorkspace: ordered metrics cleanup`; `tests/unit/api/server-metrics-deletion.test.ts`: `delete routes: service-only invocation` |

Minimum verification commands:

```powershell
pnpm exec prisma validate
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm openapi:check
python -m unittest discover -s metrics-agent/tests -v
docker build --tag inspoter-metrics-agent:test ./metrics-agent
docker run --detach --name metrics-agent-test-registry --publish 127.0.0.1:5000:5000 registry:2
docker buildx build --platform linux/amd64,linux/arm64 --push --tag localhost:5000/inspoter-metrics-agent:test ./metrics-agent
docker buildx imagetools inspect localhost:5000/inspoter-metrics-agent:test
docker rm --force metrics-agent-test-registry
docker image inspect inspoter-metrics-agent:test
docker compose -f metrics-agent/compose.yml config
```

Database and container integration must use disposable resources and report:

- UTC timestamp;
- Git SHA;
- command;
- exit code;
- raw stdout/stderr;
- created container/network/volume names;
- cleanup result.

## 18. Rollout

### Phase R0 — Source-only

- all slices pass;
- no image push;
- no production token;
- no production VPS changes.

### Phase R1 — Disposable staging

1. Deploy an isolated test dashboard/database.
2. Create one enrollment token.
3. Run agent against a disposable Linux VM.
4. Verify match/create, snapshot, stale transition, revoke, reinstall, and cleanup.
5. Test provider outage with a controlled invalid/unreachable fixture, never a production secret.
6. Delete disposable token, server rows, database, containers, and volumes.

### Phase R2 — One production canary

Requires explicit authorization:

1. publish the release image;
2. select one non-critical VPS;
3. create a dedicated token;
4. deploy with pinned tag, not `latest`;
5. verify three consecutive 60-second updates;
6. verify no token/payload leakage in app, reverse-proxy, Docker, or Actions logs;
7. verify current power action behavior separately.

### Phase R3 — Gradual rollout

Roll out in small batches. Stop if:

- any ambiguous match occurs;
- any cross-server attachment is suspected;
- provider inventory becomes unstable;
- database writes grow beyond one snapshot per local server;
- the agent causes host load or disk-access concerns.

## 19. Rollback

### Agent rollback

- revoke its token;
- stop/remove only the `metrics-agent` container;
- remove its Compose file and environment file;
- leave the application and provider server untouched.

### UI/application rollback

- deploy the previous pinned app image;
- new tables may remain inert;
- do not drop tables in the same emergency rollback.

### Migration rollback

The forward migration is additive. Destructive down-migration is not an automatic rollback.

Before any later schema removal:

1. prove no current app version uses the tables;
2. export affected rows if preservation is required;
3. revoke all agent tokens;
4. deploy code with no references;
5. perform a separately reviewed cleanup migration.

Provider resources are never deleted during rollback.

## 20. Risks

| ID | Risk | Mitigation |
|---|---|---|
| RISK-MET-001 | IP reuse attaches a new agent to an old identity | IP only during unbound enrollment; provider-current requirement; pre-bound replacement for agent-only reinstall |
| RISK-MET-002 | Multiple addresses point to different servers | Candidate-set cardinality check; 409; no first-match behavior |
| RISK-MET-003 | Provider outage causes false agent-only creation | Unbound enrollment fails closed |
| RISK-MET-004 | Concurrent enrollment creates duplicates | Locked final transaction, workspace-local tuple uniqueness, one-active-token and current-claim partial unique indexes, conflict re-read |
| RISK-MET-005 | Host mounts expose more data than required | Bind only five required proc files and an empty root-filesystem probe directory; whole-root fallback requires a new explicit user decision |
| RISK-MET-006 | Bearer token theft | HTTPS, random 256-bit secret, hash-only DB, one-time display, revoke/rotate, log redaction |
| RISK-MET-007 | App replicas weaken in-memory rate limit | Accepted v1 single-process boundary; DB upsert still bounded to one snapshot |
| RISK-MET-008 | Hetzner IPv6 `/64` does not identify an agent host literal | IPv4-only v1 auto-match; agent IPv6 is metadata-only |
| RISK-MET-009 | Persisted server inventory conflicts with current architecture | Mandatory PRD/Architecture/ADR amendment before schema work |
| RISK-MET-010 | Existing app CI listens to `master` while live branch is `main` | Record as pre-existing conflict; do not silently rewrite app CI in this feature |
| RISK-MET-011 | Private GHCR package prevents VPS pull | Resolve package visibility/auth before production release |
| RISK-MET-012 | Agent clock skew | Freshness based only on server `receivedAt` |
| RISK-MET-013 | Provider discovery outlives agent timeout | 45-second server deadline, 60-second enrollment timeout, zero writes before final commit, safe retry tests |
| RISK-MET-014 | Same upstream VPS is exposed through credentials in two workspaces | Accepted v1 residual because no stable Hetzner Project/account ID exists; projections remain workspace-local and cannot authorize power; isolation tests cover data and mutation paths |

## 21. Conflicts and required dispositions

### CONFLICT-MET-001 — No persisted Server model

`docs/architecture.md` historically treats provider server DTOs as non-persisted. The new user requirement needs agent-created and provider-missing server identity.

**Disposition:** Slice 0 PRD/Architecture amendment explicitly approves the minimal `LocalServer` exception. Do not hide it as a mere snapshot table.

### CONFLICT-MET-002 — “Do not persist provider snapshots”

The architecture target says provider snapshots should not be persisted.

**Disposition:** persist stable workspace-local identity and presence metadata only. A provider-backed local row references the same-workspace `ProviderCredential` plus remote server ID. It does not claim global upstream ownership and cannot authorize power. Do not persist full provider payloads or historical provider snapshots. Document this narrow exception in `ADR-MET-001`.

### CONFLICT-MET-003 — Public API contract currently covers webhooks only

`POST /api/server-metrics` is a public machine endpoint.

**Disposition:** update `specs/openapi.json` and `scripts/check-public-openapi.mjs` in the same slice.

### CONFLICT-MET-004 — Existing CI branch mismatch

Current `.github/workflows/ci.yml` pushes on `master`, while the inspected branch is `main`.

**Disposition:** do not fold an unrelated CI correction into agent implementation without explicit approval. The new agent CI may target `pull_request` and the confirmed mainline after repository-owner decision.

### CONFLICT-MET-005 — Existing Server DTO labels capacity as CPU/RAM/Disk

Those values are provider configuration, not usage.

**Disposition:** retain them as configuration summary and render host metrics in a separate labeled block.

### CONFLICT-MET-006 — `ProviderResourceBinding` lacks a valid Hetzner account identity

The schema and architecture define `ProviderResourceBinding` around a stable global `accountKey`, but Data Identity analysis found no source-grounded stable Hetzner Project/account ID. Current Servers code operates from active-workspace credentials and remote server IDs.

**Disposition:** do not invent `accountKey` and do not reuse bindings for metrics v1. `ADR-MET-001` explicitly limits the credential/remote tuple to workspace-local metrics composition. Existing authenticated workspace provider flow continues to authorize power. Tests with the same remote VPS visible in two workspaces prove that neither local projection leaks metrics nor confers cross-workspace power.

## 22. Open-question ledger

| ID | Question | Proposed default | Trigger | Blocks |
|---|---|---|---|---|
| OQ-MET-001 | Who may create, rotate, or revoke agent tokens? | **Resolved v0.3:** workspace owners only | Reopen only by explicit product amendment | None |
| OQ-MET-002 | Enrollment token lifetime? | **Resolved v0.3:** 15 minutes unbound; clear expiry atomically on binding | Reopen only by explicit product amendment | None |
| OQ-MET-003 | Is the GHCR agent package public? | Public package; otherwise document `docker login ghcr.io` with a read-only package token | Before real release | Production rollout |
| OQ-MET-004 | Is `linux/amd64` sufficient? | **Resolved v0.3:** no unverified assumption; build amd64 + arm64 | Reopen only with verified fleet inventory | None |
| OQ-MET-005 | Root filesystem only or named additional mounts? | Root `/` only in v1 | Reopen only on explicit user request | None |
| OQ-MET-006 | Where should token management UI live? | **Resolved v0.3 default:** contextual setup/replacement dialog on Servers page; no new Settings section | Reopen before Slice 2 only on explicit UX decision | None |
| OQ-MET-007 | Exact Hetzner IPv6 response normalization | **Resolved v0.3:** IPv6 metadata-only; no v1 provider auto-match | CIDR matching requires a future model/ADR | None |

The former Hetzner account-identity OQ is resolved and removed by `ADR-MET-001`: no `accountKey` is invented, metrics use a non-authoritative workspace-local projection, and existing power authorization is preserved. OQ-MET-003 remains an external release gate.

## 23. Per-slice Definition of Done

A slice is `DONE` only when:

1. every assigned AC has a named passing test;
2. tenant isolation is tested;
3. unexpected failures remain visible as `BASELINE_FAIL`, `BLOCKED`, or `UNVERIFIED`;
4. lint, typecheck, unit tests, and relevant integration/container tests pass;
5. no unrelated source is modified;
6. no token, payload, provider secret, or production IP is present in output/artifacts;
7. raw command evidence, SHA, UTC time, exit code, and cleanup result are retained;
8. document changes required by P-RULE-5 ship in the same slice;
9. code review confirms services/Auth DAL remain the Prisma boundary;
10. no production push or deployment is claimed from source-only evidence.

## 24. Final Definition of Done

The feature is complete only when:

- Slice 0–3 gates pass;
- all AC-MET-001..063 are traced and passing;
- the real container-to-dashboard tracer passes in disposable infrastructure;
- 0/1/>1 match and provider-outage cases pass;
- concurrency produces no duplicate active global claim;
- IP change and IP reuse cannot rebind a token;
- agent-only entries never expose power actions;
- existing provider power-action tests remain green;
- exactly one snapshot exists per local server;
- EN/RU and accessibility tests pass;
- app and agent images remain distinct;
- production publication and deployment are reported separately as external gates;
- provider-backed metrics composition passes two-workspace/same-upstream isolation tests and never alters the existing power authorization boundary;
- all blocking conflicts and OQs are resolved or explicitly excluded by the user.
