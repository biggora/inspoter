import type { MessageStructureObject } from "imapflow";

import type { RemoteAttachment } from "@/lib/mail/types";

function isAttachmentNode(node: MessageStructureObject): boolean {
  const filename =
    node.dispositionParameters?.filename ?? node.parameters?.name;

  return (
    node.disposition === "attachment" ||
    Boolean(filename) ||
    (node.disposition === "inline" &&
      Boolean(node.id) &&
      !node.type.startsWith("text/"))
  );
}

// IMAP BODYSTRUCTURE gives multipart children explicit part numbers, but a
// single-part message's root node has none. BODY[1] addresses that root body,
// so use "1" when an attachment-only message (such as a Google DMARC report)
// arrives as the complete message rather than inside multipart/mixed.
export function collectAttachments(
  root: MessageStructureObject | undefined,
): RemoteAttachment[] {
  const attachments: RemoteAttachment[] = [];

  function visit(node: MessageStructureObject, isRoot: boolean): void {
    const filename =
      node.dispositionParameters?.filename ?? node.parameters?.name;
    const partId =
      node.part ?? (isRoot && !node.childNodes?.length ? "1" : null);

    if (partId && isAttachmentNode(node)) {
      attachments.push({
        partId,
        filename: filename ?? "attachment",
        contentType: node.type,
        sizeBytes: node.size ?? 0,
        contentId: node.id ? node.id.replace(/^<|>$/g, "") : null,
        isInline: node.disposition === "inline",
      });
      return;
    }

    for (const child of node.childNodes ?? []) {
      visit(child, false);
    }
  }

  if (root) visit(root, true);
  return attachments;
}
