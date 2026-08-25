# MCP tool catalogue

All 118 tools of `POST /api/mcp`, grouped by domain. `tools/list` shows only what the
presenting token's scopes cover, so a tool you cannot see is a scope you were not granted.

Conventions used below: `arg` required, `arg?` optional, `arg[]` an array, `arg|null` accepts
an explicit null. Every tool is workspace-scoped through the token; no tool takes a workspace
id. Read tools are annotated `readOnlyHint: true` to the client; the mutating ones are not.

**Contents**

- [Mail](#mail) — `mail:read` (8), `mail:write` (15)
- [Alerts](#alerts) — `alerts:read` (3), `alerts:write` (2)
- [Logs](#logs) — `logs:read` (1)
- [Servers](#servers) — `servers:read` (2)
- [Services](#services) — `services:read` (4), `services:write` (9)
- [Kanban](#kanban) — `kanban:read` (8), `kanban:write` (19)
- [Contacts](#contacts) — `contacts:read` (6), `contacts:write` (9)
- [Messages](#messages) — `messages:read` (4), `messages:write` (8)
- [Bookmarks](#bookmarks) — `bookmarks:read` (4), `bookmarks:write` (7)
- [Shared value types](#shared-value-types)

---

## Mail

Accounts are created by operators only. `mail_accounts_list` tells you which are usable:
only `kind: IMAP` can send, hold drafts or sync — the system `WEBHOOK` account is
inbound-only and refuses both.

### `mail:read`

| Tool                     | Arguments                                                                                                                        | Notes                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `mail_accounts_list`     | —                                                                                                                                | ids for every other mail tool; check `kind` before sending                                   |
| `mail_folders_list`      | `accountId`                                                                                                                      | folders with unread counts; source of `targetFolderId`                                       |
| `mail_labels_list`       | —                                                                                                                                | workspace mail labels with message counts                                                    |
| `mail_search`            | `query?`, `from?`, `accountId?`, `folderId?`, `labelId?`, `unreadOnly?`, `sort?` (`asc`\|`desc`), `pageSize?` (1–100), `cursor?` | `query` matches subject, sender address and sender name. Metadata only — no body             |
| `mail_get`               | `id`                                                                                                                             | full body plus attachment metadata; bytes not included                                       |
| `mail_attachment_get`    | `id`, `attachmentId`                                                                                                             | `{filename, contentType, contentBase64}`; over the size ceiling it is refused, not truncated |
| `mail_filter_rules_list` | `accountId`                                                                                                                      | rules in evaluation order, each with its last backfill run                                   |
| `mail_filter_run_get`    | `id`                                                                                                                             | backfill progress and failure reason                                                         |

Paging: pass the `nextCursor` from the previous response back as `cursor`.

### `mail:write`

| Tool                      | Arguments                                                                                                                                                | Notes                                                                                                                      |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `mail_draft_save`         | `draftId?`, `accountId`, `to[]`, `cc[]`, `bcc[]`, `subject`, `bodyText`, `bodyHtml`, `inReplyToId?`, `forwardOfId?`                                      | omit `draftId` to create, pass it to overwrite                                                                             |
| `mail_send`               | same fields, plus `draftId?` to send an existing draft                                                                                                   | files a copy in Sent. **Cannot be undone**; extra rate limit applies                                                       |
| `mail_set_read`           | `id`, `isRead`                                                                                                                                           | pushed to the IMAP server too                                                                                              |
| `mail_move`               | `id`, `targetFolderId`                                                                                                                                   | same account only                                                                                                          |
| `mail_delete`             | `id`                                                                                                                                                     | first call moves to Trash; from Trash (or an account without one) it is permanent — the `status` field says which happened |
| `mail_label_assign`       | `id`, `labelId`                                                                                                                                          | idempotent                                                                                                                 |
| `mail_label_remove`       | `id`, `labelId`                                                                                                                                          |                                                                                                                            |
| `mail_label_create`       | `name`, `color`                                                                                                                                          | names unique case-insensitively                                                                                            |
| `mail_label_update`       | `id`, `name?`, `color?`, `position?`                                                                                                                     |                                                                                                                            |
| `mail_label_delete`       | `id`                                                                                                                                                     | refused while a filter rule points at it                                                                                   |
| `mail_filter_rule_create` | `accountId`, `labelId`, `name`, `matchMode?`, `conditions[]?`, `fromAddress?`, `subjectContains?`, `setRead?`, `moveToFolderId?`, `applyToExistingMail?` | give either `conditions` or the simple `fromAddress`/`subjectContains` pair                                                |
| `mail_filter_rule_update` | `id` + any create field, plus `isActive?`, `position?`                                                                                                   | omitted fields keep their value                                                                                            |
| `mail_filter_rule_delete` | `id`                                                                                                                                                     | labels already applied stay put                                                                                            |
| `mail_filter_run_retry`   | `id`                                                                                                                                                     | only a _failed_ run; pending/running/finished are refused                                                                  |
| `mail_sync_start`         | `accountId`                                                                                                                                              | refused while a sync of that account runs                                                                                  |

Filter condition object: `{ field, operator, value, isNegated }` where
`field` ∈ `FROM_ADDRESS | FROM_DOMAIN | RECIPIENT | SUBJECT | BODY | HAS_ATTACHMENT`,
`operator` ∈ `EQUALS | CONTAINS | IS`, `matchMode` ∈ `ALL | ANY`. Max 10 conditions.
`applyToExistingMail: true` starts a background backfill — follow it with
`mail_filter_run_get`.

---

## Alerts

Alerts arrive from webhooks (Alertmanager, Zabbix, UptimeRobot…) and often carry no
category. This pair of scopes exists so an assistant can file the backlog.

| Scope | Tool                    | Arguments                                                                     | Notes                                                                                                                |
| ----- | ----------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| read  | `alerts_search`         | `query?`, `categoryId?`, `severity?`, `sort?`, `pageSize?` (1–100), `cursor?` | `query` matches the message; `categoryId: "none"` returns the uncategorized ones                                     |
| read  | `alerts_get`            | `id`                                                                          | one alert with its category                                                                                          |
| read  | `alert_categories_list` | —                                                                             | valid `categoryId` values                                                                                            |
| write | `alerts_set_category`   | `id`, `categoryId\|null`, `confidence?` (0–1)                                 | recorded as `MODEL` and shown in the UI as model-assigned; never overwrites the `MANUAL` provenance an operator sets |
| write | `alert_category_create` | `name`                                                                        | get-or-create, case-insensitive                                                                                      |

---

## Logs

| Scope | Tool          | Arguments                                                                                                 |
| ----- | ------------- | --------------------------------------------------------------------------------------------------------- |
| read  | `logs_search` | `query?`, `level?` (`debug`\|`info`\|`warn`\|`error`), `source?`, `sort?`, `pageSize?` (1–100), `cursor?` |

Unexpected MCP tool failures are themselves written here with source `mcp` — useful when a
tool answered "failed unexpectedly, recorded in the workspace logs".

---

## Notes

An Obsidian-style vault. A note title is unique per workspace — it is how a `[[wiki link]]`
resolves — so `notes_create` fails on a collision rather than silently making a second one.

| Scope | Tool                 | Arguments                                                   | Notes                                                        |
| ----- | -------------------- | ----------------------------------------------------------- | ------------------------------------------------------------ |
| read  | `notes_search`       | `query?`, `folderId?`, `includeSubfolders?`, `sort?`, `limit?`, `cursor?` | `query` matches the title and the body                       |
| read  | `notes_get`          | `id`                                                         | returns the full markdown body and the `version` to write back |
| read  | `note_folders_list`  | —                                                            | the folder tree, for `folderId`                              |
| write | `notes_create`       | `title`, `content?`, `folderId?`                             | CommonMark, never HTML                                        |
| write | `notes_update`       | `id`, `title?`, `content?`, `version`                        | `version` from `notes_get`; a mismatch means someone else edited first |
| write | `notes_delete`       | `id`                                                         | leaf only — there is no folder delete                        |

---

## Activity

| Scope | Tool              | Arguments                                                                    |
| ----- | ----------------- | ---------------------------------------------------------------------------- |
| read  | `activity_search` | `query?`, `action?`, `entityType?`, `operatorId?`, `sort?`, `pageSize?`, `cursor?` |

The journal is written by the services that perform the actions, so there is no write scope.
"What changed since yesterday" is what this answers.

---

## Domains

Read-only by design: a DNS change goes out through a provider credential and reaches the
public internet, which is the same class of blast radius as a server power action.

| Tool                | Arguments                | Notes                                    |
| ------------------- | ------------------------ | ---------------------------------------- |
| `domains_list`      | —                        | grouped by the provider credential serving them |
| `dns_records_list`  | `providerId`, `domainId` | both ids come from `domains_list`        |

---

## Servers

Read-only by design: there is no `servers:write`, and power actions stay with the operator.

| Tool           | Arguments       | Notes                                                                                                                      |
| -------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `servers_list` | `query?`        | filters by name, hostname, IP, OS or location. Each server carries `metrics` (CPU, load, memory, swap, filesystem, uptime) |
| `server_get`   | `localServerId` | id comes from `servers_list` — agent-only servers have no provider coordinates                                             |

`metrics.state` is `not_configured` when no agent reports for that host, and `stale` when the
last reading is older than three minutes. Empty metrics are a normal state, not an error.

---

## Services

Uptime monitors. Which target fields are required depends on `monitorType`: **HTTP** needs
`url`, **TCP** needs `host` and `port`, **PING** needs `host`. Violating that comes back as a
readable argument error.

### `services:read`

| Tool                  | Arguments                                                 | Notes                                                   |
| --------------------- | --------------------------------------------------------- | ------------------------------------------------------- |
| `services_list`       | `query?`, `status?` (`PENDING`\|`UP`\|`DOWN`), `labelId?` | current status, labels and the last 24 checks           |
| `service_get`         | `id`                                                      | one service with its monitor configuration              |
| `service_checks`      | `id`, `pageSize?` (1–100), `cursor?`                      | status, response time and error per check, newest first |
| `service_labels_list` | —                                                         | ids usable as `labelIds`                                |

### `services:write`

| Tool                   | Arguments                                                                                                                                                                                      | Notes                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `service_create`       | `name`, `monitorType`, `description?`, `url?`, `host?`, `port?`, `expectedStatusCodes?`, `intervalSeconds?` (10–86400), `timeoutMs?` (1000–30000), `retries?` (1–10), `isActive?`, `labelIds?` | first check runs immediately                                                   |
| `service_update`       | `id` + any create field                                                                                                                                                                        | changing target or interval re-checks at once; `labelIds` **replaces** the set |
| `service_set_active`   | `id`, `isActive`                                                                                                                                                                               | short form of `service_update` for pause/resume                                |
| `service_check_now`    | `id`                                                                                                                                                                                           | runs outside the schedule, works on a paused service too                       |
| `service_delete`       | `id`                                                                                                                                                                                           | **takes the check history with it, cannot be undone**                          |
| `service_labels_set`   | `id`, `labelIds[]`                                                                                                                                                                             | replaces the whole set; `[]` clears                                            |
| `service_label_create` | `name`, `color`                                                                                                                                                                                |                                                                                |
| `service_label_update` | `id`, `name?`, `color?`                                                                                                                                                                        |                                                                                |
| `service_label_delete` | `id`                                                                                                                                                                                           | services keep their other labels                                               |

`expectedStatusCodes` is HTTP-only, e.g. `"200-299"` or `"200,301-399"` (default `200-299`).

---

## Kanban

Board and column **deletion is not exposed** — each would take every card, checklist item and
comment inside it. Rename and reorder instead, or send the user to the dashboard.

### `kanban:read`

| Tool                       | Arguments                                                        | Notes                                                                                              |
| -------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `kanban_boards_list`       | —                                                                | boards with their columns (`id`, `name`, `isDone`, `wipLimit`, `cardCount`) — the usual first call |
| `kanban_board_get`         | `boardId`                                                        | every column with the cards it holds, in board order                                               |
| `kanban_cards_search`      | `query?`, `boardId?`, `columnId?`, `openOnly?`, `limit?` (1–500) | searches title, labels and linked record; flat rows across boards                                  |
| `kanban_card_get`          | `id`                                                             | description, checklist counts, comment count                                                       |
| `kanban_labels_list`       | —                                                                | ids usable as `labelIds`                                                                           |
| `kanban_checklist_list`    | `cardId`                                                         | in display order                                                                                   |
| `kanban_comments_list`     | `cardId`                                                         | oldest first                                                                                       |
| `kanban_link_targets_list` | —                                                                | servers, domains, services, alerts and hosting accounts a card can link to                         |

### `kanban:write`

| Tool                      | Arguments                                                                                                                                           | Notes                                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `kanban_board_create`     | `name` (≤60)                                                                                                                                        | empty; add columns before cards                                                                                                     |
| `kanban_board_rename`     | `boardId`, `name`                                                                                                                                   |                                                                                                                                     |
| `kanban_boards_reorder`   | `order[]`                                                                                                                                           | the **full** list of board ids in the new order                                                                                     |
| `kanban_column_create`    | `boardId`, `name` (≤40), `color`, `wipLimit?`, `isDone?`                                                                                            | set `isDone` on the terminal column                                                                                                 |
| `kanban_column_update`    | `columnId`, `name?`, `color?`, `wipLimit?`, `isDone?`                                                                                               |                                                                                                                                     |
| `kanban_columns_reorder`  | `boardId`, `order[]`                                                                                                                                | full list of that board's column ids                                                                                                |
| `kanban_card_create`      | `columnId`, `title` (≤200), `description?`, `priority?`, `dueDate?`, `assigneeOperatorId?`, `labelIds?`, `linkedType?`, `linkedId?`, `linkedLabel?` |                                                                                                                                     |
| `kanban_card_update`      | `id`, `title?`, plus the same optional card fields                                                                                                  | labels go through `kanban_card_labels_set`, the column through `kanban_card_move`                                                   |
| `kanban_card_move`        | `cardId`, `columnId`                                                                                                                                | same board; appends to the end. **Moving into an `isDone` column completes the card and fires the `KANBAN_CARD_COMPLETED` webhook** |
| `kanban_card_delete`      | `id`                                                                                                                                                | takes checklist and comments; cannot be undone                                                                                      |
| `kanban_card_labels_set`  | `cardId`, `labelIds[]`                                                                                                                              | replaces the whole set; `[]` clears                                                                                                 |
| `kanban_checklist_add`    | `cardId`, `text` (≤200)                                                                                                                             | appends                                                                                                                             |
| `kanban_checklist_update` | `itemId`, `text?`, `isDone?`                                                                                                                        |                                                                                                                                     |
| `kanban_checklist_delete` | `itemId`                                                                                                                                            |                                                                                                                                     |
| `kanban_comment_add`      | `cardId`, `body` (≤5000)                                                                                                                            | signed with the token's name                                                                                                        |
| `kanban_comment_delete`   | `commentId`                                                                                                                                         | only comments **this** token wrote; anything else answers `404`                                                                     |
| `kanban_label_create`     | `name`, `color`                                                                                                                                     |                                                                                                                                     |
| `kanban_label_update`     | `id`, `name?`, `color?`                                                                                                                             |                                                                                                                                     |
| `kanban_label_delete`     | `id`                                                                                                                                                | cards keep their other labels                                                                                                       |

`priority` ∈ `LOW | MEDIUM | HIGH | URGENT`. `dueDate` is ISO-8601.
`linkedType` ∈ `SERVER | DOMAIN | SERVICE | ALERT | HOSTING_ACCOUNT` and always travels with
`linkedId`; `linkedLabel` snapshots the target's name so the chip survives a rename.
`assigneeOperatorId` must be a real member of the workspace.

---

## Contacts

### `contacts:read`

| Tool                  | Arguments                                                      | Notes                                                                                |
| --------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `contacts_list`       | `query?`, `labelId?`, `starred?`, `page?`, `pageSize?` (1–200) | `query` matches names, organization, email and phone (with or without formatting)    |
| `contacts_get`        | `contactId`                                                    | every email, phone, address, label and note                                          |
| `contact_labels_list` | —                                                              | ids for `labelIds`                                                                   |
| `contacts_duplicates` | —                                                              | groups sharing an email, phone or display name — feed straight into `contacts_merge` |
| `contacts_suggest`    | `query`, `limit?` (1–50)                                       | recipient lookup: a person's name finds their address                                |
| `contacts_export`     | `format`, `contactIds[]?`, `labelId?`, `query?`, `starred?`    | returns the file's text. Photos only travel in vCard                                 |

`format` ∈ `vcard-3.0 | vcard-4.0 | google-csv | outlook-csv | ldif`.

### `contacts:write`

| Tool                   | Arguments                                  | Notes                                                                                                                                                                                                 |
| ---------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contacts_create`      | contact shape (below)                      | needs at least a name part, an organization, or one `fields` entry                                                                                                                                    |
| `contacts_update`      | `contactId` + contact shape                | **`fields`, `addresses` and `labelIds` are written wholesale** — read with `contacts_get` first and send the full list                                                                                |
| `contacts_delete`      | `contactId`                                | takes everything attached                                                                                                                                                                             |
| `contacts_bulk`        | `contactIds[]` (1–1000), `action`          | `action` is one of `{type:"delete"}`, `{type:"star",starred}`, `{type:"addLabel",labelId}`, `{type:"removeLabel",labelId}`. Foreign ids are ignored, not rejected; the answer counts what was touched |
| `contacts_merge`       | `primaryId`, `otherIds[]` (1–50)           | primary's values win, the rest is appended, the others are deleted. **Cannot be undone**                                                                                                              |
| `contacts_import`      | `content`, `format?`, `duplicateStrategy?` | `content` is the file's _text_; format is auto-detected. Strategy ∈ `skip` (default) \| `update` \| `create`. Caps: 10 000 contacts, 2 MiB per photo                                                  |
| `contact_label_create` | `name` (≤60), `color`                      |                                                                                                                                                                                                       |
| `contact_label_update` | `id`, `name?`, `color?`                    |                                                                                                                                                                                                       |
| `contact_label_delete` | `id`                                       |                                                                                                                                                                                                       |

Contact shape: `prefix`, `firstName`, `middleName`, `lastName`, `suffix`, `nickname`,
`organization`, `jobTitle`, `department`, `birthday` (ISO date, or `--MM-DD` when the year is
unknown), `notes`, `starred`, `fields[]`, `addresses[]`, `labelIds[]` — all optional.

- `fields[]`: `{ kind, label?, value, isPrimary? }`, `kind` ∈
  `EMAIL | PHONE | URL | IM | EVENT | RELATION | CUSTOM`. `label` is free-form
  (`"home"`, `"work"`, `"mobile"`, …).
- `addresses[]`: `{ label?, street?, extended?, poBox?, city?, region?, postalCode?, country? }`.

---

## Messages

The dashboard's chat-like feed. Deleting a category or a channel is not exposed — it would
take the whole message history.

### `messages:read`

| Tool                      | Arguments                                            | Notes                                                                          |
| ------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| `message_categories_list` | —                                                    | tree of categories with their channels; source of `categoryId` and `channelId` |
| `message_channel_get`     | `channelId`                                          | name, category, unread state                                                   |
| `messages_list`           | `channelId`, `sort?`, `pageSize?` (1–100), `cursor?` | newest first by default                                                        |
| `channel_webhooks_list`   | `channelId`                                          | secrets are never returned — only the prefix, last use and revocation          |

### `messages:write`

| Tool                        | Arguments                                  | Notes                                                                                                        |
| --------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `message_category_create`   | `name` (≤120)                              | get-or-create, case-insensitive                                                                              |
| `message_category_rename`   | `id`, `name`                               |                                                                                                              |
| `message_channel_create`    | `categoryId`, `name` (≤120)                | get-or-create within the category                                                                            |
| `message_channel_rename`    | `id`, `name`                               |                                                                                                              |
| `message_send`              | `channelId`, `content` (1–4000), `author?` | stored with `origin: AGENT`, author defaults to the token's name. **Cannot be edited or deleted afterwards** |
| `message_channel_mark_read` | `channelId`                                | read state is per channel and workspace-wide                                                                 |
| `channel_webhook_create`    | `channelId`, `name` (≤80)                  | returns a URL **containing the secret, shown once**. Hand it over; never log it or repeat it later           |
| `channel_webhook_revoke`    | `channelId`, `webhookId`                   | takes effect immediately; posted messages are untouched                                                      |

---

## Bookmarks

Category nesting is capped at one level.

### `bookmarks:read`

| Tool                       | Arguments                                 | Notes                                                                                                                    |
| -------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `bookmarks_search`         | `query?`, `categoryId?`, `limit?` (1–500) | flat results by name, URL or description                                                                                 |
| `bookmarks_get`            | `id`                                      |                                                                                                                          |
| `bookmark_categories_list` | —                                         | categories with their subcategories and counts                                                                           |
| `bookmark_favicon_suggest` | `url`                                     | answers `null` when nothing can be inferred. The bookmark's own host is never contacted — only its hostname is looked up |

### `bookmarks:write`

| Tool                          | Arguments                                                               | Notes                                                                                                |
| ----------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `bookmark_create`             | `name`, `url`, `categoryId`, `description?`, `icon?`, `color?`          | category must exist                                                                                  |
| `bookmark_update`             | `id`, `name?`, `url?`, `categoryId?`, `description?`, `icon?`, `color?` | passing `categoryId` moves it                                                                        |
| `bookmark_delete`             | `id`                                                                    | category left alone                                                                                  |
| `bookmarks_reorder`           | `categories[]` (1–2 entries of `{categoryId, bookmarkIds[]}`)           | every bookmark of a listed category must appear; naming two categories moves a bookmark between them |
| `bookmark_category_create`    | `name`, `parentCategoryId?\|null`                                       | parent must be top-level                                                                             |
| `bookmark_category_rename`    | `id`, `name`, `parentCategoryId?\|null`                                 | `null` promotes to top level, omitting the field leaves the parent alone                             |
| `bookmark_categories_reorder` | `order[]`                                                               | full list of category ids                                                                            |

`icon` is a Remix icon name (`ri-link`) or an icon URL. `color` ∈ `primary | accent | secondary`.

---

## Shared value types

- **Label colours** (mail, kanban, service, contact labels): a preset name —
  `SLATE`, `RED`, `AMBER`, `GREEN`, `BLUE`, `VIOLET` — or a hex value such as `#616367`.
- **Cursors** are opaque: pass back the `nextCursor` from the previous response, never
  construct one.
- **Dates** are ISO-8601 strings on the way in and out.
- **Errors**: a domain error (bad id, wrong account kind, rate limit) returns a normal result
  with `isError: true` and a message meant to be read and acted on. `Invalid arguments — …`
  names the offending field. A generic "failed unexpectedly" means a bug was logged to the
  workspace log; retrying identically will not help.
