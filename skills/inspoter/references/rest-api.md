# Agent REST API (`/api/v1/**`)

Same capabilities as the MCP tools, over plain HTTP, for clients and scripts that cannot
speak MCP. Same bearer token, same scopes, workspace taken from the token. Session cookies
and `X-Inspoter-Workspace` play no part.

This catalogue contains **71 paths and 110 operations**. It intentionally covers only the
public bearer API. The dashboard's session-only APIs are separate:

- `/api/agents/**` — Agents, Skills, schedules, runs and conversations;
- `/api/calendar/**` — calendar events, reminders and occurrences;
- `/api/management/**` — executive snapshots, briefs and human decisions.

Those routes require an authenticated application session and `X-Inspoter-Workspace`; an
`INSPOTER_TOKEN` cannot call them. Management's `management_snapshot_get` and
`management_brief_publish` are private Agent Runtime tools, not MCP tools.

The full OpenAPI 3.1 contract ships with the app: **Settings → API documentation**
(`/settings/api-docs`), sourced from `specs/openapi.json` in the repo. Consult it when you
need an exact response schema; the tables here are the working index.

```bash
curl -H "Authorization: Bearer $INSPOTER_TOKEN" \
  "$INSPOTER_URL/api/v1/services?status=DOWN"

curl -X POST "$INSPOTER_URL/api/v1/kanban/cards" \
  -H "Authorization: Bearer $INSPOTER_TOKEN" -H "Content-Type: application/json" \
  -d '{"columnId":"<column id>","title":"Check backups","priority":"HIGH"}'

curl -X PATCH "$INSPOTER_URL/api/v1/mail/<mail id>" \
  -H "Authorization: Bearer $INSPOTER_TOKEN" -H "Content-Type: application/json" \
  -d '{"isRead":true}'
```

## Conventions

- JSON in, JSON out; `Content-Type: application/json` on every request with a body.
- Creates answer `201`, everything else `200`. An idempotent contact-create replay answers
  `200` with the original result. Responses are `Cache-Control: no-store`.
- Errors: `{ "error": { "code", "message" } }`; `400` carries an extra `issues` array
  pointing at the offending field.
- Scope is checked per route and per method: `GET` needs `<domain>:read`, mutations need
  `<domain>:write`. A `403` names the missing scope in its message.
- Rate limiting is shared with the webhook endpoints (default 120 req/60 s per token); `429`
  carries `Retry-After`.
- **Writes here are journalled** to the workspace Activity feed under the token's name. MCP
  tool calls are not — this is the one behavioural difference between the surfaces.

## Not available over REST

`alerts:*`, `servers:read` and `logs:read` have **no** `/api/v1` family. Alert search and
categorization, server inventory and metrics, and log search are MCP-only. There is no
workaround; use `/api/mcp` for those.

Also absent by design, exactly as in MCP: deleting a kanban board or column, a bookmark
category, a message category or channel, or a mail account.

---

## Mail — `mail:read` / `mail:write`

| Method         | Path                                               | Query / body                                                                                                                                          |
| -------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET            | `/api/v1/mail`                                     | query: `query`, `from`, `accountId`, `folderId`, `labelId`, **`unread`**, `sort`, `cursor`, `pageSize`                                                |
| GET            | `/api/v1/mail/accounts`                            | —                                                                                                                                                     |
| GET            | `/api/v1/mail/accounts/{accountId}/folders`        | —                                                                                                                                                     |
| POST           | `/api/v1/mail/accounts/{accountId}/sync`           | —                                                                                                                                                     |
| GET            | `/api/v1/mail/{mailId}`                            | —                                                                                                                                                     |
| PATCH          | `/api/v1/mail/{mailId}`                            | body: `isRead`                                                                                                                                        |
| DELETE         | `/api/v1/mail/{mailId}`                            | —                                                                                                                                                     |
| POST           | `/api/v1/mail/{mailId}/move`                       | body: `targetFolderId`                                                                                                                                |
| PUT / DELETE   | `/api/v1/mail/{mailId}/labels/{labelId}`           | assign / remove                                                                                                                                       |
| GET            | `/api/v1/mail/{mailId}/attachments/{attachmentId}` | —                                                                                                                                                     |
| POST           | `/api/v1/mail/drafts`                              | body: `draftId`, `accountId`, `to`, `cc`, `bcc`, `subject`, `bodyText`, `bodyHtml`, `inReplyToId`, `forwardOfId`                                      |
| POST           | `/api/v1/mail/send`                                | same body as drafts                                                                                                                                   |
| GET / POST     | `/api/v1/mail/labels`                              | body: `name`, `color`                                                                                                                                 |
| PATCH / DELETE | `/api/v1/mail/labels/{labelId}`                    | body: `name`, `color`, `position`                                                                                                                     |
| GET            | `/api/v1/mail/filter-rules`                        | query: `accountId` (required)                                                                                                                         |
| POST           | `/api/v1/mail/filter-rules`                        | body: `accountId`, `labelId`, `name`, `matchMode`, `conditions`, `fromAddress`, `subjectContains`, `setRead`, `moveToFolderId`, `applyToExistingMail` |
| PATCH / DELETE | `/api/v1/mail/filter-rules/{ruleId}`               | body adds `isActive`, `position`                                                                                                                      |
| GET            | `/api/v1/mail/filter-runs/{runId}`                 | —                                                                                                                                                     |
| POST           | `/api/v1/mail/filter-runs/{runId}/retry`           | —                                                                                                                                                     |

Note the search flag is `unread` here and `unreadOnly` in MCP. `502 UPSTREAM_FAILED` on
send/move/delete/sync means the mail server refused and nothing changed locally.

## Kanban — `kanban:read` / `kanban:write`

| Method               | Path                                      | Query / body                                                                                                                               |
| -------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| GET / POST           | `/api/v1/kanban/boards`                   | body: `name`                                                                                                                               |
| PATCH                | `/api/v1/kanban/boards/reorder`           | body: `order`                                                                                                                              |
| GET / PATCH          | `/api/v1/kanban/boards/{boardId}`         | body: `name`                                                                                                                               |
| POST                 | `/api/v1/kanban/columns`                  | body: `boardId`, `name`, `color`, `wipLimit`, `isDone`                                                                                     |
| PATCH                | `/api/v1/kanban/columns/reorder`          | body: `boardId`, `order`                                                                                                                   |
| PATCH                | `/api/v1/kanban/columns/{columnId}`       | body: `name`, `color`, `wipLimit`, `isDone`                                                                                                |
| GET                  | `/api/v1/kanban/cards`                    | query: `query`, `boardId`, `columnId`, `openOnly`, `limit`                                                                                 |
| POST                 | `/api/v1/kanban/cards`                    | body: `columnId`, `title`, `description`, `priority`, `dueDate`, `assigneeOperatorId`, `labelIds`, `linkedType`, `linkedId`, `linkedLabel` |
| PATCH                | `/api/v1/kanban/cards/move`               | body: `boardId`, `columns` — 1–2 entries of `{columnId, cardIds[]}`                                                                        |
| GET / PATCH / DELETE | `/api/v1/kanban/cards/{cardId}`           |                                                                                                                                            |
| GET / POST           | `/api/v1/kanban/cards/{cardId}/checklist` | body: `text`                                                                                                                               |
| GET / POST           | `/api/v1/kanban/cards/{cardId}/comments`  | body: `body`                                                                                                                               |
| PUT                  | `/api/v1/kanban/cards/{cardId}/labels`    | body: `labelIds` (replaces the set)                                                                                                        |
| PATCH / DELETE       | `/api/v1/kanban/checklist/{itemId}`       | body: `text`, `isDone`                                                                                                                     |
| DELETE               | `/api/v1/kanban/comments/{commentId}`     | only comments this token wrote                                                                                                             |
| GET / POST           | `/api/v1/kanban/labels`                   | body: `name`, `color`                                                                                                                      |
| PATCH / DELETE       | `/api/v1/kanban/labels/{labelId}`         | body: `name`, `color`                                                                                                                      |
| GET                  | `/api/v1/kanban/link-targets`             | —                                                                                                                                          |

`PATCH /kanban/cards/move` is the one place REST is _more_ capable than MCP: you send the
post-move card order of the source and destination columns (one entry for a reorder inside a
single column, two for a move between them), so position is under your control. MCP's
`kanban_card_move` takes `{cardId, columnId}` and appends to the end. Both raise
`KANBAN_CARD_COMPLETED` when a card lands in an `isDone` column.

## Contacts — `contacts:read` / `contacts:write`

| Method               | Path                                 | Query / body                                                                                     |
| -------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------ |
| GET                  | `/api/v1/contacts`                   | query: `query`, `labelId`, `starred`, `page`, `pageSize`                                         |
| POST                 | `/api/v1/contacts`                   | contact body (see below); optional `Idempotency-Key` header                                       |
| GET / PATCH / DELETE | `/api/v1/contacts/{contactId}`       | contact body                                                                                     |
| GET / POST / DELETE  | `/api/v1/contacts/{contactId}/photo` | POST is **multipart**, field `photo`                                                             |
| POST                 | `/api/v1/contacts/bulk`              | required `Idempotency-Key`; body: `{ "contacts": [contact body, ...] }` (1–500)                  |
| PATCH                | `/api/v1/contacts/bulk`              | body: `contactIds`, `action`                                                                     |
| GET                  | `/api/v1/contacts/duplicates`        | —                                                                                                |
| POST                 | `/api/v1/contacts/merge`             | body: `primaryId`, `otherIds`                                                                    |
| GET                  | `/api/v1/contacts/suggest`           | query: `query` (required), `limit`                                                               |
| GET                  | `/api/v1/contacts/export`            | query: `format` (required), `contactId` (repeatable), `labelId`, `query`, `starred`              |
| POST                 | `/api/v1/contacts/import`            | **multipart**, fields `file`, `format`, `duplicateStrategy`                                      |
| GET / POST           | `/api/v1/contacts/labels`            | body: `name`, `color`                                                                            |
| PATCH / DELETE       | `/api/v1/contacts/labels/{labelId}`  | body: `name`, `color`                                                                            |

The REST contact body accepts four fields MCP does not model: `phoneticFirst`,
`phoneticMiddle`, `phoneticLast`, `fileAs`. Import/export differ too: REST takes a file
upload and repeatable `contactId` query params, MCP takes and returns plain text. A REST
photo upload answers `413` when over the ceiling and `415` on an unsupported type; MCP's
`contact_photo_set` accepts the same JPEG/PNG/GIF/WebP data as standard base64.

Bulk JSON creation is atomic and deliberately does **no** duplicate matching: records that
share an email, phone, or name remain separate. Every `labelId` is validated before a write;
one unknown label rejects the whole batch. A new key returns `201` and ordered
`{ contacts: [{ id }], count, replayed: false }`. Replaying the same normalized payload and
key returns those ids with `200` and `replayed: true`; changing the payload while reusing the
key returns `409`. Persist the key with the source batch rather than generating a new one
after a timeout.

## Services — `services:read` / `services:write`

| Method               | Path                                     | Query / body                                                                                                                                                |
| -------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET                  | `/api/v1/services`                       | query: `query`, `status`, `labelId`                                                                                                                         |
| POST                 | `/api/v1/services`                       | body: `name`, `monitorType`, `description`, `url`, `host`, `port`, `expectedStatusCodes`, `intervalSeconds`, `timeoutMs`, `retries`, `isActive`, `labelIds` |
| GET / PATCH / DELETE | `/api/v1/services/{serviceId}`           | same body                                                                                                                                                   |
| POST                 | `/api/v1/services/{serviceId}/check-now` | —                                                                                                                                                           |
| GET                  | `/api/v1/services/{serviceId}/checks`    | paged history                                                                                                                                               |
| GET / POST           | `/api/v1/services/labels`                | body: `name`, `color`                                                                                                                                       |
| PATCH / DELETE       | `/api/v1/services/labels/{labelId}`      | body: `name`, `color`                                                                                                                                       |

There is no dedicated pause route — `PATCH /services/{id}` with `{"isActive":false}` is what
`service_set_active` does.

## Messages — `messages:read` / `messages:write`

| Method      | Path                                                         | Query / body                                                 |
| ----------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| GET / POST  | `/api/v1/messages/categories`                                | body: `name` — get-or-create (`200` existing, `201` created) |
| PATCH       | `/api/v1/messages/categories/{categoryId}`                   | body: `name`                                                 |
| POST        | `/api/v1/messages/channels`                                  | body: `categoryId`, `name` — get-or-create                   |
| GET / PATCH | `/api/v1/messages/channels/{channelId}`                      | body: `name`                                                 |
| GET / POST  | `/api/v1/messages/channels/{channelId}/messages`             | query: `cursor`, `sort`; body: `content`, `author`           |
| POST        | `/api/v1/messages/channels/{channelId}/read`                 | —                                                            |
| GET / POST  | `/api/v1/messages/channels/{channelId}/webhooks`             | body: `name`; the response URL carries the secret, once      |
| DELETE      | `/api/v1/messages/channels/{channelId}/webhooks/{webhookId}` | —                                                            |

## Bookmarks — `bookmarks:read` / `bookmarks:write`

| Method               | Path                                        | Query / body                                                      |
| -------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| GET                  | `/api/v1/bookmarks`                         | query: `query`, `categoryId`, `limit`                             |
| POST                 | `/api/v1/bookmarks`                         | body: `name`, `url`, `categoryId`, `icon`, `color`, `description` |
| GET / PATCH / DELETE | `/api/v1/bookmarks/{bookmarkId}`            | same body                                                         |
| PATCH                | `/api/v1/bookmarks/reorder`                 | body: `categories`                                                |
| GET / POST           | `/api/v1/bookmarks/categories`              | body: `name`, `parentCategoryId`                                  |
| PATCH                | `/api/v1/bookmarks/categories/reorder`      | body: `order`                                                     |
| PATCH                | `/api/v1/bookmarks/categories/{categoryId}` | body: `name`, `parentCategoryId`                                  |
| GET                  | `/api/v1/bookmarks/favicon-suggest`         | query: `url` (required)                                           |

---

## Neighbouring token endpoints (not `/api/v1`)

Same token, different purpose — worth knowing so they are not confused with the agent API:

- `POST /api/webhooks/{type}` — inbound event ingest (alerts, logs, messages), bearer token.
- `POST /api/webhooks/channels/{webhookId}/{token}` — channel ingest, secret in the URL.
  Discord-compatible variants live under `/api/discord/webhooks/...`.
- `POST /api/server-metrics` — the metrics agent's only endpoint; separate, tighter rate
  limit (12/min per token+IP).
- `GET/POST /api/webhook-tokens`, `PATCH/DELETE /api/webhook-tokens/{id}`,
  `POST /api/webhook-tokens/{id}/rotate` — token management. **Session-authenticated**, so an
  agent token cannot mint or re-scope tokens. That is deliberate.
