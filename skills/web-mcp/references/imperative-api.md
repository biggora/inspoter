# WebMCP Imperative API Reference

## Entry Point

```javascript
document.modelContext // ModelContext instance (SecureContext required)
```

> `navigator.modelContext` is deprecated as of Chrome 150. Use `document.modelContext`.

## WebIDL Definitions

```webidl
partial interface Document {
  [SecureContext, SameObject] readonly attribute ModelContext modelContext;
};

[Exposed=Window, SecureContext]
interface ModelContext : EventTarget {
  Promise<undefined> registerTool(ModelContextTool tool, optional ModelContextRegisterToolOptions options = {});
  Promise<sequence<RegisteredTool>> getTools(optional ModelContextGetToolOptions options = {});
  Promise<DOMString> executeTool(RegisteredTool tool, optional object inputObject = {}, optional ModelContextExecuteToolOptions options = {});

  attribute EventHandler ontoolchange;
};

dictionary ModelContextTool {
  required DOMString name;
  USVString title;
  required DOMString description;
  object inputSchema;
  required ToolExecuteCallback execute;
  ToolAnnotations annotations;
};

dictionary RegisteredTool {
  required DOMString name;
  DOMString title;
  required DOMString description;
  object inputSchema;
  required Window window;
  required USVString origin;
  ToolAnnotations annotations;
};

dictionary ToolAnnotations {
  boolean readOnlyHint = false;
  boolean untrustedContentHint = false;
};

dictionary ToolExecuteCallbackOptions {
  required AbortSignal signal;
};

callback ToolExecuteCallback = Promise<any> (object inputObject, ToolExecuteCallbackOptions options);

dictionary ModelContextRegisterToolOptions {
  AbortSignal signal;
  sequence<USVString> exposedTo;
};

dictionary ModelContextGetToolOptions {
  sequence<USVString> fromOrigins;
};

dictionary ModelContextExecuteToolOptions {
  AbortSignal signal;
};
```

## registerTool(tool, options)

Registers a tool that agents can discover and invoke.

### Parameters

**tool** (ModelContextTool):

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `name` | string | Yes | Unique identifier, 1-128 chars. Allowed: `[a-zA-Z0-9_.-]` |
| `title` | string | No | Human-readable label for UI. Recommended: localize to user's language |
| `description` | string | Yes | Natural language explanation of functionality. Max ~500 chars recommended |
| `inputSchema` | object | No | JSON Schema (2020-12) describing expected input parameters |
| `execute` | async function | Yes | Callback invoked when agent calls the tool. Receives `(inputObject, { signal })` — `signal` is an `AbortSignal` for this specific invocation — and returns any value |
| `annotations` | ToolAnnotations | No | Metadata hints about tool behavior |

**options** (ModelContextRegisterToolOptions):

| Property | Type | Description |
|----------|------|-------------|
| `signal` | AbortSignal | Unregisters the tool when aborted |
| `exposedTo` | string[] | Array of trusted origin URLs for cross-origin visibility |

### Tool Name Rules

- Length: 1-128 characters (inclusive)
- Allowed characters: ASCII letters (a-z, A-Z), digits (0-9), underscore (`_`), hyphen (`-`), period (`.`)
- Must be unique within a single ModelContext

### Return Value

Returns a `Promise<undefined>` that resolves when the tool is registered and all relevant documents have been notified.

### Rejection Conditions

| Error | Condition |
|-------|-----------|
| `InvalidStateError` | Document is not fully active |
| `InvalidStateError` | Tool name already registered |
| `InvalidStateError` | Name or description is empty string |
| `InvalidStateError` | Name exceeds 128 chars or contains invalid characters |
| `SecurityError` | Document is not origin-keyed (and scheme is not `file:`) |
| `SecurityError` | An origin in `exposedTo` is not parseable or not trustworthy |
| `NotAllowedError` | `"tools"` permissions policy feature is not allowed |
| `TypeError` | `inputSchema` cannot be serialized to JSON |

### Registration Algorithm (Summary)

1. Validate document is fully active
2. Check origin-keying requirements
3. Verify `"tools"` permissions policy
4. Validate name uniqueness, format, and non-emptiness
5. Serialize `inputSchema` to JSON string
6. Extract annotation hints (defaults: both `false`)
7. Process `AbortSignal` if provided (abort = unregister)
8. Parse and validate `exposedTo` origins
9. Create tool definition struct and store in tool map
10. Notify descendant documents of tool change (fires `toolchange`)
11. Resolve promise

### Examples

**Basic tool:**
```javascript
await document.modelContext.registerTool({
  name: "toggle_layer",
  description: "Control pizza layers (sauce, cheese).",
  inputSchema: {
    type: "object",
    properties: {
      layer: { type: "string", enum: ["sauce-layer", "cheese-layer"] },
      action: { type: "string", enum: ["add", "remove", "toggle"] }
    },
    required: ["layer"]
  },
  execute: async ({ layer, action }) => {
    await toggleLayer(layer, action);
    return `Performed ${action || "toggle"} on layer: ${layer}`;
  }
});
```

**Tool with AbortSignal (dynamic lifecycle):**
```javascript
const controller = new AbortController();

await document.modelContext.registerTool({
  name: "checkout",
  description: "Complete the purchase of items in the current cart.",
  inputSchema: {
    type: "object",
    properties: {
      paymentMethod: { type: "string", enum: ["card", "paypal"] }
    },
    required: ["paymentMethod"]
  },
  execute: async ({ paymentMethod }) => {
    const result = await processPurchase(paymentMethod);
    return { content: [{ type: "text", text: `Order ${result.orderId} placed.` }] };
  }
}, { signal: controller.signal });

// Later — unregister the tool:
controller.abort();
```

**Tool with annotations:**
```javascript
await document.modelContext.registerTool({
  name: "get_user_preferences",
  description: "Returns the user's saved display preferences.",
  annotations: {
    readOnlyHint: true,
    untrustedContentHint: false
  },
  inputSchema: { type: "object", properties: {} },
  execute: async () => {
    return { theme: "dark", language: "en", fontSize: 14 };
  }
});
```

## getTools(options)

Retrieves available tools accessible to the calling document.

### Parameters

| Property | Type | Description |
|----------|------|-------------|
| `fromOrigins` | string[] | Secure origins from which to retrieve cross-origin tools |

### Return Value

`Promise<sequence<RegisteredTool>>` — an array of `RegisteredTool` records:

| Property | Type | Description |
|----------|------|-------------|
| `name` | string | Tool identifier |
| `title` | string | Human-readable label, if provided |
| `description` | string | Tool description |
| `inputSchema` | object | JSON Schema describing expected input (not stringified) |
| `annotations` | object | Tool annotations |
| `origin` | string | Tool's origin |
| `window` | Window | Reference to tool's window |

### Access Rules

- By default, returns same-origin tools only
- Cross-origin tools require `fromOrigins` on the caller AND `exposedTo` on the tool
- Both sides must opt in

### Rejection Conditions

| Error | Condition |
|-------|-----------|
| `InvalidStateError` | Document is not fully active |
| `SecurityError` | Document is not origin-keyed (and scheme is not `file:`), or an origin in `fromOrigins` is not parseable/trustworthy |
| `NotAllowedError` | `"tools"` permissions policy feature is not allowed |

### Example

```javascript
const tools = await document.modelContext.getTools({
  fromOrigins: ["https://partner-site.example"]
});

for (const tool of tools) {
  console.log(`${tool.name}: ${tool.description} (from ${tool.origin})`);
}
```

## executeTool(tool, inputObject, options)

Manually execute a discovered tool (from `getTools()` results).

### Parameters

| Property | Type | Description |
|----------|------|-------------|
| `tool` | RegisteredTool | Tool object from `getTools()` |
| `inputObject` | object | Plain object with input arguments — **not** a JSON string |
| `options.signal` | AbortSignal | Allows execution cancellation |

### Return Value

`Promise<DOMString>` — the tool's result **as a JSON-stringified string**. Callers must `JSON.parse()` it themselves.

### Rejection Conditions

| Error | Condition |
|-------|-----------|
| `InvalidStateError` | Document is not fully active |
| `SecurityError` | Document is not origin-keyed (and scheme is not `file:`) |
| `NotAllowedError` | `"tools"` permissions policy feature is not allowed |
| `NotSupportedError` | The tool's origin is invalid or opaque |
| `UnknownError` | The tool no longer exists, is no longer exposed, or another internal execution failure occurred |

### Example

```javascript
const tools = await document.modelContext.getTools();
const todoTool = tools.find(t => t.name === "add-todo");

const resultJson = await document.modelContext.executeTool(
  todoTool,
  { text: "Buy groceries" }   // plain object, not JSON.stringify(...)
);
const result = JSON.parse(resultJson); // executeTool() resolves to a JSON string
```

## Events

### toolchange

Fires when the available tools list changes (tool registered, unregistered, or modified).

```javascript
document.modelContext.addEventListener("toolchange", () => {
  console.log("Tools changed — re-query with getTools()");
});

// Or via handler property:
document.modelContext.ontoolchange = () => { /* ... */ };
```

### Event Timing

Events fire asynchronously via the `webmcp task source`. Within a document tree:
- Parent `toolchange` fires before child `toolchange`
- `registerTool()` promise resolves after all `toolchange` events
- Other queued tasks (`setTimeout`) may interleave unpredictably

## ToolAnnotations

| Annotation | Default | Purpose |
|------------|---------|---------|
| `readOnlyHint` | `false` | Signals the tool only reads data — helps agents decide when to skip user confirmation |
| `untrustedContentHint` | `false` | Signals output contains user-generated or external data — agents should treat it with heightened scrutiny |

## inputSchema Format

Follows JSON Schema (draft 2020-12):

```javascript
inputSchema: {
  type: "object",
  properties: {
    query: {
      type: "string",
      description: "Search query text"
    },
    maxResults: {
      type: "number",
      description: "Maximum number of results to return"
    },
    category: {
      type: "string",
      enum: ["electronics", "clothing", "books"],
      description: "Product category to search within"
    }
  },
  required: ["query"]
}
```

Use specific types (`string`, `number`, `boolean`, `enum`) — avoid generic or loosely typed parameters. Use natural language values (`shipping: "Express"`) over ambiguous identifiers (`shipping_id: 1`).

## Internal Data Structures

**Model Context (struct):**
- `tool map`: ordered map of `string -> tool definition`

**Tool Definition (struct):**
- `name`: string
- `title`: string or null
- `description`: string
- `input schema`: stringified JSON Schema
- `execute steps`: callback invocation steps
- `read-only hint`: boolean
- `untrusted content hint`: boolean
- `exposed origins`: list of origins
