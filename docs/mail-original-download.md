# Downloading an original email

After deploying this change, open **Mail**, select an IMAP message, and click
**Download original (.eml)** beside Reply and Forward. Share that file when
diagnosing message encoding; forwarding or copying rendered text changes the
evidence.

The authenticated download uses the account's saved credentials internally and
fetches the original RFC822 bytes from IMAP. It does not reconstruct the email
from Inspoter's stored HTML or expose mailbox credentials. The download itself
opens the mailbox read-only and does not mark the message read. Opening the
message in the normal reading pane retains its existing read-state behavior.

Webhook messages and local drafts do not offer this action. A message must still
exist on the mail server and have a stable synchronized UID. If the mailbox
identity changed, sync the account and reopen the message before retrying.

Downloads use the existing `MAIL_MAX_MESSAGE_BYTES` limit (5 MiB by default).
Larger originals are rejected rather than saved as partial files. No database
migration or new environment variable is required.

The endpoint is `GET /api/mail/{id}/original`, using the existing session and
workspace-header authentication. Successful responses are private, non-cacheable
`message/rfc822` attachments. This adds the browser download action; the separate
API-token REST and MCP surfaces are unchanged.
