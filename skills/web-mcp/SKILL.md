---
name: web-mcp
description: "Guide for implementing WebMCP — the browser-native API that lets web pages expose structured tools to AI agents. Covers both the W3C standard (document.modelContext API, imperative and declarative approaches) and the original WebSocket-bridge implementation. Use this skill whenever the user asks about WebMCP, wants to add AI agent tools to a website, needs to expose web page functionality to browser agents, mentions 'document.modelContext', 'registerTool' in browser context, wants to create declarative tools from HTML forms, or is building any kind of browser-side MCP integration. Also use when the user mentions 'agentic web', 'tools for AI agents in the browser', or asks how to make a website work with AI assistants like Gemini, Claude, or ChatGPT browser agents."
---

# WebMCP Implementation Guide

WebMCP lets web pages expose structured tools to AI agents running in the browser. Instead of building separate backend MCP servers, you reuse existing client-side code — the tools live where your UI lives.

```
  User + Agent
       |
  [ Browser ]
       |
  document.modelContext.registerTool()
       |
  [ Your Web Page JS ]
```

## Two Approaches

| Approach | API | When to Use |
|----------|-----|-------------|
| **Imperative** | `document.modelContext.registerTool()` | Custom logic, navigation, state management, complex tools |
| **Declarative** | `toolname` / `tooldescription` HTML attributes on `<form>` | Existing forms you want agents to fill and submit |

Both approaches can coexist on the same page.

## Quick Start — Imperative Tool

```javascript
await document.modelContext.registerTool({
  name: "add-todo",
  description: "Add a new item to the user's active todo list",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The text content of the todo item" }
    },
    required: ["text"]
  },
  async execute({ text }) {
    await addTodoItemToCollection(text);
    return {
      content: [{
        type: "text",
        text: `Added todo item: "${text}" successfully.`
      }]
    };
  }
});
```

## Quick Start — Declarative Form Tool

```html
<form toolname="support_request"
      tooldescription="Submit a request for customer support."
      toolautosubmit>
  <label for="name">Name</label>
  <input type="text" name="name">

  <label for="issue">Issue type</label>
  <select name="issue"
    toolparamdescription="Determines what team handles the request.">
    <option value="returns">Return my purchase</option>
    <option value="shipping">Check package status</option>
    <option value="technical">Get website help</option>
  </select>

  <button type="submit">Submit</button>
</form>
```

The browser auto-generates a JSON Schema tool definition from the form structure. The agent can fill and submit it.

## Setup (Chrome 149+, Edge 150+)

**Origin trial:** Register at the Chrome origin trial page for WebMCP (feature ID `4163014905550602241`). Edge also runs an origin trial (ID `0b76fe60-b266-458e-a285-04e375c0c31a`).

**Local development:** Navigate to `chrome://flags/#enable-webmcp-testing`, set to Enabled, relaunch Chrome.

**Testing extension:** Install the [Model Context Tool Inspector](https://chromewebstore.google.com/detail/model-context-tool-inspec/gbpdfapgefenggkahomfgkhfehlcenpd) for manual tool invocation and schema validation.

**Other implementations:** ChatGPT Desktop has full support; Brave has experimental support in Leo AI chat. Firefox and Safari are still reviewing the proposal (not yet implemented).

## Architecture

WebMCP is entirely client-side — no server, no transport protocol, no daemon:

- **Ephemeral** — tools exist only while the page is open in a browser tab
- **DOM-aware** — tools operate within the browser's DOM with access to session data, cookies, and elements
- **Browser-mediated** — the browser mediates between agent and tool execution
- **Origin-isolated** — tools are visible only to same-origin documents by default

The lifecycle: Registration -> Agent Discovery -> Structured Invocation -> Browser-Mediated Execution -> Response.

## When to Use WebMCP vs Backend MCP

| Use WebMCP | Use Backend MCP |
|------------|-----------------|
| Tool needs live DOM access | Tool needs database queries |
| Tool reuses existing client-side logic | Tool needs server-side secrets/APIs |
| User should see actions happening in the UI | Tool runs headlessly |
| Auth is already handled by the browser session | Tool needs its own auth |
| Tool is tied to page state (cart, form, filters) | Tool is stateless/standalone |

The recommendation is to use both as complementary technologies.

## Reference Guide

| Topic | File | When to Read |
|-------|------|--------------|
| Imperative API | [references/imperative-api.md](references/imperative-api.md) | `registerTool()`, `getTools()`, `executeTool()`, events, AbortSignal, full WebIDL |
| Declarative API | [references/declarative-api.md](references/declarative-api.md) | HTML form annotations, auto-generated schemas, CSS pseudo-classes, SubmitEvent extensions |
| Tool Design Patterns | [references/tool-design-patterns.md](references/tool-design-patterns.md) | Naming, descriptions, schemas, reliability, cognitive load, eval testing |
| Security & Privacy | [references/security-and-privacy.md](references/security-and-privacy.md) | Threat model, prompt injection, annotations, origin isolation, mitigations |
| Cross-Origin & Permissions | [references/cross-origin-and-permissions.md](references/cross-origin-and-permissions.md) | `exposedTo`, permissions policy, iframe integration, visibility algorithm |
| Original WebMCP (WebSocket) | [references/original-websocket-impl.md](references/original-websocket-impl.md) | Jason McGhee's `@jason.today/webmcp` — the WebSocket bridge approach (not W3C-compliant) |

## Common Patterns

### Dynamic Tool Registration/Unregistration

Register tools when they become relevant, unregister when they're not:

```javascript
const controller = new AbortController();

// Register when user navigates to checkout
document.modelContext.registerTool(checkoutTool, {
  signal: controller.signal
});

// Unregister when user leaves checkout
controller.abort();
```

### Tool with Read-Only Annotation

```javascript
await document.modelContext.registerTool({
  name: "get_cart_items",
  description: "Returns the current shopping cart contents and total price.",
  annotations: { readOnlyHint: true },
  inputSchema: { type: "object", properties: {} },
  async execute() {
    const items = getCartState();
    return { content: [{ type: "text", text: JSON.stringify(items) }] };
  }
});
```

### Handling Untrusted Content

```javascript
await document.modelContext.registerTool({
  name: "get_reviews",
  description: "Fetches user reviews for a product.",
  annotations: { untrustedContentHint: true },
  inputSchema: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Product identifier" }
    },
    required: ["productId"]
  },
  async execute({ productId }) {
    const reviews = await fetchReviews(productId);
    return { content: [{ type: "text", text: JSON.stringify(reviews) }] };
  }
});
```

### Cross-Origin Tool Exposure

```javascript
await document.modelContext.registerTool({
  name: "partner_data",
  description: "Returns shared data for trusted partner integration.",
  async execute() { return { data: "shared" }; }
}, {
  exposedTo: ["https://trusted-partner.example"]
});
```

## Character Budget Recommendations

| Element | Max Characters |
|---------|---------------|
| Tool name | 30 |
| Tool description | 500 |
| Parameter name | 30 |
| Parameter description | 150 |
| Individual tool output | 1,500 |

## Security Checklist

Before deploying WebMCP tools:

1. Mark tools returning user-generated content with `untrustedContentHint: true`
2. Mark read-only tools with `readOnlyHint: true`
3. Only expose tools to trusted origins via `exposedTo`
4. Validate strictly in code, loosely in schema — add descriptive error messages
5. Don't over-parameterize — request only data the tool genuinely needs
6. Use clear, unambiguous tool names (distinguish "create" from "start-creation-process")
7. Stay within character budgets
8. Test with the Model Context Tool Inspector extension

## Demo Repositories

- [Pizza Maker](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/pizza-maker) — imperative API
- [React Flight Search](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/react-flightsearch) — React integration
- [French Bistro](https://github.com/GoogleChromeLabs/webmcp-tools/tree/main/demos/french-bistro) — declarative form tools

## Specification Status

WebMCP is a **Draft Community Group Report** (W3C Web Machine Learning Community Group, 26 August 2026). The imperative API is stable and implemented in Chrome 149+ and Edge 150+. The declarative API section of the main spec is currently "entirely a TODO" — it's specified separately in [declarative-api-explainer.md](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md), and Chrome implements a loose, trial version of it. Service Worker integration is under discussion.

**Key open questions:** multimodal I/O, streaming support, output schema contracts, user consent management during tool execution (`requestUserInteraction()`).

**Spec:** https://webmachinelearning.github.io/webmcp/
**GitHub:** https://github.com/webmachinelearning/webmcp
