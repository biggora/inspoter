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
import * as mailAccountsService from "@/lib/services/mail-accounts";
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
      "message_channel_get",
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

describe("services write tools", () => {
  it("creates, updates, pauses and deletes a monitor", async () => {
    const created = await callTool(fullToken, "service_create", {
      name: "Agent-made monitor",
      monitorType: "TCP",
      host: "127.0.0.1",
      port: 9,
      intervalSeconds: 300,
    });
    const id = (created.payload as { id: string }).id;
    expect((created.payload as { monitorType: string }).monitorType).toBe(
      "TCP",
    );

    const updated = await callTool(fullToken, "service_update", {
      id,
      name: "Agent-made monitor (renamed)",
      retries: 3,
    });
    expect(updated.payload).toMatchObject({
      name: "Agent-made monitor (renamed)",
      retries: 3,
    });

    const paused = await callTool(fullToken, "service_set_active", {
      id,
      isActive: false,
    });
    expect((paused.payload as { isActive: boolean }).isActive).toBe(false);

    const deleted = await callTool(fullToken, "service_delete", { id });
    expect(deleted.payload).toMatchObject({ id, deleted: true });
    expect(await db.service.findUnique({ where: { id } })).toBeNull();
  });

  it("reports a monitor missing its type-specific target as bad arguments", async () => {
    const result = await callTool(fullToken, "service_create", {
      name: "No target",
      monitorType: "HTTP",
    });

    expect(result.isError).toBe(true);
    expect(result.text).toContain("url");
    expect(await db.service.count({ where: { name: "No target" } })).toBe(0);
  });

  it("manages service labels and assigns them to a service", async () => {
    const label = await callTool(fullToken, "service_label_create", {
      name: "Critical path",
      color: "RED",
    });
    const labelId = (label.payload as { id: string }).id;

    const renamed = await callTool(fullToken, "service_label_update", {
      id: labelId,
      name: "Critical",
    });
    expect((renamed.payload as { name: string }).name).toBe("Critical");

    const assigned = await callTool(fullToken, "service_labels_set", {
      id: serviceId,
      labelIds: [labelId],
    });
    expect(
      (assigned.payload as { labels: Array<{ id: string }> }).labels,
    ).toEqual([expect.objectContaining({ id: labelId })]);

    const filtered = await callTool(fullToken, "services_list", { labelId });
    expect(
      (filtered.payload as Array<{ id: string }>).map((s) => s.id),
    ).toEqual([serviceId]);

    const removed = await callTool(fullToken, "service_label_delete", {
      id: labelId,
    });
    expect(removed.payload).toMatchObject({ id: labelId, deleted: true });
  });

  it("reports a duplicate label name as a tool error rather than a crash", async () => {
    const first = await callTool(fullToken, "service_label_create", {
      name: "Edge",
      color: "BLUE",
    });
    const duplicate = await callTool(fullToken, "service_label_create", {
      name: "edge",
      color: "GREEN",
    });

    expect(duplicate.isError).toBe(true);
    expect(duplicate.text).toContain("already exists");
    await callTool(fullToken, "service_label_delete", {
      id: (first.payload as { id: string }).id,
    });
  });

  it("refuses to touch a service of another workspace", async () => {
    const result = await callTool(otherWorkspaceToken, "service_update", {
      id: serviceId,
      name: "Cross-tenant rename",
    });

    expect(result.isError).toBe(true);
    const stored = await db.service.findUnique({ where: { id: serviceId } });
    expect(stored?.name).toBe("Public API");
  });

  it("denies the write tools to a read-only services token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "services-ro", [
        "services:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "service_checks",
      "service_get",
      "service_labels_list",
      "services_list",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "service_delete",
      arguments: { id: serviceId },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(await db.service.findUnique({ where: { id: serviceId } })).not.toBe(
      null,
    );
  });
});

describe("bookmarks write tools", () => {
  it("updates, moves and deletes a bookmark", async () => {
    const created = await callTool(fullToken, "bookmark_create", {
      name: "Grafana",
      url: "https://grafana.example.invalid",
      categoryId,
    });
    const id = (created.payload as { id: string }).id;

    const nested = await callTool(fullToken, "bookmark_category_create", {
      name: "Dashboards",
      parentCategoryId: categoryId,
    });
    const nestedId = (nested.payload as { id: string }).id;

    const updated = await callTool(fullToken, "bookmark_update", {
      id,
      name: "Grafana (prod)",
      categoryId: nestedId,
      color: "accent",
    });
    expect(updated.payload).toMatchObject({
      name: "Grafana (prod)",
      categoryId: nestedId,
      color: "accent",
    });

    // The flat search carries the parent category, so a model can tell a
    // nested bookmark from a top-level one.
    const found = await callTool(fullToken, "bookmarks_search", {
      query: "Grafana",
    });
    expect(
      (found.payload as { items: Array<Record<string, unknown>> }).items[0],
    ).toMatchObject({
      categoryName: "Dashboards",
      parentCategoryName: "Runbooks",
    });

    const deleted = await callTool(fullToken, "bookmark_delete", { id });
    expect(deleted.payload).toMatchObject({ id, deleted: true });
    expect(await db.bookmark.findUnique({ where: { id } })).toBeNull();
  });

  it("refuses to nest a category more than one level deep", async () => {
    const parent = await callTool(fullToken, "bookmark_category_create", {
      name: "Level one",
    });
    const child = await callTool(fullToken, "bookmark_category_create", {
      name: "Level two",
      parentCategoryId: (parent.payload as { id: string }).id,
    });

    const tooDeep = await callTool(fullToken, "bookmark_category_create", {
      name: "Level three",
      parentCategoryId: (child.payload as { id: string }).id,
    });

    expect(tooDeep.isError).toBe(true);
    expect(await db.category.count({ where: { name: "Level three" } })).toBe(0);
  });

  it("reorders the bookmarks of a category", async () => {
    const first = await callTool(fullToken, "bookmark_create", {
      name: "First",
      url: "https://first.example.invalid",
      categoryId,
    });
    const second = await callTool(fullToken, "bookmark_create", {
      name: "Second",
      url: "https://second.example.invalid",
      categoryId,
    });
    const ids = [first, second].map(
      (result) => (result.payload as { id: string }).id,
    );

    const existing = await db.bookmark.findMany({
      where: { categoryId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    const reversed = existing.map((row) => row.id).reverse();

    const result = await callTool(fullToken, "bookmarks_reorder", {
      categories: [{ categoryId, bookmarkIds: reversed }],
    });
    expect(result.payload).toEqual({ reordered: true });

    const after = await db.bookmark.findMany({
      where: { categoryId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(after.map((row) => row.id)).toEqual(reversed);

    for (const id of ids) {
      await callTool(fullToken, "bookmark_delete", { id });
    }
  });

  it("refuses to touch a bookmark of another workspace", async () => {
    const created = await callTool(fullToken, "bookmark_create", {
      name: "Private",
      url: "https://private.example.invalid",
      categoryId,
    });
    const id = (created.payload as { id: string }).id;

    const result = await callTool(otherWorkspaceToken, "bookmark_delete", {
      id,
    });

    expect(result.isError).toBe(true);
    expect(await db.bookmark.findUnique({ where: { id } })).not.toBe(null);
    await callTool(fullToken, "bookmark_delete", { id });
  });

  it("denies the write tools to a read-only bookmarks token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "bookmarks-ro", [
        "bookmarks:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "bookmark_categories_list",
      "bookmark_favicon_suggest",
      "bookmarks_get",
      "bookmarks_search",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "bookmark_category_create",
      arguments: { name: "Should not exist" },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(
      await db.category.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});

describe("contacts tools", () => {
  async function createContact(name: string, email: string) {
    const result = await callTool(fullToken, "contacts_create", {
      firstName: name,
      fields: [{ kind: "EMAIL", value: email, isPrimary: true }],
    });
    return (result.payload as { id: string }).id;
  }

  it("creates, reads, updates and deletes a contact", async () => {
    const id = await createContact("Ada", "ada@example.invalid");

    const read = await callTool(fullToken, "contacts_get", { contactId: id });
    expect((read.payload as { displayName: string }).displayName).toContain(
      "Ada",
    );

    const updated = await callTool(fullToken, "contacts_update", {
      contactId: id,
      firstName: "Ada",
      lastName: "Lovelace",
      fields: [{ kind: "EMAIL", value: "ada@example.invalid" }],
    });
    expect((updated.payload as { displayName: string }).displayName).toBe(
      "Ada Lovelace",
    );

    const deleted = await callTool(fullToken, "contacts_delete", {
      contactId: id,
    });
    expect(deleted.payload).toEqual({ deleted: id });
    expect(await db.contact.findUnique({ where: { id } })).toBeNull();
  });

  it("groups duplicates and merges them into one record", async () => {
    const primary = await createContact("Grace", "grace@example.invalid");
    const duplicate = await createContact("Grace", "grace@example.invalid");

    const groups = await callTool(fullToken, "contacts_duplicates", {});
    const found = (
      groups.payload as Array<{ contacts: Array<{ id: string }> }>
    ).find((group) => group.contacts.some((entry) => entry.id === primary));
    expect(found?.contacts.map((entry) => entry.id).sort()).toEqual(
      [primary, duplicate].sort(),
    );

    const merged = await callTool(fullToken, "contacts_merge", {
      primaryId: primary,
      otherIds: [duplicate],
    });
    expect((merged.payload as { id: string }).id).toBe(primary);
    expect(
      await db.contact.findUnique({ where: { id: duplicate } }),
    ).toBeNull();

    await callTool(fullToken, "contacts_delete", { contactId: primary });
  });

  it("stars and deletes many contacts in one call", async () => {
    const ids = await Promise.all([
      createContact("Bulk one", "bulk1@example.invalid"),
      createContact("Bulk two", "bulk2@example.invalid"),
    ]);

    const starred = await callTool(fullToken, "contacts_bulk", {
      contactIds: ids,
      action: { type: "star", starred: true },
    });
    expect(starred.payload).toEqual({ updated: 2 });
    expect(
      await db.contact.count({ where: { id: { in: ids }, starred: true } }),
    ).toBe(2);

    const removed = await callTool(fullToken, "contacts_bulk", {
      contactIds: ids,
      action: { type: "delete" },
    });
    expect(removed.payload).toEqual({ updated: 2 });
    expect(await db.contact.count({ where: { id: { in: ids } } })).toBe(0);
  });

  it("ignores foreign ids in a bulk action rather than failing", async () => {
    const mine = await createContact("Mine", "mine@example.invalid");

    const result = await callTool(otherWorkspaceToken, "contacts_bulk", {
      contactIds: [mine],
      action: { type: "delete" },
    });

    expect(result.payload).toEqual({ updated: 0 });
    expect(await db.contact.findUnique({ where: { id: mine } })).not.toBe(null);
    await callTool(fullToken, "contacts_delete", { contactId: mine });
  });

  it("manages contact labels and reports a duplicate name as a tool error", async () => {
    const created = await callTool(fullToken, "contact_label_create", {
      name: "Suppliers",
      color: "GREEN",
    });
    const labelId = (created.payload as { id: string }).id;

    const duplicate = await callTool(fullToken, "contact_label_create", {
      name: "suppliers",
      color: "BLUE",
    });
    expect(duplicate.isError).toBe(true);

    const renamed = await callTool(fullToken, "contact_label_update", {
      id: labelId,
      name: "Vendors",
    });
    expect((renamed.payload as { name: string }).name).toBe("Vendors");

    const removed = await callTool(fullToken, "contact_label_delete", {
      id: labelId,
    });
    expect(removed.payload).toEqual({ deleted: labelId });
  });

  it("imports a vCard and exports the address book as text", async () => {
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      "FN:Imported Person",
      "N:Person;Imported;;;",
      "EMAIL:imported@example.invalid",
      "END:VCARD",
    ].join("\r\n");

    const imported = await callTool(fullToken, "contacts_import", {
      content: vcard,
    });
    expect(imported.payload).toMatchObject({ format: "vcard", created: 1 });

    const exported = await callTool(fullToken, "contacts_export", {
      format: "vcard-4.0",
      query: "Imported Person",
    });
    expect(exported.payload).toMatchObject({ count: 1 });
    expect((exported.payload as { content: string }).content).toContain(
      "Imported Person",
    );

    const suggestions = await callTool(fullToken, "contacts_suggest", {
      query: "imported",
    });
    expect(
      (suggestions.payload as Array<{ email: string }>).map(
        (entry) => entry.email,
      ),
    ).toContain("imported@example.invalid");

    const found = await callTool(fullToken, "contacts_list", {
      query: "Imported Person",
    });
    const contactId = (found.payload as { contacts: Array<{ id: string }> })
      .contacts[0].id;
    await callTool(fullToken, "contacts_delete", { contactId });
  });

  it("denies the write tools to a read-only contacts token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "contacts-ro", [
        "contacts:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "contact_labels_list",
      "contacts_duplicates",
      "contacts_export",
      "contacts_get",
      "contacts_list",
      "contacts_suggest",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "contacts_create",
      arguments: { firstName: "Should not exist" },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(
      await db.contact.count({ where: { firstName: "Should not exist" } }),
    ).toBe(0);
  });
});

describe("messages read state and channel lookup", () => {
  it("reads one channel by id and refuses a foreign one", async () => {
    const { payload } = await callTool(fullToken, "message_channel_get", {
      channelId,
    });
    expect((payload as { id: string }).id).toBe(channelId);

    const foreign = await callTool(otherWorkspaceToken, "message_channel_get", {
      channelId,
    });
    expect(foreign.isError).toBe(true);
  });

  it("clears a channel's unread messages", async () => {
    await callTool(fullToken, "message_send", {
      channelId,
      content: "unread until the agent marks it",
    });
    expect(
      await db.message.count({ where: { channelId, isRead: false } }),
    ).toBeGreaterThan(0);

    const { payload } = await callTool(fullToken, "message_channel_mark_read", {
      channelId,
    });

    expect((payload as { updated: number }).updated).toBeGreaterThan(0);
    expect(
      await db.message.count({ where: { channelId, isRead: false } }),
    ).toBe(0);
  });

  it("keeps mark-read behind the write scope", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "messages-ro", [
        "messages:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "channel_webhooks_list",
      "message_categories_list",
      "message_channel_get",
      "messages_list",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "message_channel_mark_read",
      arguments: { channelId },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
  });
});

describe("kanban tools", () => {
  // Runs under a fresh full-scope token: this suite plus the ones above
  // would push the shared fullToken past its per-token request budget
  // (WEBHOOK_RATE_LIMIT) and the limiter would answer 429s.
  let fullToken: string;

  beforeAll(async () => {
    fullToken = (
      await webhookTokensService.create(workspaceId, "kanban", MCP_SCOPES)
    ).token;
  });

  async function board(name: string) {
    const created = await callTool(fullToken, "kanban_board_create", { name });
    return (created.payload as { id: string }).id;
  }

  async function column(boardId: string, name: string, isDone = false) {
    const created = await callTool(fullToken, "kanban_column_create", {
      boardId,
      name,
      color: "BLUE",
      isDone,
    });
    return (created.payload as { id: string }).id;
  }

  it("builds a board, moves a card into a terminal column and completes it", async () => {
    const boardId = await board("Agent board");
    const todo = await column(boardId, "Todo");
    const done = await column(boardId, "Done", true);

    const created = await callTool(fullToken, "kanban_card_create", {
      columnId: todo,
      title: "Rotate the API token",
      priority: "HIGH",
    });
    const cardId = (created.payload as { id: string }).id;
    expect(created.payload).toMatchObject({ priority: "HIGH", columnId: todo });

    const moved = await callTool(fullToken, "kanban_card_move", {
      cardId,
      columnId: done,
    });
    expect(moved.payload).toMatchObject({ columnId: done });
    expect(
      (await db.kanbanCard.findUnique({ where: { id: cardId } }))?.completedAt,
    ).not.toBeNull();

    const read = await callTool(fullToken, "kanban_board_get", { boardId });
    expect(
      (
        read.payload as { columns: Array<{ id: string; cards: unknown[] }> }
      ).columns.find((entry) => entry.id === done)?.cards,
    ).toHaveLength(1);
  });

  it("updates a card, sets its labels and deletes it", async () => {
    const boardId = await board("Card lifecycle");
    const columnId = await column(boardId, "Backlog");
    const created = await callTool(fullToken, "kanban_card_create", {
      columnId,
      title: "Draft",
    });
    const cardId = (created.payload as { id: string }).id;

    const label = await callTool(fullToken, "kanban_label_create", {
      name: "Ops",
      color: "AMBER",
    });
    const labelId = (label.payload as { id: string }).id;

    const updated = await callTool(fullToken, "kanban_card_update", {
      id: cardId,
      title: "Drafted",
      priority: "URGENT",
    });
    expect(updated.payload).toMatchObject({
      title: "Drafted",
      priority: "URGENT",
    });

    const labelled = await callTool(fullToken, "kanban_card_labels_set", {
      cardId,
      labelIds: [labelId],
    });
    expect(
      (labelled.payload as { labels: Array<{ id: string }> }).labels,
    ).toEqual([expect.objectContaining({ id: labelId })]);

    const cleared = await callTool(fullToken, "kanban_card_labels_set", {
      cardId,
      labelIds: [],
    });
    expect((cleared.payload as { labels: unknown[] }).labels).toEqual([]);

    const deleted = await callTool(fullToken, "kanban_card_delete", {
      id: cardId,
    });
    expect(deleted.payload).toEqual({ deleted: cardId });
    expect(
      await db.kanbanCard.findUnique({ where: { id: cardId } }),
    ).toBeNull();
  });

  it("keeps a checklist and comments on a card", async () => {
    const boardId = await board("Checklist board");
    const columnId = await column(boardId, "Doing");
    const created = await callTool(fullToken, "kanban_card_create", {
      columnId,
      title: "Release checklist",
    });
    const cardId = (created.payload as { id: string }).id;

    const item = await callTool(fullToken, "kanban_checklist_add", {
      cardId,
      text: "Tag the release",
    });
    const itemId = (item.payload as { id: string }).id;

    const ticked = await callTool(fullToken, "kanban_checklist_update", {
      itemId,
      isDone: true,
    });
    expect((ticked.payload as { isDone: boolean }).isDone).toBe(true);

    const listed = await callTool(fullToken, "kanban_checklist_list", {
      cardId,
    });
    expect(listed.payload).toHaveLength(1);

    const comment = await callTool(fullToken, "kanban_comment_add", {
      cardId,
      body: "Blocked on the migration.",
    });
    // A comment an agent writes carries the token name, so the board shows
    // which agent wrote it.
    expect((comment.payload as { authorName: string }).authorName).toBe(
      "kanban",
    );
    const commentId = (comment.payload as { id: string }).id;

    const comments = await callTool(fullToken, "kanban_comments_list", {
      cardId,
    });
    expect(comments.payload).toHaveLength(1);

    const removedComment = await callTool(fullToken, "kanban_comment_delete", {
      commentId,
    });
    expect(removedComment.payload).toEqual({ deleted: commentId });

    const removedItem = await callTool(fullToken, "kanban_checklist_delete", {
      itemId,
    });
    expect(removedItem.payload).toEqual({ deleted: itemId });
  });

  it("refuses to delete a comment another author wrote", async () => {
    const boardId = await board("Authorship board");
    const columnId = await column(boardId, "Notes");
    const created = await callTool(fullToken, "kanban_card_create", {
      columnId,
      title: "Operator note",
    });
    const cardId = (created.payload as { id: string }).id;

    const comment = await db.kanbanComment.create({
      data: {
        workspaceId,
        cardId,
        cardWorkspaceId: workspaceId,
        authorOperatorId: "some-operator",
        authorName: "Operator",
        body: "Written by a person.",
      },
    });

    const result = await callTool(fullToken, "kanban_comment_delete", {
      commentId: comment.id,
    });

    expect(result.isError).toBe(true);
    expect(
      await db.kanbanComment.findUnique({ where: { id: comment.id } }),
    ).not.toBe(null);
  });

  it("reorders boards and columns", async () => {
    const first = await board("Order one");
    // createBoard seeds Backlog/In progress/Done (kanban.ts
    // DEFAULT_COLUMNS); this test asserts an exact column order, so clear
    // the seed columns before adding its own pair.
    await db.kanbanColumn.deleteMany({ where: { boardId: first } });
    const second = await board("Order two");
    const reordered = await callTool(fullToken, "kanban_boards_reorder", {
      order: [second, first],
    });
    expect(reordered.payload).toEqual({ reordered: true });
    const boards = await db.kanbanBoard.findMany({
      where: { id: { in: [first, second] } },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(boards.map((entry) => entry.id)).toEqual([second, first]);

    const left = await column(first, "Left");
    const right = await column(first, "Right");
    const columnsReordered = await callTool(
      fullToken,
      "kanban_columns_reorder",
      { boardId: first, order: [right, left] },
    );
    expect(columnsReordered.payload).toEqual({ reordered: true });
    const columns = await db.kanbanColumn.findMany({
      where: { boardId: first },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    expect(columns.map((entry) => entry.id)).toEqual([right, left]);
  });

  it("reports a card missing its link partner as bad arguments", async () => {
    const boardId = await board("Link board");
    const columnId = await column(boardId, "Inbox");

    const result = await callTool(fullToken, "kanban_card_create", {
      columnId,
      title: "Half a link",
      linkedType: "SERVICE",
    });

    expect(result.isError).toBe(true);
    expect(await db.kanbanCard.count({ where: { title: "Half a link" } })).toBe(
      0,
    );
  });

  it("refuses to touch a card of another workspace", async () => {
    const boardId = await board("Private board");
    const columnId = await column(boardId, "Private");
    const created = await callTool(fullToken, "kanban_card_create", {
      columnId,
      title: "Private card",
    });
    const cardId = (created.payload as { id: string }).id;

    const result = await callTool(otherWorkspaceToken, "kanban_card_delete", {
      id: cardId,
    });

    expect(result.isError).toBe(true);
    expect(await db.kanbanCard.findUnique({ where: { id: cardId } })).not.toBe(
      null,
    );
  });

  it("never offers a board or column delete, even at full scope", async () => {
    const names = await listToolNames(fullToken);

    expect(names).not.toContain("kanban_board_delete");
    expect(names).not.toContain("kanban_column_delete");
  });

  it("denies the write tools to a read-only kanban token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "kanban-ro", [
        "kanban:read",
      ])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "kanban_board_get",
      "kanban_boards_list",
      "kanban_card_get",
      "kanban_cards_search",
      "kanban_checklist_list",
      "kanban_comments_list",
      "kanban_labels_list",
      "kanban_link_targets_list",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "kanban_board_create",
      arguments: { name: "Should not exist" },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(
      await db.kanbanBoard.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});

// The workspace's WEBHOOK account has no IMAP or SMTP transport, and
// mail-actions skips the driver for a webhook item — so read state, moves,
// deletes and labels run here without a network, while the two paths that
// genuinely need a transport are asserted through their refusals.
describe("mail write tools", () => {
  // The suites above spend the shared fullToken's per-token request budget
  // (WEBHOOK_RATE_LIMIT, keyed by token id — webhooks/ratelimit.ts), and
  // every later request would answer 429, so this suite runs under a fresh
  // full-scope token.
  let fullToken: string;

  beforeAll(async () => {
    fullToken = (
      await webhookTokensService.create(workspaceId, "mail-write", MCP_SCOPES)
    ).token;
  });

  async function seedMail(subject: string) {
    const { id } = await mailService.create(workspaceId, {
      sender: "ops@example.invalid",
      subject,
      body: `Body of ${subject}.`,
    });
    return id;
  }

  it("marks a message read, moves it and deletes it", async () => {
    const id = await seedMail("agent-lifecycle");
    const mailbox =
      await mailAccountsService.getOrCreateWebhookAccount(workspaceId);
    const archive = await db.mailFolder.create({
      data: {
        workspaceId,
        accountId: mailbox.account.id,
        accountWorkspaceId: workspaceId,
        name: "Agent archive",
        path: "AgentArchive",
        specialUse: "ARCHIVE",
      },
    });

    const marked = await callTool(fullToken, "mail_set_read", {
      id,
      isRead: true,
    });
    expect(marked.payload).toEqual({ id, isRead: true });

    const moved = await callTool(fullToken, "mail_move", {
      id,
      targetFolderId: archive.id,
    });
    expect(moved.payload).toEqual({ id, folderId: archive.id });

    // The webhook account has no Trash, so the first delete is permanent.
    const deleted = await callTool(fullToken, "mail_delete", { id });
    expect(deleted.payload).toEqual({ id, status: "deleted" });
    expect(await db.mailItem.findUnique({ where: { id } })).toBeNull();
  });

  it("puts a label on a message and takes it off again", async () => {
    const id = await seedMail("agent-labelled");
    const label = await callTool(fullToken, "mail_label_create", {
      name: "Invoices",
      color: "GREEN",
    });
    const labelId = (label.payload as { id: string }).id;

    await callTool(fullToken, "mail_label_assign", { id, labelId });
    expect(
      await db.mailItemLabel.count({ where: { mailItemId: id, labelId } }),
    ).toBe(1);

    const removed = await callTool(fullToken, "mail_label_remove", {
      id,
      labelId,
    });
    expect(removed.payload).toEqual({ id, labelId, removed: true });

    const renamed = await callTool(fullToken, "mail_label_update", {
      id: labelId,
      color: "AMBER",
    });
    expect((renamed.payload as { color: string }).color).toBe("AMBER");

    const gone = await callTool(fullToken, "mail_label_delete", {
      id: labelId,
    });
    expect(gone.payload).toEqual({ deleted: labelId });
  });

  it("manages an account's filter rules", async () => {
    const mailbox =
      await mailAccountsService.getOrCreateWebhookAccount(workspaceId);
    const label = await callTool(fullToken, "mail_label_create", {
      name: "From ops",
      color: "RED",
    });
    const labelId = (label.payload as { id: string }).id;

    const created = await callTool(fullToken, "mail_filter_rule_create", {
      accountId: mailbox.account.id,
      labelId,
      name: "Ops mail",
      conditions: [
        {
          field: "FROM_ADDRESS",
          operator: "CONTAINS",
          value: "ops@example.invalid",
          isNegated: false,
        },
      ],
    });
    const ruleId = (created.payload as { id: string }).id;

    const listed = await callTool(fullToken, "mail_filter_rules_list", {
      accountId: mailbox.account.id,
    });
    expect(
      (listed.payload as Array<{ id: string }>).map((entry) => entry.id),
    ).toEqual([ruleId]);

    const paused = await callTool(fullToken, "mail_filter_rule_update", {
      id: ruleId,
      isActive: false,
    });
    expect((paused.payload as { isActive: boolean }).isActive).toBe(false);

    const removed = await callTool(fullToken, "mail_filter_rule_delete", {
      id: ruleId,
    });
    expect(removed.payload).toEqual({ deleted: ruleId });
    await callTool(fullToken, "mail_label_delete", { id: labelId });
  });

  it("reports a rule with no predicate as bad arguments", async () => {
    const mailbox =
      await mailAccountsService.getOrCreateWebhookAccount(workspaceId);
    const label = await callTool(fullToken, "mail_label_create", {
      name: "No predicate",
      color: "SLATE",
    });
    const labelId = (label.payload as { id: string }).id;

    const result = await callTool(fullToken, "mail_filter_rule_create", {
      accountId: mailbox.account.id,
      labelId,
      name: "Empty rule",
    });

    expect(result.isError).toBe(true);
    expect(
      await db.mailFilterRule.count({ where: { name: "Empty rule" } }),
    ).toBe(0);
    await callTool(fullToken, "mail_label_delete", { id: labelId });
  });

  it("returns an attachment base64-encoded", async () => {
    const id = await seedMail("agent-attachment");
    const content = Buffer.from("report,rows\n1,2\n", "utf8");
    const attachment = await db.mailAttachment.create({
      data: {
        mailItemId: id,
        filename: "report.csv",
        contentType: "text/csv",
        sizeBytes: content.byteLength,
        content,
      },
    });

    const { payload } = await callTool(fullToken, "mail_attachment_get", {
      id,
      attachmentId: attachment.id,
    });

    expect(payload).toMatchObject({
      filename: "report.csv",
      contentType: "text/csv",
    });
    expect(
      Buffer.from(
        (payload as { contentBase64: string }).contentBase64,
        "base64",
      ).toString("utf8"),
    ).toBe("report,rows\n1,2\n");
  });

  it("refuses to sync the inbound-only webhook account", async () => {
    const mailbox =
      await mailAccountsService.getOrCreateWebhookAccount(workspaceId);

    const result = await callTool(fullToken, "mail_sync_start", {
      accountId: mailbox.account.id,
    });

    expect(result.isError).toBe(true);
  });

  it("never offers account management, even at full scope", async () => {
    const names = await listToolNames(fullToken);

    for (const forbidden of [
      "mail_account_create",
      "mail_account_update",
      "mail_account_delete",
      "mail_account_test",
    ]) {
      expect(names).not.toContain(forbidden);
    }
  });

  it("denies the write tools to a read-only mail token", async () => {
    const readOnly = (
      await webhookTokensService.create(workspaceId, "mail-ro", ["mail:read"])
    ).token;

    expect(await listToolNames(readOnly)).toEqual([
      "mail_accounts_list",
      "mail_attachment_get",
      "mail_filter_rules_list",
      "mail_filter_run_get",
      "mail_folders_list",
      "mail_get",
      "mail_labels_list",
      "mail_search",
    ]);

    const body = await rpc(readOnly, "tools/call", {
      name: "mail_label_create",
      arguments: { name: "Should not exist", color: "BLUE" },
    });
    expect(body.error ?? body.result?.isError).toBeTruthy();
    expect(
      await db.mailLabel.count({ where: { name: "Should not exist" } }),
    ).toBe(0);
  });
});
