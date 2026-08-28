# WebMCP Cross-Origin Tools & Permissions

## Permissions Policy

WebMCP is gated by the `"tools"` permissions policy feature:

- **Default allowlist:** `['self']` — same-origin documents only
- **Top-level documents:** enabled by default
- **Same-origin iframes:** enabled by default
- **Cross-origin iframes:** disabled unless explicitly allowed

### Enabling in Cross-Origin Iframes

```html
<iframe src="https://chat-widget.example" allow="tools"></iframe>
```

### Disabling via HTTP Header

```
Permissions-Policy: tools=()
```

When `"tools"` permission is denied, `registerTool()` rejects with `NotAllowedError`.

## Cross-Origin Tool Exposure

By default, tools registered on one origin are invisible to documents from other origins. Both sides must opt in:

### Tool Provider Side: `exposedTo`

```javascript
// On https://partner.org
await document.modelContext.registerTool({
  name: "shared_inventory",
  description: "Returns product inventory data.",
  annotations: { readOnlyHint: true },
  inputSchema: {
    type: "object",
    properties: {
      sku: { type: "string" }
    },
    required: ["sku"]
  },
  execute: async ({ sku }) => {
    return await getInventory(sku);
  }
}, {
  exposedTo: ["https://trusted.com", "https://example.com"]
});
```

**WebIDL:**

```webidl
dictionary ModelContextRegisterToolOptions {
  sequence<USVString> exposedTo;
  AbortSignal signal;
};

dictionary ModelContextGetToolOptions {
  sequence<USVString> fromOrigins;
};
```

**Rules for `exposedTo`:**
- Each origin must be a valid, parseable URL
- Each origin must be potentially trustworthy (HTTPS or localhost)
- Invalid or untrusted origins cause `SecurityError` rejection
- An empty array means same-origin only (default behavior)

### Tool Consumer Side: `getTools({ fromOrigins })`

```javascript
// On https://trusted.com
const tools = await document.modelContext.getTools({
  fromOrigins: ["https://partner.org"]
});

// tools will include "shared_inventory" from partner.org
```

### Executing Cross-Origin Tools

```javascript
const tool = tools.find(t => t.name === "shared_inventory");
const resultJson = await document.modelContext.executeTool(
  tool,
  { sku: "WIDGET-42" }   // plain object, not JSON.stringify(...)
);
const result = JSON.parse(resultJson); // executeTool() resolves to a JSON string
```

## Visibility Algorithm

A tool is visible to a target origin when:

```
tool_is_visible(tool_owner_origin, exposed_origins, target_origin):
  1. If tool_owner_origin same-origin with target_origin → true
  2. For each origin in exposed_origins:
     if origin same-origin with target_origin → true
  3. Return false
```

## Default Exposure to Browser's Built-In Agent

The spec does **not** prescribe whether iframe-hosted tools are exposed to the browser's built-in agent by default — when and which tools a browser agent observes is implementation-defined (the spec only says observations may happen "at any time" for any top-level browsing context). Don't rely on iframe tools being hidden from the agent by default: if you need to control this, use `exposedTo` explicitly rather than assuming iframe isolation.

## Tool Change Notifications Across Origins

When a tool is registered or unregistered, `toolchange` fires across the **entire traversable** (every navigable in the tool owner's tab/window — not just descendants of the tool's document), filtered by two conditions per recipient document:

1. The document must be allowed to use the `"tools"` permissions policy feature (otherwise it's skipped even if visibility would allow it)
2. The tool must pass the [visibility algorithm](#visibility-algorithm) for that document's origin

The events propagate asynchronously via the `webmcp task source`.

```javascript
// In a parent document
document.modelContext.addEventListener("toolchange", async () => {
  const tools = await document.modelContext.getTools({
    fromOrigins: ["https://widget.example"]
  });
  console.log("Available tools updated:", tools.map(t => t.name));
});
```

## Origin-Keying Requirement

WebMCP requires the document to be **origin-keyed**. If `document.domain` has been set (breaking origin isolation), `registerTool()` rejects with `SecurityError`.

This is detected via the `Origin-Agent-Cluster` header:
- `Origin-Agent-Cluster: ?1` (or default in modern Chrome) — origin-keyed, WebMCP works
- `Origin-Agent-Cluster: ?0` — not origin-keyed, WebMCP is disabled

Exception: `file://` scheme documents are always allowed (for local development).

## Common Patterns

### Embedding a Tool Provider Widget

```html
<!-- Main page on https://myapp.com -->
<iframe
  src="https://ai-tools-provider.example/widget"
  allow="tools"
  style="display: none;">
</iframe>
```

```javascript
// Inside the iframe (https://ai-tools-provider.example)
await document.modelContext.registerTool({
  name: "ai_summarize",
  description: "Summarize the current page content.",
  execute: async () => {
    // Access parent page content via postMessage or shared API
    return { summary: "..." };
  }
}, {
  exposedTo: ["https://myapp.com"]
});
```

### Multi-Origin Tool Aggregation

```javascript
// Aggregate tools from multiple trusted partners
const allTools = await document.modelContext.getTools({
  fromOrigins: [
    "https://analytics.partner.com",
    "https://crm.partner.com",
    "https://inventory.partner.com"
  ]
});

console.log(`Found ${allTools.length} tools across partners`);
```

### Security: Read-Only vs Read-Write Exposure

```javascript
// Safe: expose read-only data tool
await document.modelContext.registerTool({
  name: "get_public_catalog",
  description: "Returns the public product catalog.",
  annotations: { readOnlyHint: true },
  execute: async () => getCatalog()
}, { exposedTo: ["https://any-trusted-site.com"] });

// Dangerous: think carefully before exposing write tools
await document.modelContext.registerTool({
  name: "place_order",
  description: "Places an order for the specified products.",
  execute: async (input) => placeOrder(input)
}, { exposedTo: ["https://very-trusted-partner.com"] });
// Only expose state-changing tools to origins you'd trust with user actions
```

## Open Spec Issues

These are under active discussion and may change:

- **Cross-top-level-document execution** (#227) — not yet supported
- **Unregistration/re-registration race** (#92) — schema-mismatch race condition between a tool being unregistered and re-registered
- **Name/title/description size limits** (#73) — still unresolved
- **`toolcanceled`/`toolactivated` events** (#146) — not yet fully specified

## Chrome Extensions

Chrome Extensions can query and execute WebMCP tools using content scripts. Extensions with `host_permission` can manipulate pages via custom JavaScript even without WebMCP — this is existing capability, not a new attack surface.
