import type { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailConnectionConfig } from "@/lib/mail/types";

// ImapFlow is an EventEmitter: a socket failure after connect() (ETIMEOUT on
// a slow/idle connection, ECONNRESET) is delivered as an 'error' event, not
// as a rejection of the awaited operation. With no listener attached Node
// re-throws it as a process-level uncaughtException — observed in production
// as a repeating "Error: Socket timeout { code: 'ETIMEOUT' }" crash. These
// tests pin the listener down.

type FakeClient = EventEmitter & {
  usable: boolean;
  closeCalls: number;
  options: Record<string, unknown>;
};

const state = vi.hoisted(() => ({
  instances: [] as FakeClient[],
  // When set, connect() rejects with it — models imapflow failing the session
  // handshake (LOGIN → NO) after the socket is already established.
  connectError: null as Error | null,
}));

vi.mock("imapflow", async () => {
  const { EventEmitter: NodeEventEmitter } = await import("node:events");
  // Minimal ImapFlow stand-in: real EventEmitter semantics (emit('error')
  // without a listener throws) plus just enough surface for listFolders().
  class FakeImapFlow extends NodeEventEmitter {
    usable = false;
    closeCalls = 0;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      state.instances.push(this as unknown as FakeClient);
    }

    async connect(): Promise<void> {
      if (state.connectError) throw state.connectError;
      this.usable = true;
    }

    async list(): Promise<never[]> {
      return [];
    }

    async logout(): Promise<void> {
      this.usable = false;
    }

    close(): void {
      this.usable = false;
      this.closeCalls += 1;
    }
  }
  return { ImapFlow: FakeImapFlow };
});

// verify() also probes SMTP; keep that off the network so these IMAP tests
// stay deterministic.
vi.mock("nodemailer", () => ({
  createTransport: () => ({
    verify: async () => {
      throw new Error("SMTP unavailable");
    },
    close: () => {},
  }),
}));

const CONFIG: MailConnectionConfig = {
  email: "operator@inspot.local",
  imapHost: "imap.example.ru",
  imapPort: 993,
  imapSecurity: "SSL",
  smtpHost: "smtp.example.ru",
  smtpPort: 465,
  smtpSecurity: "SSL",
  username: "operator@inspot.local",
  imapPassword: "secret",
};

function socketTimeout(): Error & { code: string } {
  const error = new Error("Socket timeout") as Error & { code: string };
  error.code = "ETIMEOUT";
  return error;
}

async function connectedDriver() {
  const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
  const driver = new ImapSmtpMailDriver(CONFIG);
  await driver.listFolders();
  return driver;
}

// imapflow reports every NO/BAD response as "Command failed" and keeps the
// server's own words on responseText.
function commandFailed(responseText: string): Error {
  return Object.assign(new Error("Command failed"), { responseText });
}

beforeEach(() => {
  state.instances.length = 0;
  state.connectError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ImapSmtpMailDriver connection errors", () => {
  it("does not let a post-connect socket error escape as an uncaught exception", async () => {
    await connectedDriver();
    const client = state.instances[0];

    expect(client.listenerCount("error")).toBeGreaterThan(0);
    expect(() => client.emit("error", socketTimeout())).not.toThrow();
  });

  it("logs the failing account instead of staying silent", async () => {
    await connectedDriver();

    state.instances[0].emit("error", socketTimeout());

    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = vi.mocked(console.error).mock.calls[0].join(" ");
    expect(logged).toContain("operator@inspot.local");
    expect(logged).toContain("imap.example.ru");
    expect(logged).toContain("Socket timeout");
    expect(logged).not.toContain("secret");
  });

  it("drops the cached connection so the next call reconnects", async () => {
    const driver = await connectedDriver();
    // imapflow only tears the socket down on the next tick (closeAfter →
    // setImmediate), so `usable` is still true right after the event: the
    // cache must be invalidated by the handler, not by the usable check.
    state.instances[0].emit("error", socketTimeout());
    expect(state.instances[0].usable).toBe(true);

    await driver.listFolders();

    expect(state.instances).toHaveLength(2);
  });

  // imapflow rejects connect() from beginSession() without closing the socket
  // when the handshake fails, and the driver has not cached the client yet —
  // so nothing else can close it. Left open, the socket sits until its
  // inactivity timeout fires a bogus "Socket timeout" error event.
  it("closes the socket when connect() fails after the TCP handshake", async () => {
    const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
    state.connectError = commandFailed("[AUTHENTICATIONFAILED] Invalid");
    const driver = new ImapSmtpMailDriver(CONFIG);

    await expect(driver.listFolders()).rejects.toThrow();

    expect(state.instances).toHaveLength(1);
    expect(state.instances[0].closeCalls).toBe(1);
    // The failed connect is reported by the rejection, not by the out-of-band
    // error channel — no duplicate log entry.
    expect(console.error).not.toHaveBeenCalled();
  });

  it("reports the server response text instead of a bare 'Command failed'", async () => {
    const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
    state.connectError = commandFailed(
      "[AUTHENTICATIONFAILED] Invalid credentials (Failure)",
    );
    const driver = new ImapSmtpMailDriver(CONFIG);

    await expect(driver.listFolders()).rejects.toThrow(
      "IMAP listFolders failed: Command failed: [AUTHENTICATIONFAILED] Invalid credentials (Failure)",
    );
  });

  it("marks wire failures with the driver op so callers can retry them", async () => {
    const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
    const { MailTransportError } = await import("@/lib/mail/types");
    state.connectError = socketTimeout();
    const driver = new ImapSmtpMailDriver(CONFIG);

    const error = await driver.listFolders().catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MailTransportError);
    expect((error as InstanceType<typeof MailTransportError>).op).toBe(
      "listFolders",
    );
  });

  it("closes verify()'s throwaway client when connect() fails", async () => {
    const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
    state.connectError = commandFailed("[AUTHENTICATIONFAILED] Invalid");
    const driver = new ImapSmtpMailDriver(CONFIG);

    const result = await driver.verify();

    expect(result.imapOk).toBe(false);
    expect(result.error).toContain("[AUTHENTICATIONFAILED] Invalid");
    expect(state.instances[0].closeCalls).toBe(1);
  });

  it("only invalidates the driver whose connection failed", async () => {
    const driver = await connectedDriver();
    const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
    const cached = state.instances[0];

    // A second driver's failure must not disturb this driver's connection.
    const other = new ImapSmtpMailDriver(CONFIG);
    await other.listFolders();
    state.instances[1].emit("error", socketTimeout());

    await driver.listFolders();
    expect(state.instances).toHaveLength(2);
    expect(state.instances[0]).toBe(cached);
  });
});
