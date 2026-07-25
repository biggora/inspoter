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
  options: Record<string, unknown>;
};

const state = vi.hoisted(() => ({ instances: [] as FakeClient[] }));

vi.mock("imapflow", async () => {
  const { EventEmitter: NodeEventEmitter } = await import("node:events");
  // Minimal ImapFlow stand-in: real EventEmitter semantics (emit('error')
  // without a listener throws) plus just enough surface for listFolders().
  class FakeImapFlow extends NodeEventEmitter {
    usable = false;
    options: Record<string, unknown>;

    constructor(options: Record<string, unknown>) {
      super();
      this.options = options;
      state.instances.push(this as unknown as FakeClient);
    }

    async connect(): Promise<void> {
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
    }
  }
  return { ImapFlow: FakeImapFlow };
});

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

beforeEach(() => {
  state.instances.length = 0;
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
