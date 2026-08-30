#!/usr/bin/env node
// Dependency-free CLI for the Inspoter agent surface.
//
//   node inspoter.mjs tools [substring]        list the tools this token may call
//   node inspoter.mjs schema <tool>            print one tool's JSON Schema
//   node inspoter.mjs call <tool> ['<json>']   tools/call over POST /api/mcp
//   node inspoter.mjs rest <METHOD> <path> ['<json>'] [--idempotency-key <key>]
//                                                    plain /api/v1 request
//
// Environment: INSPOTER_URL (origin, e.g. https://dashboard.example.com)
//              INSPOTER_TOKEN (workspace API token)
//
// The token is read from the environment and never printed. /api/mcp is
// stateless Streamable HTTP: a single JSON-RPC POST, no initialize handshake,
// and the answer arrives either as JSON or as one SSE data frame.

const url = process.env.INSPOTER_URL?.replace(/\/+$/, "");
const token = process.env.INSPOTER_TOKEN;

function die(message) {
  console.error(message);
  process.exit(1);
}

if (!url || !token) {
  die("Set INSPOTER_URL and INSPOTER_TOKEN before calling this script.");
}

function parseJsonArg(raw, label) {
  if (raw === undefined) return {};
  try {
    return JSON.parse(raw);
  } catch (error) {
    die(`${label} is not valid JSON: ${error.message}`);
  }
}

function parseRestArgs(args) {
  const method = (
    args[0] ??
    die("Usage: rest <METHOD> <path> ['<json body>'] [--idempotency-key <key>]")
  ).toUpperCase();
  const path =
    args[1] ??
    die(
      "Usage: rest <METHOD> <path> ['<json body>'] [--idempotency-key <key>]",
    );
  let body;
  let idempotencyKey;

  for (let index = 2; index < args.length; index += 1) {
    if (args[index] === "--idempotency-key") {
      if (idempotencyKey !== undefined)
        die("--idempotency-key may be supplied only once.");
      idempotencyKey =
        args[index + 1] ?? die("--idempotency-key requires a value.");
      index += 1;
      continue;
    }
    if (body !== undefined) die(`Unexpected REST argument: ${args[index]}`);
    body = args[index];
  }

  return { method, path, body, idempotencyKey };
}

// The handler answers with a plain JSON body or an SSE stream depending on
// whether it emitted anything before the result; accept both.
async function readJsonRpc(response) {
  const text = await response.text();
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    return JSON.parse(text);
  }
  const frame = text
    .split("\n")
    .reverse()
    .find((line) => line.startsWith("data:"));
  if (!frame) die(`No SSE data frame in response: ${text}`);
  return JSON.parse(frame.slice("data:".length).trim());
}

async function rpc(method, params) {
  const response = await fetch(`${url}/api/mcp`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      ...(params ? { params } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    die(`HTTP ${response.status} from /api/mcp: ${body}`);
  }

  const payload = await readJsonRpc(response);
  if (payload.error)
    die(`JSON-RPC error ${payload.error.code}: ${payload.error.message}`);
  return payload.result ?? {};
}

async function listTools() {
  const { tools = [] } = await rpc("tools/list");
  return tools;
}

const [command, ...rest] = process.argv.slice(2);

switch (command) {
  case "tools": {
    const filter = rest[0]?.toLowerCase();
    const tools = (await listTools())
      .filter((tool) => !filter || tool.name.toLowerCase().includes(filter))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const tool of tools) {
      const mark = tool.annotations?.readOnlyHint === false ? "!" : " ";
      console.log(`${mark} ${tool.name.padEnd(30)} ${tool.title ?? ""}`);
    }
    console.log(`\n${tools.length} tool(s); "!" marks a mutating tool.`);
    break;
  }

  case "schema": {
    const name = rest[0] ?? die("Usage: schema <tool>");
    const tool = (await listTools()).find(
      (candidate) => candidate.name === name,
    );
    if (!tool) die(`No tool named ${name} — this token may lack its scope.`);
    console.log(JSON.stringify(tool.inputSchema, null, 2));
    break;
  }

  case "call": {
    const name = rest[0] ?? die("Usage: call <tool> ['<json args>']");
    const args = parseJsonArg(rest[1], "Tool arguments");
    const result = await rpc("tools/call", { name, arguments: args });
    const text =
      result.content?.map((part) => part.text ?? "").join("\n") ?? "";
    if (result.isError) {
      console.error(text);
      process.exit(2);
    }
    console.log(text);
    break;
  }

  case "rest": {
    const { method, path, body, idempotencyKey } = parseRestArgs(rest);
    const hasBody = body !== undefined;
    const response = await fetch(
      `${url}${path.startsWith("/") ? path : `/${path}`}`,
      {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          ...(hasBody ? { "content-type": "application/json" } : {}),
          ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        },
        ...(hasBody
          ? { body: JSON.stringify(parseJsonArg(body, "Request body")) }
          : {}),
      },
    );
    const text = await response.text();
    try {
      console.log(JSON.stringify(JSON.parse(text), null, 2));
    } catch {
      console.log(text);
    }
    if (!response.ok) {
      console.error(`HTTP ${response.status}`);
      process.exit(2);
    }
    break;
  }

  default:
    die(
      [
        "Usage:",
        "  inspoter.mjs tools [substring]",
        "  inspoter.mjs schema <tool>",
        "  inspoter.mjs call <tool> ['<json args>']",
        "  inspoter.mjs rest <METHOD> <path> ['<json body>'] [--idempotency-key <key>]",
      ].join("\n"),
    );
}
