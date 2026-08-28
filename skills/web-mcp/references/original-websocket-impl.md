# Original WebMCP (WebSocket Bridge)

Jason McGhee's `@jason.today/webmcp` — a WebSocket-based bridge that lets websites expose MCP tools/resources/prompts to desktop MCP clients (Claude Desktop, Cursor, Cline, Windsurf).

> This implementation is NOT compliant with the W3C WebMCP spec. It predates and inspired the W3C effort.

## Architecture

```
MCP Client (Claude Desktop / Cursor / etc.)
    |
    | stdio transport
    v
server.js (MCP Server)
    |
    | WebSocket ws://localhost:4797/mcp
    v
websocket-server.js (WebSocket Hub)
    |
    | WebSocket (domain-based channels)
    v
Web Page (webmcp.js widget)
```

- **Localhost-only** WebSocket server (port 4797 by default)
- **Token-based authentication** — registration tokens are single-use
- **Domain-scoped channels** — tools from different sites are isolated and prefixed
- The widget appears as a small blue square in the page corner

## Installation

### For End Users

```bash
# Auto-configure MCP client
npx -y @jason.today/webmcp@latest --config claude
# Supported: claude, cursor, cline, windsurf, or path to JSON config
```

### Manual MCP Config (Claude Desktop)

Settings > Developer > Edit Config:

```json
{
  "mcpServers": {
    "webmcp": {
      "command": "npx",
      "args": ["-y", "@jason.today/webmcp@latest", "--mcp"]
    }
  }
}
```

### For Website Owners

```html
<script src="webmcp.js"></script>
```

Download from GitHub releases. The widget auto-initializes.

## CLI Commands

| Command | Description |
|---------|-------------|
| `npx @jason.today/webmcp --config <client>` | Auto-configure MCP client |
| `npx @jason.today/webmcp --new` | Generate registration token |
| `npx @jason.today/webmcp -q` | Stop the server |
| `npx @jason.today/webmcp -f` | Run in foreground |
| `npx @jason.today/webmcp --clean` | Remove all tokens |

## Widget Customization

```javascript
const mcp = new WebMCP({
  color: "#4CAF50",
  position: "top-right",  // top-left, top-right, bottom-left, bottom-right
  size: "40px",
  padding: "15px"
});
```

## Registering Tools

```javascript
mcp.registerTool(
  "weather",
  "Get weather information for a location",
  {
    location: { type: "string", description: "City name" }
  },
  async (args) => {
    const data = await fetchWeather(args.location);
    return {
      content: [{
        type: "text",
        text: `Weather for ${args.location}: ${data.temp}°C, ${data.condition}`
      }]
    };
  }
);
```

## Registering Prompts

```javascript
mcp.registerPrompt(
  "git-commit",
  "Generate a Git commit message",
  [
    {
      name: "changes",
      description: "Git diff or description of changes",
      required: true
    }
  ],
  (args) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Generate a commit message for:\n\n${args.changes}`
      }
    }]
  })
);
```

## Registering Resources

```javascript
// Static URI
mcp.registerResource(
  "page-content",
  "Current page content",
  { uri: "page://current", mimeType: "text/html" },
  (uri) => ({
    contents: [{
      uri,
      mimeType: "text/html",
      text: document.body.innerHTML
    }]
  })
);

// URI Template
mcp.registerResource(
  "element-content",
  "Content of a DOM element by ID",
  { uriTemplate: "element://{elementId}", mimeType: "text/html" },
  (uri) => {
    const id = uri.replace("element://", "");
    const el = document.getElementById(id);
    if (!el) throw new Error(`Element "${id}" not found`);
    return {
      contents: [{ uri, mimeType: "text/html", text: el.innerHTML }]
    };
  }
);
```

## Sampling

The server supports MCP sampling — requesting LLM completions through the MCP client. A modal dialog asks the user to provide a response.

## MCP Capabilities

```javascript
{
  tools: { listChanged: true },
  prompts: { listChanged: true },
  resources: { listChanged: true, subscribe: true },
  sampling: {}
}
```

## Built-In Tools

1. **`_webmcp_get-token`** — generates a registration token for connecting websites
2. **`_webmcp_define-mcp-tool`** — helps define tool schemas interactively

## Channel Naming

Domains become channels by replacing `.` and `:` with `_`:
- `example.com` → `/example_com`
- `localhost:4797` → `/localhost_4797`

Tools are prefixed: tool `search` on `example.com` → `example_com-search`.

## Timeouts

| Operation | Timeout |
|-----------|---------|
| Tool calls | 30s |
| Sampling requests | 120s |
| Empty channel cleanup | 60s |
| Registration | 30s |
| Widget inactivity | 5min |
| WebSocket reconnect | 5s |

## Configuration Files

All stored in `~/.webmcp/`:

| File | Contents |
|------|----------|
| `.env` | `WEBMCP_SERVER_TOKEN=<hex>` (auto-generated) |
| `.webmcp-tokens.json` | Authorized channel-token pairs |
| `.webmcp-server.pid` | Running daemon PID |

## Docker Support

```yaml
version: "3"
services:
  webmcp:
    image: node:18-alpine
    working_dir: /app
    volumes:
      - ./:/app
    ports:
      - "4797:4797"
    command: npx -y @jason.today/webmcp@latest --port 4797
```

Use `--docker` flag alongside `--mcp` in MCP client config when running in Docker.

## W3C Standard vs Original Implementation

| Aspect | W3C WebMCP | Original WebMCP |
|--------|-----------|-----------------|
| API | `document.modelContext` | `new WebMCP()` widget |
| Transport | In-browser (no protocol) | WebSocket via localhost |
| Requires | Chrome 149+ with flag/origin trial | Any browser + Node.js |
| MCP features | Tools only (resources/prompts not in spec) | Tools, Prompts, Resources, Sampling |
| Lifecycle | Ephemeral (page open) | Persistent daemon |
| Agent type | Browser-native agents | Desktop MCP clients |
| Cross-origin | `exposedTo` + permissions policy | Domain-scoped channels |
| Security | Origin isolation, permissions policy | Token-based auth |
| Spec status | W3C Draft Community Group Report | MIT-licensed npm package |
