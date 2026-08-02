import type { MessageStructureObject } from "imapflow";
import { describe, expect, it } from "vitest";

import { collectAttachments } from "@/lib/mail/attachment-metadata";

describe("collectAttachments", () => {
  it("exposes a root single-part DMARC ZIP as IMAP part 1", () => {
    const structure: MessageStructureObject = {
      type: "application/zip",
      parameters: { name: "google.com!example.com!1!2.zip" },
      disposition: "attachment",
      dispositionParameters: {
        filename: "google.com!example.com!1!2.zip",
      },
      size: 985,
    };

    expect(collectAttachments(structure)).toEqual([
      {
        partId: "1",
        filename: "google.com!example.com!1!2.zip",
        contentType: "application/zip",
        sizeBytes: 985,
        contentId: null,
        isInline: false,
      },
    ]);
  });

  it("keeps normal multipart attachment part numbers", () => {
    const structure: MessageStructureObject = {
      type: "multipart/mixed",
      childNodes: [
        { part: "1", type: "text/plain", size: 20 },
        {
          part: "2",
          type: "application/pdf",
          parameters: { name: "invoice.pdf" },
          size: 4_096,
        },
      ],
    };

    expect(collectAttachments(structure)).toEqual([
      expect.objectContaining({
        partId: "2",
        filename: "invoice.pdf",
        contentType: "application/pdf",
      }),
    ]);
  });

  it("does not treat a root plain-text body as an attachment", () => {
    expect(collectAttachments({ type: "text/plain", size: 20 })).toEqual([]);
  });
});
