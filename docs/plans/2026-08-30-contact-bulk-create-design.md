# Contact bulk creation and idempotency

## Goal

Create up to 500 JSON contacts in one API or MCP call without duplicate loss,
rate-limit pressure, or unsafe label resolution. Let MCP callers upload the
same contact photo types accepted by REST.

## Contract

`POST /api/v1/contacts/bulk` accepts `{ contacts: ContactCreate[] }` and
requires an `Idempotency-Key` header. `contacts_create_many` exposes the same
operation to MCP with required `idempotencyKey` and `contacts` arguments.
Both return the original ordered list of `{ id, displayName }`, the batch size,
and `replayed`. The first REST response is `201`; a replay is `200`.

The existing single-contact endpoint and `contacts_create` accept an optional
idempotency key. Calls without it keep their current behavior for backward
compatibility.

`contact_photo_set` accepts a contact id, an allowed content type, and standard
base64 data. It applies the existing per-photo byte limit. Photo upload remains
a separate operation so a 500-contact JSON batch cannot become an unbounded
binary request.

## Data flow and safety

A new `ContactCreateRequest` row stores workspace id, caller id, idempotency
key, SHA-256 request hash, and the ordered JSON result. Its unique key is
`(workspaceId, callerId, key)`. Caller id is a plain string so both bearer-token
MCP calls and in-app agents can use the contract.

Bulk creation validates every contact and every label before writing. One
database transaction creates all contacts and the request record. A concurrent
request with the same key loses on the unique constraint; its transaction
rolls back, then it reads and returns the winner. Reusing a key with a different
payload returns `409 IDEMPOTENCY_KEY_CONFLICT`.

The service preserves input order and never applies duplicate matching by
email, phone, or display name. It therefore keeps separate retailer records
that share an owner. Existing CSV, LDIF, and vCard import behavior does not
change.

## Verification

Tests must prove that a batch creates all records in order, labels resolve
strictly, a replay creates no rows, a changed payload conflicts, another caller
may reuse the same key, and a concurrent replay leaves one batch. MCP tests
must cover create-many and photo upload. Route tests must cover `201`, `200`,
missing or malformed keys, and `409` conflicts.
