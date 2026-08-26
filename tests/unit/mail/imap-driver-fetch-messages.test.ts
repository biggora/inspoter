import net from "node:net";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { ImapSmtpMailDriver } from "@/lib/mail/imap-smtp";
import type { MailConnectionConfig } from "@/lib/mail/types";

// Regression guard for a production outage (mail.cenufiltrs.lv, 2026-08-25):
// every account that had *new* mail stopped syncing with "IMAP fetchMessages
// failed: Connection not available", preceded by an ImapFlow "Socket timeout"
// exactly 120s (the socket inactivity timeout) after the session went quiet.
//
// The cause was a nested IMAP command: the per-message source fetch ran inside
// the `for await (client.fetch(...))` iteration. ImapFlow serialises commands
// on a single request queue and applies backpressure to the outer FETCH until
// the consumer resumes, so the inner command sat in the queue forever and the
// socket went idle — a deadlock, not a network fault.
//
// A mocked ImapFlow cannot catch this: the bug lives in ImapFlow's own command
// queue. So these tests drive the real client against a stub that speaks just
// enough IMAP for fetchMessages().

interface StubMessage {
  seq: number;
  uid: number;
  source: string;
}

function rfc822(uid: number): string {
  return [
    `Message-ID: <msg-${uid}@example.com>`,
    "Date: Mon, 25 Aug 2026 19:03:45 +0000",
    "From: Sender <sender@example.com>",
    "To: Rcpt <rcpt@example.com>",
    `Subject: Stub message ${uid}`,
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Body of stub message ${uid}.`,
    "",
  ].join("\r\n");
}

const MESSAGES: StubMessage[] = [
  { seq: 1, uid: 11, source: rfc822(11) },
  { seq: 2, uid: 12, source: rfc822(12) },
];

// One untagged FETCH line carrying the metadata query fetchMessages() asks for
// (UID FLAGS ENVELOPE BODYSTRUCTURE RFC822.SIZE).
function metadataLine(message: StubMessage): string {
  const address = '(("Sender" NIL "sender" "example.com"))';
  const envelope = [
    '"Mon, 25 Aug 2026 19:03:45 +0000"',
    `"Stub message ${message.uid}"`,
    address,
    address,
    address,
    '(("Rcpt" NIL "rcpt" "example.com"))',
    "NIL",
    "NIL",
    "NIL",
    `"<msg-${message.uid}@example.com>"`,
  ].join(" ");
  const bodyStructure =
    '("TEXT" "PLAIN" ("CHARSET" "utf-8") NIL NIL "7BIT" 26 1)';
  return (
    `* ${message.seq} FETCH (UID ${message.uid} FLAGS (\\Seen) ` +
    `RFC822.SIZE ${Buffer.byteLength(message.source)} ` +
    `ENVELOPE (${envelope}) BODYSTRUCTURE ${bodyStructure})\r\n`
  );
}

// The per-message source fetch, answered with an IMAP literal.
function sourceChunks(message: StubMessage): Buffer[] {
  const body = Buffer.from(message.source, "utf8");
  return [
    Buffer.from(
      `* ${message.seq} FETCH (UID ${message.uid} BODY[]<0> {${body.byteLength}}\r\n`,
    ),
    body,
    Buffer.from(")\r\n"),
  ];
}

interface StubServer {
  port: number;
  close: () => Promise<void>;
}

async function startStubImapServer(): Promise<StubServer> {
  const server = net.createServer((socket) => {
    socket.write("* OK [CAPABILITY IMAP4rev1] stub ready\r\n");
    let buffer = "";
    socket.on("error", () => {});
    socket.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let index: number;
      while ((index = buffer.indexOf("\r\n")) !== -1) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        respond(socket, line);
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));

  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve());
      }),
  };
}

function respond(socket: net.Socket, line: string): void {
  const parts = line.split(" ");
  const tag = parts[0];
  const first = (parts[1] ?? "").toUpperCase();
  const isUid = first === "UID";
  const command = isUid ? (parts[2] ?? "").toUpperCase() : first;

  switch (command) {
    case "CAPABILITY":
      socket.write("* CAPABILITY IMAP4rev1\r\n");
      socket.write(`${tag} OK Capability completed\r\n`);
      return;
    case "LOGIN":
      socket.write(`${tag} OK [CAPABILITY IMAP4rev1] Logged in\r\n`);
      return;
    case "LIST":
    case "LSUB":
      socket.write('* LIST (\\HasNoChildren) "." "INBOX"\r\n');
      socket.write(`${tag} OK List completed\r\n`);
      return;
    case "SELECT":
    case "EXAMINE":
      socket.write("* FLAGS (\\Seen \\Answered \\Flagged)\r\n");
      socket.write("* OK [PERMANENTFLAGS ()] Read-only\r\n");
      socket.write(`* ${MESSAGES.length} EXISTS\r\n`);
      socket.write("* 0 RECENT\r\n");
      socket.write("* OK [UIDVALIDITY 42] UIDs valid\r\n");
      socket.write("* OK [UIDNEXT 13] Predicted next UID\r\n");
      socket.write(`${tag} OK [READ-ONLY] Examine completed\r\n`);
      return;
    case "FETCH": {
      // A source fetch is addressed by UID and asks for BODY.PEEK[]; anything
      // else is the metadata sweep over the sequence range.
      if (isUid && line.includes("BODY.PEEK[]")) {
        const uid = Number(parts[3]);
        const message = MESSAGES.find((entry) => entry.uid === uid);
        if (message) {
          for (const chunk of sourceChunks(message)) socket.write(chunk);
        }
        socket.write(`${tag} OK Fetch completed\r\n`);
        return;
      }
      for (const message of MESSAGES) socket.write(metadataLine(message));
      socket.write(`${tag} OK Fetch completed\r\n`);
      return;
    }
    case "LOGOUT":
      socket.write("* BYE Logging out\r\n");
      socket.write(`${tag} OK Logout completed\r\n`);
      socket.end();
      return;
    default:
      socket.write(`${tag} OK ${command} completed\r\n`);
  }
}

// The driver's own socket timeout is 120s, far past any sane test budget. The
// deadlock is therefore asserted as "did not finish promptly" — on the broken
// code the promise is still pending here, on the fixed code it settles in
// milliseconds.
const DEADLINE_MS = 3_000;

async function withDeadline<T>(promise: Promise<T>): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `fetchMessages() did not settle within ${DEADLINE_MS}ms — the IMAP session is deadlocked`,
              ),
            ),
          DEADLINE_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("ImapSmtpMailDriver.fetchMessages", () => {
  let server: StubServer;
  let driver: ImapSmtpMailDriver;

  beforeEach(async () => {
    server = await startStubImapServer();
    const config: MailConnectionConfig = {
      email: "stub@example.com",
      imapHost: "127.0.0.1",
      imapPort: server.port,
      imapSecurity: "STARTTLS",
      smtpHost: "127.0.0.1",
      smtpPort: server.port,
      smtpSecurity: "STARTTLS",
      username: "stub",
      imapPassword: "secret",
    };
    driver = new ImapSmtpMailDriver(config);
  });

  afterEach(async () => {
    // A deadlocked session cannot complete LOGOUT either, so the teardown is
    // bounded: the assertion above stays the reported failure instead of being
    // buried under a hook timeout.
    await Promise.race([
      driver.close().catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 500)),
    ]);
    await server.close();
  });

  it("fetches new messages with their bodies without deadlocking the session", async () => {
    const messages = await withDeadline(
      driver.fetchMessages("INBOX", { initialLimit: 5, limit: 5 }),
    );

    expect(messages.map((message) => message.uid)).toEqual([11n, 12n]);
    expect(messages[0].subject).toBe("Stub message 11");
    expect(messages[0].from).toEqual({
      name: "Sender",
      address: "sender@example.com",
    });
    // The body proves the per-message source fetch ran and was parsed — the
    // step that used to be issued from inside the outer FETCH iteration.
    expect(messages[0].bodyText.trim()).toBe("Body of stub message 11.");
    expect(messages[1].bodyText.trim()).toBe("Body of stub message 12.");
    expect(messages[0].bodyTruncated).toBe(false);
    expect(messages[0].sourceSizeBytes).toBe(
      BigInt(Buffer.byteLength(MESSAGES[0].source)),
    );
  });

  it("reads flags down from the same session", async () => {
    const flags = await withDeadline(
      driver.listUidsWithFlags("INBOX", [11n, 12n]),
    );

    expect(flags.get(11n)?.isRead).toBe(true);
    expect(flags.get(12n)?.isRead).toBe(true);
  });
});
