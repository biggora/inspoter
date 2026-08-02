import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import * as webhookTokensService from "@/lib/services/webhookTokens";
import * as logsService from "@/lib/services/logs";
import * as alertsService from "@/lib/services/alerts";
import * as bookmarksService from "@/lib/services/bookmarks";
import * as servicesService from "@/lib/services/services";
import * as mailService from "@/lib/services/mail";
import { MCP_SCOPES } from "@/lib/mcp/scopes";
import { ALL_TOOLS } from "@/lib/mcp/server";
import { DELETE, GET, POST } from "@/app/api/mcp/route";

// /api/mcp end-to-end over the real JSON-RPC surface: the bearer token is the
// only authority, it carries the workspace, and tools/list is filtered by the
// token's scopes.

const MCP_URL = "http://localhost/api/mcp";

let requestId = 0;

function buildRequest(
  body: unknown,
  token: string | null,
  headers: Record<string, string> = {},
): NextRequest {
  const finalHeaders = new Headers({
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    ...headers,
  });
  if (token !== null) finalHeaders.set("authorization", `Bearer ${token}`);

  return new NextRequest(MCP_URL, {
    method: "POST",
    headers: finalHeaders,
    body: JSON.stringify(body),
  });
}

interface JsonRpcResponse {
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

// The handler answers with a plain JSON body or an SSE stream depending on
// whether it emitted anything before the result; accept both.
async function readJsonRpc(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return JSON.parse(text) as JsonRpcResponse;
  }
  const dataLine = text
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("data:"));
  if (!dataLine) throw new Error(`No SSE data frame in: ${text}`);
  return JSON.parse(dataLine.slice("data:".length).trim()) as JsonRpcResponse;
}

async function rpc(
  token: string,
  method: string,
  params?: Record<string, unknown>,
): Promise<JsonRpcResponse> {
  requestId += 1;
  const response = await POST(
    buildRequest(
      { jsonrpc: "2.0", id: requestId, method, ...(params ? { params } : {}) },
      token,
    ),
  );
  expect(response.status).toBe(200);
  return readJsonRpc(response);
}

async function listToolNames(token: string): Promise<string[]> {
  const body = await rpc(token, "tools/list");
  const tools = (body.result?.tools ?? []) as Array<{ name: string }>;
  return tools.map((tool) => tool.name).sort();
}

async function callTool(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; payload: unknown; text: string }> {
  const body = await rpc(token, "tools/call", { name, arguments: args });
  const result = body.result as
    { isError?: boolean; content: Array<{ text: string }> } | undefined;
  if (!result)
    throw new Error(`No result for ${name}: ${JSON.stringify(body)}`);
  const text = result.content[0]?.text ?? "";
  return {
    isError: result.isError === true,
    text,
    payload: result.isError === true ? null : JSON.parse(text),
  };
}

let workspaceId: string;
let otherWorkspaceId: string;
let fullToken: string;
let logsOnlyToken: string;
let scopelessToken: string;
let revokedToken: string;
let channelToken: string;
let otherWorkspaceToken: string;
let categoryId: string;
let serviceId: string;
let messageCategoryId: string;
let channelId: string;

beforeAll(async () => {
  const [workspace, otherWorkspace] = await Promise.all([
    db.workspace.create({
      data: {
        name: "MCP Workspace",
        slug: `mcp-${randomUUID()}`,
        updatedAt: new Date(),
      },
    }),
    db.workspace.create({
      data: {
        name: "MCP Other Workspace",
        slug: `mcp-other-${randomUUID()}`,
        updatedAt: new Date(),
      },
    }),
  ]);
  workspaceId = workspace.id;
  otherWorkspaceId = otherWorkspace.id;

  fullToken = (
    await webhookTokensService.create(workspaceId, "full", MCP_SCOPES)
  ).token;
  logsOnlyToken = (
    await webhookTokensService.create(workspaceId, "logs", ["logs:read"])
  ).token;
  scopelessToken = (await webhookTokensService.create(workspaceId, "ingest"))
    .token;
  otherWorkspaceToken = (
    await webhookTokensService.create(otherWorkspaceId, "other", MCP_SCOPES)
  ).token;

  const revoked = await webhookTokensService.create(
    workspaceId,
    "revoked",
    MCP_SCOPES,
  );
  await webhookTokensService.revoke(revoked.id, workspaceId);
  revokedToken = revoked.token;

  const messageCategory = await db.messageCategory.create({
    data: { workspaceId, name: `mcp-cat-${randomUUID()}` },
  });
  messageCategoryId = messageCategory.id;
  const channel = await db.channel.create({
    data: {
      workspaceId,
      messageCategoryId: messageCategory.id,
      messageCategoryWorkspaceId: workspaceId,
      name: `mcp-channel-${randomUUID()}`,
    },
  });
  channelId = channel.id;
  channelToken = (
    await webhookTokensService.createForChannel(
      channel.id,
      workspaceId,
      "channel",
    )
  ).url
    .split("/")
    .pop() as string;

  // Seed one row per read domain, in both workspaces where isolation matters.
  await Promise.all([
    logsService.create(workspaceId, {
      level: "error",
      source: "mcp-test",
      message: "disk almost full on web-1",
    }),
    logsService.create(otherWorkspaceId, {
      level: "error",
      source: "mcp-test",
      message: "other workspace log",
    }),
    alertsService.create(workspaceId, {
      category: "Infrastructure",
      severity: "critical",
      source: "mcp-test",
      message: "database unreachable",
    }),
    mailService.create(workspaceId, {
      sender: "ops@example.invalid",
      subject: "Nightly backup finished",
      body: "All volumes archived.",
    }),
  ]);

  const category = await bookmarksService.createCategory(workspaceId, {
    name: "Runbooks",
  });
  categoryId = category.id;
  await bookmarksService.createBookmark(workspaceId, {
    name: "Incident runbook",
    url: "https://runbook.example.invalid/incidents",
    categoryId,
  });

  const service = await servicesService.create(workspaceId, {
    name: "Public API",
    monitorType: "HTTP",
    url: "https://api.example.invalid/health",
  });
  serviceId = service.id;
});

afterAll(async () => {
  await Promise.all([
    db.workspace.delete({ where: { id: workspaceId } }).catch(() => {}),
    db.workspace.delete({ where: { id: otherWorkspaceId } }).catch(() => {}),
  ]);
});

describe("authentication", () => {
  it("rejects a request with no Authorization header", async () => {
    const response = await POST(buildRequest({ method: "tools/list" }, null));

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
  });

  it("rejects an unknown secret", async () => {
    const response = await POST(
      buildRequest({ method: "tools/list" }, "not-a-real-token"),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a revoked token", async () => {
    const response = await POST(
      buildRequest({ method: "tools/list" }, revokedToken),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a channel webhook token", async () => {
    const response = await POST(
      buildRequest({ method: "tools/list" }, channelToken),
    );

    expect(response.status).toBe(401);
  });

  it("rejects a scopeless ingest token — pre-MCP tokens gain no read access", async () => {
    const response = await POST(
      buildRequest({ method: "tools/list" }, scopelessToken),
    );

    expect(response.status).toBe(401);
  });

  it("records lastUsedAt for an accepted token", async () => {
    await rpc(logsOnlyToken, "tools/list");

    // The stamp is fire-and-forget so a slow write never delays a tool call.
    let lastUsedAt: Date | null = null;
    for (let attempt = 0; attempt < 20 && lastUsedAt === null; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      const token = await db.webhookToken.findFirst({
        where: { workspaceId, name: "logs" },
      });
      lastUsedAt = token?.lastUsedAt ?? null;
    }
    expect(lastUsedAt).not.toBeNull();
  });
});

describe("stateless transport", () => {
  it("answers GET and DELETE with 405", async () => {
    expect(GET().status).toBe(405);
    expect(DELETE().status).toBe(405);
  });
});

describe("tools/list is filtered by the token's scopes", () => {
  it("advertises every tool to a token with every scope", async () => {
    const names = await listToolNames(fullToken);

    expect(names).toEqual(ALL_TOOLS.map((tool) => tool.name).sort());
  });

  it("advertises only logs_search to a logs:read token", async () => {
    expect(await listToolNames(logsOnlyToken)).toEqual(["logs_search"]);
  });

  it("refuses a call to a tool outside the token's scopes", async () => {
    const body = await rpc(logsOnlyToken, "tools/call", {
      name: "mail_search",
      arguments: {},
    });

    expect(body.error ?? body.result?.isError).toBeTruthy();
  });
});

describe("read tools", () => {
  it("searches logs", async () => {
    const { payload } = await callTool(fullToken, "logs_search", {
      query: "disk almost full",
    });
    const items = (payload as { items: Array<{ message: string }> }).items;

    expect(items).toHaveLength(1);
    expect(items[0].message).toContain("disk almost full");
  });

  it("searches alerts", async () => {
    const { payload } = await callTool(fullToken, "alerts_search", {
      severity: "critical",
    });
    const items = (payload as { items: Array<{ message: string }> }).items;

    expect(items).toHaveLength(1);
    expect(items[0].message).toBe("database unreachable");
  });

  it("reads one alert and reports a missing id as a tool error", async () => {
    const { payload } = await callTool(fullToken, "alerts_search", {});
    const id = (payload as { items: Array<{ id: string }> }).items[0].id;

    const found = await callTool(fullToken, "alerts_get", { id });
    expect((found.payload as { id: string }).id).toBe(id);

    const missing = await callTool(fullToken, "alerts_get", { id: "nope" });
    expect(missing.isError).toBe(true);
    expect(missing.text).toContain("nope");
  });

  it("searches mail and reads a message body", async () => {
    const { payload } = await callTool(fullToken, "mail_search", {
      query: "Nightly backup",
    });
    const items = (payload as { items: Array<{ id: string }> }).items;
    expect(items).toHaveLength(1);

    const detail = await callTool(fullToken, "mail_get", { id: items[0].id });
    expect((detail.payload as { bodyText: string }).bodyText).toContain(
      "All volumes archived.",
    );
  });

  it("searches bookmarks", async () => {
    const { payload } = await callTool(fullToken, "bookmarks_search", {
      query: "runbook",
    });

    expect((payload as { total: number }).total).toBe(1);
  });

  it("lists services and their check history", async () => {
    const list = await callTool(fullToken, "services_list", {});
    expect((list.payload as Array<{ id: string }>)[0].id).toBe(serviceId);

    const checks = await callTool(fullToken, "service_checks", {
      id: serviceId,
    });
    expect(checks.payload).toMatchObject({ items: [], nextCursor: null });
  });

  it("lists servers", async () => {
    const { payload } = await callTool(fullToken, "servers_list", {});

    expect(payload).toMatchObject({ servers: [] });
  });
});

describe("write tools", () => {
  it("creates a bookmark in the token's workspace", async () => {
    const { payload } = await callTool(fullToken, "bookmark_create", {
      name: "Status page",
      url: "https://status.example.invalid",
      categoryId,
    });
    const id = (payload as { id: string }).id;

    const stored = await db.bookmark.findUnique({ where: { id } });
    expect(stored?.workspaceId).toBe(workspaceId);
    expect(stored?.name).toBe("Status page");
  });

  it("refuses to write into another workspace's category", async () => {
    const result = await callTool(otherWorkspaceToken, "bookmark_create", {
      name: "Cross-tenant",
      url: "https://evil.example.invalid",
      categoryId,
    });

    expect(result.isError).toBe(true);
    expect(await db.bookmark.count({ where: { name: "Cross-tenant" } })).toBe(
      0,
    );
  });

  it("categorizes an alert and records the assignment as model-made", async () => {
    const created = await alertsService.create(workspaceId, {
      severity: "warning",
      source: "mcp-test",
      message: "uncategorized event for the assistant",
    });
    const category = await callTool(fullToken, "alert_category_create", {
      name: "Capacity",
    });
    const alertCategoryId = (category.payload as { id: string }).id;

    const { payload } = await callTool(fullToken, "alerts_set_category", {
      id: created.id,
      categoryId: alertCategoryId,
      confidence: 0.7,
    });

    expect((payload as { alertCategoryId: string }).alertCategoryId).toBe(
      alertCategoryId,
    );
    const stored = await db.alert.findUnique({ where: { id: created.id } });
    expect(stored?.categorySource).toBe("MODEL");
    expect(stored?.categoryConfidence).toBeCloseTo(0.7);
  });

  it("refuses to categorize an alert in another workspace", async () => {
    const created = await alertsService.create(workspaceId, {
      severity: "info",
      source: "mcp-test",
      message: "not reachable from the other tenant",
    });

    const result = await callTool(otherWorkspaceToken, "alerts_set_category", {
      id: created.id,
      categoryId: null,
    });

    expect(result.isError).toBe(true);
  });

  it("denies the write tools to a read-only alerts token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "alerts-ro", [
        "alerts:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "alert_categories_list",
      "alerts_get",
      "alerts_search",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "alerts_set_category",
      arguments: { id: "whatever", categoryId: null },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });
});

// The Messages tools are the agent's own workspace: it lays out categories and
// channels, wires a webhook, and posts — all under one write scope.
describe("messages tools", () => {
  it("lists categories with their channels", async () => {
    const { payload } = await callTool(fullToken, "message_categories_list");
    const categories = payload as Array<{
      id: string;
      channels: Array<{ id: string }>;
    }>;

    const seeded = categories.find((entry) => entry.id === messageCategoryId);
    expect(seeded?.channels.map((channel) => channel.id)).toContain(channelId);
  });

  it("creates a category once and returns the same row on a repeat call", async () => {
    const first = await callTool(fullToken, "message_category_create", {
      name: "Deployments",
    });
    const second = await callTool(fullToken, "message_category_create", {
      // Matching is case-insensitive, so this must not create a second row.
      name: "deployments",
    });

    expect(first.payload).toMatchObject({ created: true });
    expect(second.payload).toMatchObject({
      created: false,
      id: (first.payload as { id: string }).id,
    });
  });

  it("creates and renames a channel inside a category", async () => {
    const created = await callTool(fullToken, "message_channel_create", {
      categoryId: messageCategoryId,
      name: "releases",
    });
    const id = (created.payload as { id: string }).id;

    const renamed = await callTool(fullToken, "message_channel_rename", {
      id,
      name: "releases-prod",
    });

    expect(renamed.payload).toMatchObject({ id, name: "releases-prod" });
  });

  it("refuses to create a channel in another workspace's category", async () => {
    const result = await callTool(
      otherWorkspaceToken,
      "message_channel_create",
      { categoryId: messageCategoryId, name: "cross-tenant" },
    );

    expect(result.isError).toBe(true);
    expect(await db.channel.count({ where: { name: "cross-tenant" } })).toBe(0);
  });

  it("posts a message stamped as agent-written and reads it back", async () => {
    const sent = await callTool(fullToken, "message_send", {
      channelId,
      content: "Deploy finished on web-01.",
    });
    const id = (sent.payload as { id: string }).id;

    const stored = await db.message.findUnique({ where: { id } });
    expect(stored?.origin).toBe("AGENT");
    // No explicit author, so the token's name identifies the writer.
    expect(stored?.author).toBe("full");

    const listed = await callTool(fullToken, "messages_list", { channelId });
    const items = (listed.payload as { items: Array<{ id: string }> }).items;
    expect(items.map((item) => item.id)).toContain(id);
  });

  it("refuses to post into another workspace's channel", async () => {
    const result = await callTool(otherWorkspaceToken, "message_send", {
      channelId,
      content: "cross-tenant message",
    });

    expect(result.isError).toBe(true);
    expect(
      await db.message.count({ where: { content: "cross-tenant message" } }),
    ).toBe(0);
  });

  it("issues a channel webhook once and revokes it", async () => {
    const created = await callTool(fullToken, "channel_webhook_create", {
      channelId,
      name: "CI pipeline",
    });
    const { webhook, url } = created.payload as {
      webhook: { id: string; tokenPrefix: string };
      url: string;
    };

    expect(url).toContain(`/api/webhooks/channels/${webhook.id}/`);
    // The secret rides in the url only — the webhook object carries a prefix.
    expect(url).not.toBe(webhook.tokenPrefix);

    const listed = await callTool(fullToken, "channel_webhooks_list", {
      channelId,
    });
    expect(
      (listed.payload as Array<{ id: string }>).map((entry) => entry.id),
    ).toContain(webhook.id);

    await callTool(fullToken, "channel_webhook_revoke", {
      channelId,
      webhookId: webhook.id,
    });
    const stored = await db.webhookToken.findUnique({
      where: { id: webhook.id },
    });
    expect(stored?.revokedAt).not.toBeNull();
  });

  it("denies the write tools to a read-only messages token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "messages-ro", [
        "messages:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "channel_webhooks_list",
      "message_categories_list",
      "messages_list",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "message_send",
      arguments: { channelId, content: "should not be stored" },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(
      await db.message.count({ where: { content: "should not be stored" } }),
    ).toBe(0);
  });
});

describe("workspace isolation", () => {
  it("never returns another workspace's rows", async () => {
    const logs = await callTool(otherWorkspaceToken, "logs_search", {});
    const messages = (
      logs.payload as { items: Array<{ message: string }> }
    ).items.map((item) => item.message);
    expect(messages).toEqual(["other workspace log"]);

    for (const tool of ["alerts_search", "mail_search"]) {
      const { payload } = await callTool(otherWorkspaceToken, tool, {});
      expect((payload as { items: unknown[] }).items).toEqual([]);
    }

    const bookmarks = await callTool(
      otherWorkspaceToken,
      "bookmarks_search",
      {},
    );
    expect((bookmarks.payload as { total: number }).total).toBe(0);

    const services = await callTool(otherWorkspaceToken, "services_list", {});
    expect(services.payload).toEqual([]);
  });

  it("cannot read a resource of another workspace by id", async () => {
    const result = await callTool(otherWorkspaceToken, "service_get", {
      id: serviceId,
    });

    expect(result.isError).toBe(true);
  });
});
