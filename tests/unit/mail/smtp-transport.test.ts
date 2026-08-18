import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { MailConnectionConfig } from "@/lib/mail/types";

// A blocked outbound port (observed in production: the host firewall drops
// SMTPS on 465 while 587 is open) surfaced as a bare "SMTP: Connection
// timeout", which reads like an application bug. These tests pin down what the
// driver now reports instead: the host, the port and the transport error code,
// plus the SSL/STARTTLS option mapping the report put in doubt.

const state = vi.hoisted(() => ({
  transportOptions: [] as Record<string, unknown>[],
  verifyError: null as unknown,
  sendError: null as unknown,
}));

vi.mock("nodemailer", () => ({
  createTransport: (options: Record<string, unknown>) => {
    state.transportOptions.push(options);
    return {
      verify: async () => {
        if (state.verifyError) throw state.verifyError;
        return true;
      },
      sendMail: async () => {
        if (state.sendError) throw state.sendError;
        return {};
      },
      close: () => {},
    };
  },
}));

// verify() probes IMAP first; keep that leg green so only SMTP is under test.
vi.mock("imapflow", async () => {
  const { EventEmitter } = await import("node:events");
  class FakeImapFlow extends EventEmitter {
    usable = false;
    async connect(): Promise<void> {
      this.usable = true;
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

const BASE_CONFIG: MailConnectionConfig = {
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

function transportError(
  message: string,
  extra: Record<string, unknown> = {},
): Error {
  return Object.assign(new Error(message), extra);
}

const connectionTimeout = () =>
  transportError("Connection timeout", { code: "ETIMEDOUT", command: "CONN" });

async function makeDriver(overrides: Partial<MailConnectionConfig> = {}) {
  const { ImapSmtpMailDriver } = await import("@/lib/mail/imap-smtp");
  return new ImapSmtpMailDriver({ ...BASE_CONFIG, ...overrides });
}

beforeEach(() => {
  state.transportOptions.length = 0;
  state.verifyError = null;
  state.sendError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SMTP transport options", () => {
  it("maps SSL to implicit TLS and STARTTLS to a mandatory upgrade", async () => {
    await (await makeDriver()).verify();
    await (
      await makeDriver({ smtpPort: 587, smtpSecurity: "STARTTLS" })
    ).verify();

    expect(state.transportOptions[0]).toMatchObject({
      host: "smtp.example.ru",
      port: 465,
      secure: true,
      requireTLS: false,
    });
    expect(state.transportOptions[1]).toMatchObject({
      host: "smtp.example.ru",
      port: 587,
      secure: false,
      requireTLS: true,
    });
  });

  it("applies the split SMTP timeouts", async () => {
    await (await makeDriver()).verify();

    expect(state.transportOptions[0]).toMatchObject({
      connectionTimeout: 20_000,
      greetingTimeout: 20_000,
      socketTimeout: 60_000,
    });
  });
});

describe("SMTP verify failures", () => {
  it("names the host, port and error code when the port is unreachable", async () => {
    state.verifyError = connectionTimeout();

    const result = await (await makeDriver()).verify();

    expect(result.imapOk).toBe(true);
    expect(result.smtpOk).toBe(false);
    expect(result.error).toContain(
      "SMTP smtp.example.ru:465: Connection timeout (ETIMEDOUT)",
    );
    expect(result.smtpFailure).toEqual({
      protocol: "SMTP",
      host: "smtp.example.ru",
      port: 465,
      code: "ETIMEDOUT",
      message: "Connection timeout (ETIMEDOUT)",
    });
    expect(result.imapFailure).toBeNull();
  });

  it("files the failure under the mail:smtp log source", async () => {
    state.verifyError = connectionTimeout();
    const onTransportError = vi.fn();

    await (await makeDriver({ onTransportError })).verify();

    expect(onTransportError).toHaveBeenCalledTimes(1);
    const [source, message, details] = onTransportError.mock.calls[0];
    expect(source).toBe("mail:smtp");
    expect(message).toContain("smtp.example.ru:465");
    expect(message).toContain("ETIMEDOUT");
    expect(JSON.parse(details)).toMatchObject({
      smtpHost: "smtp.example.ru",
      smtpPort: 465,
      smtpSecurity: "SSL",
      code: "ETIMEDOUT",
      op: "verify",
    });
  });

  it("keeps the password out of the error and the log payload", async () => {
    state.verifyError = connectionTimeout();
    const onTransportError = vi.fn();

    const result = await (await makeDriver({ onTransportError })).verify();

    expect(result.error).not.toContain("secret");
    expect(onTransportError.mock.calls[0].join(" ")).not.toContain("secret");
  });

  it("keeps the server reply on an auth failure", async () => {
    state.verifyError = transportError("Invalid login", {
      code: "EAUTH",
      response: "535 5.7.8 Authentication failed",
      responseCode: 535,
    });

    const result = await (await makeDriver()).verify();

    expect(result.smtpFailure?.code).toBe("EAUTH");
    expect(result.error).toContain("535 5.7.8 Authentication failed");
  });

  it("reports a code-less error without inventing one", async () => {
    state.verifyError = new Error("SMTP unavailable");

    const result = await (await makeDriver()).verify();

    expect(result.smtpFailure).toEqual({
      protocol: "SMTP",
      host: "smtp.example.ru",
      port: 465,
      code: null,
      message: "SMTP unavailable",
    });
  });
});

describe("SMTP send failures", () => {
  it("wraps a send timeout with host:port and logs it", async () => {
    const { MailTransportError } = await import("@/lib/mail/types");
    state.sendError = connectionTimeout();
    const onTransportError = vi.fn();
    const driver = await makeDriver({ onTransportError });

    const error = await driver
      .send({
        from: { address: "operator@inspot.local" },
        to: [{ address: "someone@example.com" }],
        cc: [],
        bcc: [],
        subject: "Hi",
        text: "Hi",
        html: "<p>Hi</p>",
        attachments: [],
      })
      .catch((err: unknown) => err);

    expect(error).toBeInstanceOf(MailTransportError);
    const transportFailure = error as InstanceType<typeof MailTransportError>;
    expect(transportFailure.op).toBe("send");
    expect(transportFailure.message).toContain("smtp.example.ru:465");
    expect(transportFailure.message).toContain("ETIMEDOUT");
    expect(onTransportError).toHaveBeenCalledTimes(1);
    expect(onTransportError.mock.calls[0][0]).toBe("mail:smtp");
  });
});
