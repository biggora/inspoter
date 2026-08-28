# WebMCP Tool Design Patterns

Best practices from the Chrome team and W3C specification for designing effective WebMCP tools.

## 1. Tool Strategy

Plan your tools before building:

- **One tool = one function.** A tool to navigate to a form and a tool to fill the form should be separate.
- **No overlapping tools.** If the agent can't distinguish between two tools, merge them or clarify descriptions.
- **Ask:** Can I cover multiple tasks with the same function? If yes, combine. If the tasks differ in purpose, split.
- **Static registration by default.** Only use dynamic registration when page state genuinely changes tool availability (e.g., checkout flow).

### Managing Tool Availability

Register tools when they're contextually useful, unregister when they're not:

```javascript
// Imperative: AbortController
const controller = new AbortController();
document.modelContext.registerTool(tool, { signal: controller.signal });
controller.abort(); // unregister

// Declarative: DOM manipulation
form.setAttribute("toolname", "checkout");  // register
form.removeAttribute("toolname");           // unregister
```

### Performance

There is no hard maximum on tool count, but each tool consumes context window space and adds agent decision time. More tools with overlapping purposes = worse agent accuracy.

## 2. Naming

Use clear verbs that distinguish execution from initiation:

| Name | Meaning |
|------|---------|
| `create-event` | Immediately creates an event |
| `start-event-creation-process` | Redirects user to an event creation form |
| `get_cart_items` | Returns cart data (read-only) |
| `checkout` | Completes a purchase (state-changing) |

**Rules:**
- 1-128 characters
- Allowed: `a-z`, `A-Z`, `0-9`, `_`, `-`, `.`
- Recommended max: 30 characters (for agent context efficiency)

## 3. Descriptions

**Use positive language** — describe what the tool CAN do:

```
// Good
"Creates a calendar event scheduled for a specific date and time."

// Bad
"Don't use this tool for weather queries or reminders."
```

**Be specific about the action**, not the implementation:

```
// Good
"Adds an item to the user's shopping cart with specified quantity and size."

// Bad
"Calls the addToCart API endpoint."
```

**Recommended max: 500 characters.** Concise descriptions reduce context window usage.

## 4. Input Schema Design

### Use Specific Types

```javascript
// Good: explicit types and enums
inputSchema: {
  type: "object",
  properties: {
    size: { type: "string", enum: ["small", "medium", "large"] },
    quantity: { type: "number" },
    giftWrap: { type: "boolean" }
  }
}

// Bad: everything is a string
inputSchema: {
  type: "object",
  properties: {
    size: { type: "string" },
    quantity: { type: "string" },
    giftWrap: { type: "string" }
  }
}
```

### Accept Raw User Input

Don't ask the agent to transform data. Accept natural formats:

```javascript
// Good: accept the user's raw input
properties: {
  timeRange: { type: "string", description: "Time range like '11:00 to 15:00'" }
}

// Bad: force agent to calculate
properties: {
  durationMinutes: { type: "number", description: "Duration in minutes" }
}
```

### Use Natural Language Identifiers

```javascript
// Good
properties: {
  shipping: { type: "string", enum: ["Standard", "Express", "Overnight"] }
}

// Bad
properties: {
  shipping_id: { type: "number", description: "1=standard, 2=express, 3=overnight" }
}
```

### Don't Over-Parameterize

Request only data the tool genuinely needs. Excessive parameters invite privacy leakage:

```javascript
// Good: minimal parameters
properties: {
  size: { type: "string" },
  maxPrice: { type: "number" }
}

// Bad: privacy-invasive over-parameterization
properties: {
  size: { type: "string" },
  maxPrice: { type: "number" },
  age: { type: "number", description: "For age-appropriate styling" },
  pregnant: { type: "boolean", description: "For maternity options" },
  skinTone: { type: "string", description: "For color matching" }
}
```

### Parameter Description Budget

Recommended max: **150 characters** per parameter description.

## 5. Reliability

### Graceful Failure

Return meaningful errors, not silent failures:

```javascript
execute: async ({ query }) => {
  if (rateLimitExceeded()) {
    return {
      error: "Rate limit reached. Please try again in 30 seconds.",
      suggestion: "You can also search manually using the search bar."
    };
  }
  return await performSearch(query);
}
```

### Update Interface State

Agents may rely on the visible UI to plan next steps. After your tool modifies state, make sure the UI reflects the change before returning:

```javascript
execute: async ({ itemId }) => {
  await removeFromCart(itemId);
  await updateCartUI();  // ensure UI is updated before responding
  return { content: [{ type: "text", text: `Removed item ${itemId} from cart.` }] };
}
```

### Validate Strictly in Code, Loosely in Schema

Schema constraints aren't guaranteed to be enforced. Add validation in your `execute` callback with descriptive errors that let the agent self-correct:

```javascript
execute: async ({ email }) => {
  if (!isValidEmail(email)) {
    return {
      error: `"${email}" is not a valid email address. Expected format: user@domain.com`
    };
  }
  await subscribe(email);
  return { content: [{ type: "text", text: "Subscribed successfully." }] };
}
```

## 6. Trust the Agent

Instead of rigid step-by-step flows, assume the agent can figure out the sequence:

```javascript
// Good: let the agent decide when to use this
{
  name: "apply_filters",
  description: "Applies search filters to narrow product results.",
  inputSchema: {
    type: "object",
    properties: {
      category: { type: "string" },
      priceRange: { type: "string", description: "e.g. '10-50'" },
      sortBy: { type: "string", enum: ["price", "rating", "newest"] }
    }
  }
}

// Bad: prescriptive description forcing a flow
{
  name: "apply_filters",
  description: "Step 2 of the search flow. Must be called after search_products and before view_results. Do NOT call this without first calling search_products."
}
```

## 7. Evaluation-Driven Development

### Define the Problem as a Contract

```
Input: user says "I'd like a small pizza"
Expected: agent calls set_pizza_size({ size: "Small" })
```

### Multi-Step Evaluation

```json
{
  "messages": [{ "role": "user", "content": "Find black jackets and jeans" }],
  "expectedCall": [
    { "functionName": "navigate_to_category", "arguments": { "category": "clothes" } },
    {
      "unordered": [
        {
          "ordered": [
            { "functionName": "search_clothes", "arguments": { "query": "black jacket" } },
            { "functionName": "get_product_details", "arguments": { "productId": "JACKET002" } }
          ]
        },
        {
          "ordered": [
            { "functionName": "search_clothes", "arguments": { "query": "jeans" } },
            { "functionName": "get_product_details", "arguments": { "productId": "JEANS001" } }
          ]
        }
      ]
    }
  ]
}
```

### Avoid Narrow Patches

Don't add model-specific workarounds. If a `<select>` field causes wrong choices, make it optional and let the agent ask the user rather than adding restrictive rules.

## Output Budget

Individual tool output: **max 1,500 characters** recommended. Longer outputs consume agent context and may be truncated.
