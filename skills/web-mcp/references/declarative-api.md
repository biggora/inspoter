# WebMCP Declarative API Reference

The declarative API lets you turn existing HTML `<form>` elements into WebMCP tools by adding a few attributes. The browser auto-generates JSON Schema tool definitions from the form structure.

> Status: the declarative API section of the main W3C draft (`index.bs`) is currently "entirely a TODO" — the real source of truth is the separate [`declarative-api-explainer.md`](https://github.com/webmachinelearning/webmcp/blob/main/declarative-api-explainer.md), and several of the mechanisms it describes are themselves marked TBD/under discussion (noted inline below). Chrome 149+ implements a loose version of this for trial/testing purposes.

## HTML Attributes

### On `<form>` Elements

| Attribute | Type | Description |
|-----------|------|-------------|
| `toolname` | string | Tool identifier — names the exposed tool |
| `tooldescription` | string | Natural language description of what the tool does |
| `toolautosubmit` | boolean | Permits automatic form submission by agents without user verification |

### On Form Controls (`<input>`, `<select>`, `<textarea>`)

| Attribute | Type | Description |
|-----------|------|-------------|
| `toolparamdescription` | string | Describes this field's purpose in the generated input schema |

### Parameter Description Fallback

Without `toolparamdescription`, the browser derives descriptions from:
1. Associated `<label>` element text
2. `aria-description` attribute
3. If neither is present, the field is skipped in the schema

### Tool Unregistration

Removing either `toolname` or `tooldescription` from a form dynamically unregisters the tool.

## Complete Form Example

```html
<form toolname="add-to-timesheet"
      tooldescription="Report billing task and time to add to the timesheet."
      toolautosubmit>
  <fieldset>
    <label for="date">Date</label>
    <input name="date" type="datetime-local"
           toolparamdescription="Date of work.">

    <label for="task_category">Task category</label>
    <select id="task_category" name="task_category"
            toolparamdescription="Type of task completed per time block">
      <option value="admin">Admin</option>
      <option value="billing">Billing</option>
      <option value="client">Client meetings or communication</option>
      <option value="development">Development</option>
    </select>

    <label for="minutes_worked">Minutes working on the task</label>
    <input type="number" id="minutes_worked" name="minutes_worked"
           min="30" max="600"
           toolparamdescription="Minutes worked, minimum 30, maximum 600."
           placeholder="60">

    <label for="work_details">Details</label>
    <input name="work_details"
           toolparamdescription="Additional details of work completed.">
  </fieldset>
  <button type="submit">Update timesheet</button>
</form>
```

## Auto-Generated JSON Schema

The browser transforms the annotated form above into:

```json
{
  "name": "add-to-timesheet",
  "description": "Report billing task and time to add to the timesheet.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "date": {
        "type": "string",
        "description": "Date of work."
      },
      "task_category": {
        "type": "string",
        "description": "Type of task completed per time block",
        "enum": ["admin", "billing", "client", "development"],
        "anyOf": [
          { "type": "string", "const": "admin", "title": "Admin" },
          { "type": "string", "const": "billing", "title": "Billing" },
          { "type": "string", "const": "client", "title": "Client meetings or communication" },
          { "type": "string", "const": "development", "title": "Development" }
        ]
      },
      "minutes_worked": {
        "type": "number",
        "description": "Minutes worked, minimum 30, maximum 600."
      },
      "work_details": {
        "type": "string",
        "description": "Additional details of work completed."
      }
    }
  }
}
```

`<select>` elements produce both `enum` (flat list) and `anyOf` (with `const` + `title` per option), giving agents both the valid values and human-readable labels.

> The exact algorithm for reducing a form to a JSON Schema is explicitly marked TBD in the explainer — this reflects current Chromium trial behavior, not a ratified spec algorithm, and may change based on community feedback.

## Select Element Example

```html
<form toolname="search_cars"
      tooldescription="Search for cars based on type, seats, year, fuel, and features."
      toolautosubmit>
  <label for="car_type">Car Type</label>
  <select id="car_type" name="car_type"
          toolparamdescription="Type of car">
    <option value="">Any</option>
    <option value="family">Family Car</option>
    <option value="suv">SUV</option>
    <option value="sedan">Sedan</option>
  </select>

  <label for="seats">Min Seats</label>
  <input type="number" id="seats" name="seats" min="1" max="9"
         toolparamdescription="Minimum number of seats required"
         placeholder="7">

  <label for="min_year">Minimum Year</label>
  <input type="number" id="min_year" name="min_year"
         min="1900" max="2026"
         toolparamdescription="Find cars made after a specific year"
         placeholder="2016">

  <button type="submit">Search Cars</button>
</form>
```

## SubmitEvent Extensions

The `SubmitEvent` interface is extended for agent-invoked submissions:

### agentInvoked (boolean)

Indicates whether the form submission was triggered by an AI agent (vs. a human click).

### respondWith(promise)

Override default form behavior and return a custom response to the agent without triggering page navigation:

```javascript
document.querySelector("form").addEventListener("submit", (e) => {
  e.preventDefault();

  if (!validateForm()) {
    if (e.agentInvoked) {
      e.respondWith(Promise.resolve({
        error: "Validation failed",
        details: getValidationErrors()
      }));
    }
    return;
  }

  if (e.agentInvoked) {
    e.respondWith(
      submitFormAsync(new FormData(e.target))
        .then(result => ({ status: "success", id: result.id }))
    );
  }
});
```

`respondWith()` only applies to forms that don't navigate. See below for forms that do.

## Getting the Form Response Back (Navigating Forms)

> Status: under active debate (webmachinelearning/webmcp#135) — not finalized.

If a form submission does **not** navigate, use `SubmitEvent#respondWith()` (above). If it **does** navigate, the browser looks for the first `<script type="application/ld+json">` tag on the destination page and uses its contents as the tool's response. If no such tag is present, the destination page's full content may be sent as the response instead — this fallback is still TBD.

```html
<!-- On the destination page, after a navigating form submission -->
<script type="application/ld+json">
{ "status": "success", "orderId": "ORD-4821" }
</script>
```

## Tool Activation Events

> Status: fires on `document.modelContext` per the explainer's current text. Whether these should instead fire on the `<form>` element and bubble is an open question (webmachinelearning/webmcp#126) — don't assume `window` is the final target.

### toolactivated

Fires when a declarative tool's form fields are pre-filled by an agent (before submission):

```javascript
document.modelContext.addEventListener("toolactivated", ({ toolName }) => {
  console.log(`Agent activated tool: "${toolName}"`);
  showAgentIndicator(toolName);
});
```

### toolcanceled

Fires when the user cancels the tool invocation, `form.reset()` is called, or the form's `toolname`/`tooldescription` attributes change while an invocation is in flight:

```javascript
document.modelContext.addEventListener("toolcanceled", ({ toolName }) => {
  console.log(`Tool "${toolName}" execution was cancelled.`);
  hideAgentIndicator();
});
```

## CSS Pseudo-Classes

Style forms differently when an agent is interacting:

### :tool-form-active

Matches `<form>` elements with a running declarative tool invocation:

```css
form:tool-form-active {
  outline: light-dark(blue, cyan) dashed 1px;
  outline-offset: -1px;
}
```

### :tool-submit-active

Matches submit buttons during an active agent invocation:

```css
input[type="submit"]:tool-submit-active,
button[type="submit"]:tool-submit-active {
  outline: light-dark(red, pink) dashed 1px;
  outline-offset: -1px;
}
```

## Dynamic Registration via DOM

Add/remove `toolname` and `tooldescription` attributes to dynamically register/unregister declarative tools:

```javascript
const form = document.getElementById("checkout-form");

// Register
form.setAttribute("toolname", "checkout");
form.setAttribute("tooldescription", "Complete the purchase.");

// Unregister
form.removeAttribute("toolname");
```

## When to Use Declarative vs. Imperative

| Declarative | Imperative |
|-------------|------------|
| Standard HTML forms | Complex multi-step logic |
| Agent fills fields, user reviews, form submits | Navigation, state management, API calls |
| Minimal JS needed | Full control over execution |
| Auto-generated schema from form structure | Hand-crafted JSON Schema |
| `toolautosubmit` for zero-friction flow | Custom response formatting |
| Progressive enhancement of existing forms | Tools not tied to a form element |

## Open Questions

Not yet resolved in the spec/explainer — don't build hard dependencies on these:

- Whether declarative tools need an explicit `outputSchema`
- Whether/how declarative tools show up via `getTools()` / `executeTool()`
- Whether `toolactivated`/`toolcanceled` fire on `document.modelContext`, on the `<form>`, or bubble (#126)
- The navigating-form response mechanism — `application/ld+json` vs. full-page fallback (#135)
- The exact form-to-JSON-Schema reduction algorithm
