import { z } from "zod";

// Turns a zod schema + handler into a WebMCP-ready tool object — the
// `document.modelContext.registerTool()` counterpart to the backend MCP's
// `defineTool` (src/lib/mcp/tool.ts), but for the browser-native runtime:
// no `scope`/`McpToolContext` (WebMCP tools aren't workspace-scoped at this
// layer) and `ToolAnnotations` here only has `readOnlyHint`/
// `untrustedContentHint` — no `destructiveHint`/`idempotentHint`. Fully
// independent of src/lib/mcp/ — do not import from it here.

export interface WebMcpToolConfig<TSchema extends z.ZodObject> {
  name: string;
  /**
   * Human-readable label. Required rather than optional: some agent clients
   * surface it as the tool's caption, where a blank reads as an unnamed tool.
   */
  title: string;
  description: string;
  inputSchema: TSchema;
  /** Defaults to false — set true for tools that only read data. */
  readOnly?: boolean;
  /** Defaults to false — set true when the result may contain untrusted content. */
  untrustedOutput?: boolean;
  handler: (input: z.output<TSchema>) => Promise<unknown>;
}

export interface WebMcpTool {
  name: string;
  title: string;
  description: string;
  inputSchema: object;
  annotations: {
    readOnlyHint: boolean;
    untrustedContentHint: boolean;
  };
  execute: (input: Record<string, unknown>) => Promise<WebMcpToolResult>;
}

/** The MCP tool-result shape agents expect back from `execute`. */
export interface WebMcpToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

function toolResult(value: unknown): WebMcpToolResult {
  const text =
    typeof value === "string" ? value : JSON.stringify(value ?? null);
  return { content: [{ type: "text", text }] };
}

function toolError(message: string): WebMcpToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

const MAX_NAME_LENGTH = 30;
const MAX_DESCRIPTION_LENGTH = 500;
const MAX_PROPERTY_DESCRIPTION_LENGTH = 150;

function warnBudgets(
  name: string,
  description: string,
  inputSchema: object,
): void {
  if (process.env.NODE_ENV === "production") return;

  if (name.length > MAX_NAME_LENGTH) {
    console.warn(
      `[web-mcp] Tool name "${name}" is ${name.length} chars, longer than the recommended ${MAX_NAME_LENGTH}.`,
    );
  }
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    console.warn(
      `[web-mcp] Tool "${name}" description is ${description.length} chars, longer than the recommended ${MAX_DESCRIPTION_LENGTH}.`,
    );
  }

  const properties = (
    inputSchema as { properties?: Record<string, { description?: string }> }
  ).properties;
  if (!properties) return;

  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    const propertyDescription = propertySchema?.description;
    if (!propertyDescription) {
      console.warn(
        `[web-mcp] Tool "${name}" property "${propertyName}" has no description.`,
      );
    } else if (propertyDescription.length > MAX_PROPERTY_DESCRIPTION_LENGTH) {
      console.warn(
        `[web-mcp] Tool "${name}" property "${propertyName}" description is ${propertyDescription.length} chars, longer than the recommended ${MAX_PROPERTY_DESCRIPTION_LENGTH}.`,
      );
    }
  }
}

export function defineWebMcpTool<TSchema extends z.ZodObject>(
  config: WebMcpToolConfig<TSchema>,
): WebMcpTool {
  // `io: "input"` because this schema describes what a caller sends, not what
  // the handler receives. The default ("output") treats a field carrying
  // `.default()` as required — true after parsing, but it would oblige a
  // strict client to always pass a value the schema itself supplies.
  const inputSchema = z.toJSONSchema(config.inputSchema, { io: "input" });

  warnBudgets(config.name, config.description, inputSchema);

  return {
    name: config.name,
    title: config.title,
    description: config.description,
    inputSchema,
    annotations: {
      readOnlyHint: config.readOnly ?? false,
      untrustedContentHint: config.untrustedOutput ?? false,
    },
    // Never throws or rejects — always resolves to a tool result, flagging
    // failure with `isError` in-band, since an agent reads the failure rather
    // than catching it. The schema the browser advertises is advisory only,
    // so input is validated here before the handler ever sees it.
    async execute(
      rawInput: Record<string, unknown>,
    ): Promise<WebMcpToolResult> {
      const parsed = config.inputSchema.safeParse(rawInput);
      if (!parsed.success) {
        return toolError(
          "Invalid input: " +
            parsed.error.issues.map((issue) => issue.message).join("; "),
        );
      }

      try {
        return toolResult(await config.handler(parsed.data));
      } catch (err) {
        return toolError(
          err instanceof Error ? err.message : "Unexpected error.",
        );
      }
    },
  };
}
