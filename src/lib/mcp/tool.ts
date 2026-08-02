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
  /** Presenting token's name — what a tool writes as the author of its work. */
  tokenName: string;
}

export interface McpToolDefinition {
  name: string;
  scope: McpScope;
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
  return {
    name: config.name,
    scope: config.scope,
    register(server, ctx) {
      const callback = async (args: unknown): Promise<CallToolResult> => {
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
