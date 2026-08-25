import type {
  CallToolResult,
  McpServer,
  ToolCallback,
} from "@modelcontextprotocol/server";
import type { z } from "zod";
import type { McpScope } from "@/lib/mcp/scopes";
import { jsonToolResult } from "@/lib/mcp/result";
import { toToolError } from "@/lib/mcp/errors";

// Every tool is a workspace-scoped read or write against the existing service
// layer. `defineTool` keeps the individual tool files down to a schema plus a
// service call: JSON serialization, error mapping and the scope tag live here.

export interface McpToolContext {
  workspaceId: string;
  scopes: readonly McpScope[];
  /**
   * Presenting token's id. Stands in for an operator id where a row records
   * its author — a kanban comment, for instance — so authorship survives a
   * rename and two tokens sharing a name stay distinct.
   *
   * An in-app agent run presents `agent:<agentId>` here; the columns this
   * reaches (KanbanComment.authorOperatorId) are plain strings without a
   * foreign key, so a non-operator author is representable.
   */
  tokenId: string;
  /** Presenting token's name — what a tool writes as the author of its work. */
  tokenName: string;
}

export interface McpToolDefinition {
  name: string;
  scope: McpScope;
  /**
   * The metadata below is published on the definition, not hidden inside
   * `register`, so a caller that is not an MCP server — the in-app agent
   * runtime in `src/lib/agents/tools.ts` — can advertise the same catalogue to
   * a model and invoke it directly. `register` passes exactly `invoke` to the
   * SDK, so `/api/mcp` behaviour is unchanged by their presence.
   */
  title: string;
  description: string;
  readOnly: boolean;
  inputSchema: z.ZodObject;
  invoke: (args: unknown, ctx: McpToolContext) => Promise<CallToolResult>;
  register: (server: McpServer, ctx: McpToolContext) => void;
}

interface ToolConfig<TSchema extends z.ZodObject> {
  name: string;
  scope: McpScope;
  title: string;
  description: string;
  inputSchema: TSchema;
  /** false for the three mutating tools, so clients can prompt first. */
  readOnly: boolean;
  handler: (args: z.output<TSchema>, ctx: McpToolContext) => Promise<unknown>;
}

export function defineTool<TSchema extends z.ZodObject>(
  config: ToolConfig<TSchema>,
): McpToolDefinition {
  const invoke = async (
    args: unknown,
    ctx: McpToolContext,
  ): Promise<CallToolResult> => {
    try {
      return jsonToolResult(
        await config.handler(args as z.output<TSchema>, ctx),
      );
    } catch (error) {
      return toToolError(error, {
        workspaceId: ctx.workspaceId,
        toolName: config.name,
      });
    }
  };

  return {
    name: config.name,
    scope: config.scope,
    title: config.title,
    description: config.description,
    readOnly: config.readOnly,
    inputSchema: config.inputSchema,
    invoke,
    register(server, ctx) {
      const callback = (args: unknown): Promise<CallToolResult> =>
        invoke(args, ctx);

      server.registerTool(
        config.name,
        {
          title: config.title,
          description: config.description,
          inputSchema: config.inputSchema,
          annotations: {
            readOnlyHint: config.readOnly,
            destructiveHint: false,
            idempotentHint: config.readOnly,
          },
        },
        // `ToolCallback<TSchema>` is a conditional type over the schema
        // generic, which TypeScript cannot resolve while TSchema is still
        // unbound; the runtime shape is exactly what the SDK calls.
        callback as ToolCallback<TSchema>,
      );
    },
  };
}
