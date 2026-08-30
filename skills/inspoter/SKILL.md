---
name: inspoter
description: Drive an Inspoter dashboard workspace from an agent — the public MCP server at POST /api/mcp (120 tools) and the equivalent bearer REST API at /api/v1/** (71 paths, 110 operations), with per-scope permissions. Covers mail, alerts, logs, bookmarks, contacts, messages/channels, kanban, notes, activity, domains, servers and monitored services. Use this skill whenever Inspoter is mentioned, whenever a task means reading or changing something that lives in the dashboard (check what is DOWN, triage alerts, search mail, post to a channel, file a kanban card, look up a contact), whenever a script or an assistant has to be wired to Inspoter, when choosing token scopes, or when debugging a 401/403/404/409/429 from /api/mcp or /api/v1 — even if the user never says "MCP" or "API".
---

# Inspoter agent surface

Inspoter is a self-hosted infrastructure dashboard. The public agent surface is exposed twice,
over the same authorization: **MCP** (`POST /api/mcp`, 120 tools) and **REST**
(`/api/v1/**`, 71 paths and 110 operations). Both are session-cookie-free — the bearer token
is the only authority and it carries the workspace, so `X-Inspoter-Workspace` plays no part.

Read `references/mcp-tools.md` for the tool catalogue with arguments, `references/rest-api.md`
for the HTTP routes, and `references/recipes.md` for worked multi-step workflows.

The dashboard also has session-only APIs for the product UI. They are deliberately outside the
bearer agent surface: `/api/agents/**` (Agents, Skills, schedules, runs and conversations),
`/api/calendar/**`, and `/api/management/**`. They require an authenticated application
session plus `X-Inspoter-Workspace`; an `INSPOTER_TOKEN` does not authorize them. The two
Management runtime tools (`management_snapshot_get` and `management_brief_publish`) are
agent-only runtime tools, not public MCP tools. Use the session APIs through the dashboard or
an explicitly authenticated first-party client; do not claim these capabilities are available
through `/api/mcp` or `/api/v1`.

## Getting a token

The operator issues it in the dashboard: **Settings → API tokens** (`/settings/webhooks`).
The scopes are ticked at creation; the secret is shown once. Scopes can be changed later
without rotating the secret, and rotation preserves scopes.

A token with **no** scopes is an ingest-only webhook/metrics token and gets `401` from
`/api/mcp` — every token issued before the agent surface existed is in that state. Ask the
operator to grant scopes rather than guessing why authentication "fails".

Grant the narrowest set that does the job. Read and write are deliberately separate, so a
token can search mail and never send it.

```
mail:read      mail:write        alerts:read     alerts:write
bookmarks:read bookmarks:write   messages:read   messages:write
contacts:read  contacts:write    kanban:read     kanban:write
notes:read     notes:write       servers:read    services:read
services:write logs:read         activity:read   domains:read
```

Four sections are read-only by design, and the missing write scope is the guarantee:
`servers` (power actions stay with the operator), `domains` (a DNS change reaches the public
internet), `activity` (the journal is written by the actions themselves), and `logs`.

## Connecting

MCP client config (Claude Code/Desktop, Cursor, VS Code). Transport is stateless
Streamable HTTP, so no session handshake is needed:

```json
{
  "mcpServers": {
    "inspoter": {
      "type": "http",
      "url": "https://dashboard.example.com/api/mcp",
      "headers": { "Authorization": "Bearer YOUR_TOKEN" }
    }
  }
}
```

For a client without HTTP transport, wrap it:
`npx mcp-remote https://dashboard.example.com/api/mcp --header "Authorization: Bearer YOUR_TOKEN"`.

`tools/list` advertises only the tools the presenting token has scopes for — a tool that is
missing is a permissions fact, not a bug. `GET` and `DELETE` on `/api/mcp` answer `405`.

For ad-hoc calls from a shell there is a bundled helper that needs no dependencies:

```bash
export INSPOTER_URL=https://dashboard.example.com
export INSPOTER_TOKEN=...            # never echo this back into the transcript
node skills/inspoter/scripts/inspoter.mjs tools
node skills/inspoter/scripts/inspoter.mjs call services_list '{"status":"DOWN"}'
node skills/inspoter/scripts/inspoter.mjs rest GET '/api/v1/services?status=DOWN'
```

## MCP or REST?

They answer the same questions with the same payloads, so pick by what is already in hand:

- **MCP** when the assistant is the client — the schemas are self-describing and the
  workspace is implicit. Prefer it when you have the tools loaded.
- **REST** for scripts, cron jobs, curl, or any client that cannot speak MCP. It is also the
  only option for batch card reordering and importing contacts from a file upload rather
  than from text. Contact photos are available on both surfaces: multipart over REST and
  standard base64 through `contact_photo_set` on MCP.
- **MCP only**: alerts, servers, logs, notes, activity and domains have no `/api/v1` family at
  all. If a task needs `alerts_*`, `servers_*`, `logs_search`, `notes_*`, `activity_search`,
  `domains_list` or `dns_records_list` over plain HTTP, say so — it is not there.

One behavioural difference worth knowing: writes through `/api/v1` are journalled to the
workspace Activity feed under the token's name; MCP tool calls are not.

## Capability map

| Domain    | Scopes                               | MCP tools | REST                   | Notes                                                                                 |
| --------- | ------------------------------------ | --------- | ---------------------- | ------------------------------------------------------------------------------------- |
| Mail      | `mail:read` / `mail:write`           | 23        | `/api/v1/mail/**`      | search, read, labels, folders, attachments (base64), drafts, send, filter rules, sync |
| Kanban    | `kanban:read` / `kanban:write`       | 27        | `/api/v1/kanban/**`    | boards, columns, cards, moves, labels, checklists, comments, link targets             |
| Contacts  | `contacts:read` / `contacts:write`   | 17        | `/api/v1/contacts/**`  | CRUD, JSON bulk create, photos, labels, bulk actions, import/export, duplicates/merge |
| Services  | `services:read` / `services:write`   | 13        | `/api/v1/services/**`  | HTTP/TCP/PING monitors, pause, check-now, check history, labels                       |
| Messages  | `messages:read` / `messages:write`   | 12        | `/api/v1/messages/**`  | categories, channels, feed, post, mark read, channel ingest webhooks                  |
| Bookmarks | `bookmarks:read` / `bookmarks:write` | 11        | `/api/v1/bookmarks/**` | flat search, CRUD, category tree, reorder, favicon suggest                            |
| Alerts    | `alerts:read` / `alerts:write`       | 5         | —                      | search, read, categories, model-attributed categorization                             |
| Servers   | `servers:read`                       | 2         | —                      | inventory with latest CPU/load/memory/swap/disk/uptime                                |
| Logs      | `logs:read`                          | 1         | —                      | workspace log search                                                                  |
| Notes     | `notes:read` / `notes:write`         | 6         | —                      | folder tree, search, CRUD with optimistic versioning                                  |
| Activity  | `activity:read`                      | 1         | —                      | read-only workspace journal                                                           |
| Domains   | `domains:read`                       | 2         | —                      | domains and DNS records; read-only by design                                           |

## How to work against it

**Ids come from list calls, never from guesswork.** Every write takes ids that a read tool
hands out — `mail_accounts_list` before sending, `kanban_boards_list` before creating a card,
`bookmark_categories_list` before adding a bookmark. An id from another workspace is
indistinguishable from a missing one and answers `404` by design.

**Some updates replace rather than merge.** `contacts_update` writes `fields`, `addresses`
and `labelIds` wholesale, and `kanban_card_labels_set` / `service_labels_set` replace the
whole set. Read the record first and send the full list you want it to end up with,
otherwise you will silently drop what you did not repeat.

**Use idempotent JSON creation for contact batches.** `contacts_create_many` creates 1–500
contacts atomically and requires a stable `idempotencyKey`; REST exposes the same operation
as `POST /api/v1/contacts/bulk` with an `Idempotency-Key` header. Persist the key with the
source batch and reuse it after a timeout: the replay returns the original ids. Never reuse
the key for changed input — that is a `409`. This path performs no duplicate matching, so
two shops that share an owner email or phone remain two contacts. Resolve every `labelId`
first because one unknown label rejects the whole batch.

**A few tools are get-or-create.** `alert_category_create`, `message_category_create` and
`message_channel_create` match names case-insensitively and return the existing row, so a
setup script can be re-run without duplicating anything.

**Irreversible things are irreversible.** `mail_send` cannot be recalled; `contacts_merge`,
`service_delete` (takes its check history), `kanban_card_delete` and a second `mail_delete`
from Trash cannot be undone. Confirm with the user before calling these on real data —
`mail_delete` reports in its `status` field whether the message went to Trash or was purged.

**Writes are attributed and visible.** Channel messages land with `origin: AGENT` and are
labelled "Agent" in the feed; the author defaults to the token's name. Kanban comments are
signed with the token name and only the same token can delete them. Alert categories set by
a tool are recorded as `MODEL`, never `MANUAL`, so the operator can see and override them.

**Some writes fire outbound webhooks.** Moving a card into a terminal (`isDone`) column
completes the card and raises `KANBAN_CARD_COMPLETED`, exactly as a drag in the UI does.
Creating a channel webhook returns a URL containing a secret, shown once — hand it over,
never log it or repeat it back later.

## What the agent deliberately cannot do

Missing tools here are decisions, not gaps — do not look for a workaround, route the user to
the dashboard:

- **Cascading deletes**: kanban boards and columns, bookmark categories, message categories
  and channels, mail accounts. Each would take content the agent never saw. Deleting leaves
  (card, checklist item, comment, bookmark, label, message, service, contact) is allowed.
- **Mail credentials**: creating, editing, testing or deleting an IMAP/SMTP account would
  push a password through the assistant's context. Operators do that in `/settings/mail`.
- **Server power**: no start/stop/restart. `servers:read` has no write counterpart.

Also note the `WEBHOOK` mail account is inbound-only: sending or syncing through it is
refused. Use an account whose kind is `IMAP` from `mail_accounts_list`.

## Errors and limits

Both surfaces answer `{ "error": { "code", "message" } }`:

| Status                  | Meaning                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `400 VALIDATION_FAILED` | body or query failed validation; `issues` points at the field     |
| `401 UNAUTHORIZED`      | token missing, revoked, channel-scoped, or carrying no MCP scopes |
| `403 FORBIDDEN`         | token lacks the specific scope the route needs                    |
| `404 NOT_FOUND`         | no such row in this token's workspace                             |
| `409`                   | name conflict, reached limit, or idempotency-key payload conflict |
| `413`                   | uploaded file over the ceiling                                    |
| `429 RATE_LIMITED`      | shared with the webhook endpoints; honour `Retry-After`           |
| `502 UPSTREAM_FAILED`   | the mail server refused; nothing changed locally                  |

Rate limiting is per token, default 120 requests per 60 s (`WEBHOOK_RATE_LIMIT`,
`WEBHOOK_RATE_WINDOW_MS`). `mail_send` has an additional send limit on top
(`MAIL_SEND_RATE_LIMIT`). On MCP, a domain error comes back as a normal result with
`isError: true` and a readable message — read it and correct the arguments rather than
retrying the same call. An unexpected failure answers with a generic message and is written
to the workspace log instead of leaking a stack.

## Reference files

- `references/mcp-tools.md` — all 120 tools grouped by scope, with arguments and gotchas.
  Read the section for the domain you are working in.
- `references/rest-api.md` — the 71 `/api/v1` paths (110 operations) with query/body shapes, plus the places
  REST and MCP differ.
- `references/recipes.md` — multi-step workflows (morning triage, alert categorization,
  mail → kanban, wiring an external system into a channel, monitor rollout).
- `scripts/inspoter.mjs` — dependency-free CLI for `tools/list`, `tools/call` and REST calls.
