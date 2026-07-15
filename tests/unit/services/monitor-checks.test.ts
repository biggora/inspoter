import net from "node:net";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkHttp, checkPing, checkTcp } from "@/lib/services/monitor-checks";

// checkHttp/checkTcp/checkPing (plan.md "Логика проверок") exercised
// against local ephemeral servers bound to 127.0.0.1 with a dynamic port
// (listen(0)) — fully local, zero external network calls, deterministic in
// CI. No mocking of fetch/net — these are the real Node built-ins the
// implementation uses.

let httpServer: http.Server;
let httpPort: number;
let tcpServer: net.Server;
let tcpPort: number;
let closedTcpPort: number;

beforeAll(async () => {
  httpServer = http.createServer((req, res) => {
    if (req.url === "/not-found") {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    if (req.url === "/teapot") {
      res.writeHead(418, { "Content-Type": "text/plain" });
      res.end("teapot");
      return;
    }
    if (req.url === "/slow") {
      // Never responds within the test's short timeout — deliberately
      // holds the connection open instead of calling res.end().
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("ok");
  });
  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", resolve));
  httpPort = (httpServer.address() as AddressInfo).port;

  tcpServer = net.createServer((socket) => {
    socket.end();
  });
  await new Promise<void>((resolve) => tcpServer.listen(0, "127.0.0.1", resolve));
  tcpPort = (tcpServer.address() as AddressInfo).port;

  // A port nothing listens on, to trigger ECONNREFUSED deterministically:
  // bind then immediately close, so the OS won't have reassigned it yet in
  // practice within this test's short lifetime, and a connect attempt gets
  // an explicit refusal rather than a hang.
  const probe = net.createServer();
  await new Promise<void>((resolve) => probe.listen(0, "127.0.0.1", resolve));
  closedTcpPort = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve) => probe.close(() => resolve()));
});

afterAll(async () => {
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await new Promise<void>((resolve) => tcpServer.close(() => resolve()));
});

describe("checkHttp()", () => {
  it("returns ok for a 200 response within the default 200-299 range", async () => {
    const result = await checkHttp({
      url: `http://127.0.0.1:${httpPort}/`,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0);
  });

  it("returns not ok with a message for a 404 (outside the default range)", async () => {
    const result = await checkHttp({
      url: `http://127.0.0.1:${httpPort}/not-found`,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/404/);
  });

  it("matches a custom expectedStatusCodes range", async () => {
    const result = await checkHttp({
      url: `http://127.0.0.1:${httpPort}/teapot`,
      timeoutMs: 2000,
      expectedStatusCodes: "400-499",
    });
    expect(result.ok).toBe(true);
  });

  it("returns not ok when the status is outside a custom expectedStatusCodes range", async () => {
    const result = await checkHttp({
      url: `http://127.0.0.1:${httpPort}/`,
      timeoutMs: 2000,
      expectedStatusCodes: "400-499",
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/200/);
  });

  it("returns not ok with a timeout message when the server never responds", async () => {
    const result = await checkHttp({
      url: `http://127.0.0.1:${httpPort}/slow`,
      timeoutMs: 200,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Timed out/i);
  }, 10000);
});

describe("checkTcp()", () => {
  it("returns ok when the connection succeeds", async () => {
    const result = await checkTcp({
      host: "127.0.0.1",
      port: tcpPort,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
  });

  it("returns not ok when the connection is refused (closed port)", async () => {
    const result = await checkTcp({
      host: "127.0.0.1",
      port: closedTcpPort,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBeDefined();
  });
});

describe("checkPing()", () => {
  it("returns ok against an open port (successful connect)", async () => {
    const result = await checkPing({
      host: "127.0.0.1",
      port: tcpPort,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
  });

  it("returns ok against a closed port (ECONNREFUSED counts as reachable — documented tradeoff)", async () => {
    const result = await checkPing({
      host: "127.0.0.1",
      port: closedTcpPort,
      timeoutMs: 2000,
    });
    expect(result.ok).toBe(true);
  });

  it("returns not ok against an unroutable TEST-NET address (RFC 5737), offline-safe", async () => {
    const result = await checkPing({
      host: "192.0.2.1",
      port: 80,
      timeoutMs: 300,
    });
    expect(result.ok).toBe(false);
    expect(result.message).toBeDefined();
  }, 5000);
});
