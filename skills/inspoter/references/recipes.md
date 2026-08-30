# Worked workflows

Patterns that come up repeatedly. They are written as MCP tool sequences; the REST
equivalents are in `rest-api.md`. The point of each is the _order_ — which read hands the ids
to which write — not the exact arguments.

## Infrastructure status in one pass

Scopes: `servers:read`, `services:read`, `alerts:read`, `logs:read`.

```
services_list  { "status": "DOWN" }        → what is failing right now
servers_list   {}                          → each entry carries `metrics`
alerts_search  { "sort": "desc", "pageSize": 20 }
logs_search    { "level": "error", "pageSize": 20 }
```

Reading the results:

- `metrics.state` is `not_configured` when no agent reports for that host and `stale` past
  three minutes. Neither is a failure — say "no agent reporting", not "server down".
- A `DOWN` service is worth one `service_checks { id }` call to see whether it just flapped
  or has been down for hours, and what error the checker recorded.
- Correlate by time, not by name: a `DOWN` check, a metrics spike and an error log inside the
  same window are usually one incident.

## Triaging the alert backlog

Scopes: `alerts:read`, `alerts:write`.

```
alerts_search        { "categoryId": "none", "pageSize": 50 }
alert_categories_list {}
alert_category_create { "name": "Availability" }     # get-or-create, safe to re-run
alerts_set_category   { "id": "...", "categoryId": "...", "confidence": 0.9 }
```

Reuse an existing category before inventing one — `alert_category_create` matches names
case-insensitively, so `availability` and `Availability` collapse into one. The assignment is
stored as `MODEL` with your `confidence`, shown in the UI as model-assigned, and an operator
can override it. Pass `categoryId: null` to undo an assignment you got wrong.

## Turning a message into a kanban card

Scopes: `mail:read` (or `alerts:read`), `kanban:read`, `kanban:write`.

```
mail_search            { "query": "renewal", "unreadOnly": true }
mail_get               { "id": "..." }                  # confirm before acting
kanban_boards_list     {}                               # pick board + column id
kanban_link_targets_list {}                             # optional: the record it concerns
kanban_card_create     { "columnId": "...", "title": "...", "priority": "HIGH",
                         "dueDate": "2026-09-01T00:00:00.000Z",
                         "linkedType": "SERVICE", "linkedId": "...", "linkedLabel": "..." }
kanban_checklist_add   { "cardId": "...", "text": "..." }
```

`linkedType` and `linkedId` travel together, and `linkedLabel` snapshots the target's name so
the chip survives a rename. Labels go on afterwards with `kanban_card_labels_set`, which
**replaces** the whole set.

Finishing a card is `kanban_card_move` into the column whose `isDone` is true — that
completes the card and fires the `KANBAN_CARD_COMPLETED` webhook, so do it only when the work
is genuinely done.

## Drafting a reply instead of sending one

Scopes: `mail:read`, `mail:write`.

```
mail_accounts_list  {}                                  # pick one with kind: IMAP
mail_get            { "id": "..." }
mail_draft_save     { "accountId": "...", "to": ["..."], "subject": "Re: ...",
                      "bodyText": "...", "inReplyToId": "<original id>" }
```

Prefer a draft. `mail_send` is irreversible and rate-limited on top of the normal budget —
send only when the user asked for the mail to go out, and quote the recipients and subject
back to them first. The `WEBHOOK` account cannot send or sync at all.

To send a draft later: `mail_send { "draftId": "..." }`.

## Keeping an inbox tidy with a rule

Scopes: `mail:read`, `mail:write`.

```
mail_labels_list        {}                       # or mail_label_create
mail_folders_list       { "accountId": "..." }   # if the rule should also move
mail_filter_rule_create { "accountId": "...", "labelId": "...", "name": "Provider notices",
                          "matchMode": "ANY",
                          "conditions": [
                            { "field": "FROM_DOMAIN", "operator": "CONTAINS",
                              "value": "hetzner.com", "isNegated": false }
                          ],
                          "applyToExistingMail": true }
mail_filter_run_get     { "id": "<run id from the create response>" }
```

`applyToExistingMail` starts a background backfill — poll `mail_filter_run_get` rather than
assuming it finished. A run that failed can be re-queued with `mail_filter_run_retry`; a
pending, running or finished one is refused.

## Wiring an external system into a channel

Scopes: `messages:read`, `messages:write`.

```
message_categories_list {}
message_category_create { "name": "Infrastructure" }        # get-or-create
message_channel_create  { "categoryId": "...", "name": "backups" }
channel_webhook_create  { "channelId": "...", "name": "Restic cron" }
```

The create response contains a URL with the secret in it, returned **once**. Give it to the
operator or paste it into the target system's configuration — never write it into a log, a
commit, a summary, or a later message. `channel_webhooks_list` afterwards shows only the
prefix. Revoke with `channel_webhook_revoke`.

Because both create tools are get-or-create with case-insensitive matching, the whole
sequence is safe to re-run; only the webhook is minted fresh each time.

Posting into a channel is `message_send { channelId, content, author? }`. It lands with
`origin: AGENT`, is labelled "Agent" in the feed, and cannot be edited or deleted afterwards.

## Rolling out a monitor

Scopes: `services:read`, `services:write`.

```
service_labels_list {}
service_create      { "name": "API", "monitorType": "HTTP", "url": "https://api.example.com/health",
                      "expectedStatusCodes": "200-299", "intervalSeconds": 60,
                      "timeoutMs": 5000, "retries": 3, "labelIds": ["..."] }
service_check_now   { "id": "..." }     # optional, the first check runs on create anyway
service_checks      { "id": "..." }     # confirm it actually passes
```

Target fields follow the type: HTTP → `url`, TCP → `host` + `port`, PING → `host`. Sending the
wrong combination comes back as a readable argument error, not a crash.

Pause with `service_set_active { id, isActive: false }` — the scheduler skips it, but
`service_check_now` still works. `service_delete` takes the whole check history with it and
cannot be undone; confirm with the user first.

## Cleaning up the address book

Scopes: `contacts:read`, `contacts:write`.

```
contacts_duplicates {}                       # groups sharing an email, phone or name
contacts_get        { "contactId": "<the one to keep>" }
contacts_merge      { "primaryId": "...", "otherIds": ["...", "..."] }
```

The primary's own values win and anything the others knew is appended; the others are
deleted. This cannot be undone — show the user the group before merging.

For edits, remember `contacts_update` writes `fields`, `addresses` and `labelIds`
**wholesale**. Read with `contacts_get`, modify the array you got back, and send the whole
thing. Adding one phone number by sending only that number wipes the rest.

Bulk labelling is `contacts_bulk` with `{type:"addLabel",labelId}` over up to 1000 ids; ids
outside the workspace are ignored, and the answer counts what was actually touched.

## Importing a structured contact catalogue safely

Scope: `contacts:write` (add `contacts:read` when resolving existing labels first).

Use this path when the source is already structured JSON. Do not convert it to CSV/vCard and
call `contacts_import`: file import applies its duplicate strategy to matching emails, phones,
and names, and file formats cannot carry Inspoter `labelIds`.

```
contact_labels_list   {}                         # resolve every label id first
contacts_create_many  { "idempotencyKey": "retailers-2026-08-30-v1",
                        "contacts": [ ...up to 500 contact shapes... ] }
contact_photo_set     { "contactId": "<returned id>",
                        "contentType": "image/png",
                        "dataBase64": "<standard base64>" }
```

One `contacts_create_many` call can create a 416-row catalogue. It is atomic, performs no
duplicate matching, and therefore preserves separate shops that share an owner's phone or
email. One unknown `labelId` rejects the whole call before any contact is created.

Treat the idempotency key as progress state: derive or assign one stable key per exact source
batch, persist it with the source checksum, and save the ordered returned ids. If the response
is lost, retry the same payload with the same key; it returns the same ids. Reusing that key
with changed normalized input is a conflict. Do not generate a fresh key for a retry.

Photos remain a second pass because they target created ids. Store each source row's returned
id before calling `contact_photo_set`; retrying that tool with the same bytes is safe. On REST,
use `POST /api/v1/contacts/bulk` with the key in `Idempotency-Key`, then multipart photo
uploads. A `429` on either surface still means honour `Retry-After`.

## When something answers 401/403/404

- `401` — the token is missing, revoked, channel-scoped, or has **no** MCP scopes at all
  (every token issued before the agent surface existed is in that last state). Only the
  operator can fix it, in Settings → API tokens.
- `403` — the token authenticated but lacks the one scope this route needs; the message names
  it. Ask for that scope rather than reaching for another route.
- `404` — the id does not exist _in this token's workspace_. A foreign-workspace id is
  deliberately indistinguishable from a missing one, so re-list rather than retrying.
- `429` — honour `Retry-After`; the budget is shared with the webhook ingest endpoints.
- On MCP, `isError: true` with a readable message is the normal way a domain error arrives.
  Read it and fix the arguments; retrying identically will fail identically.
