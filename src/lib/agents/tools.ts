import type { CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { env } from "@/lib/config/env";
import type { LlmToolDefinition } from "@/lib/llm/contract";
import {
  hasAgentScope,
  toMcpScopes,
  type AgentScope,
} from "@/lib/agents/scopes";
import { selectTools } from "@/lib/mcp/server";
import { TOOL_RESULT_CLOSE, TOOL_RESULT_OPEN } from "@/lib/agents/prompt";
import { managementAgentTools } from "@/lib/agents/management-tools";

// Adapts the existing MCP tool catalogue (src/lib/mcp/tools/**, 109 tools) into
// what a model needs: a JSON-Schema description it can call, and a handler the
// runtime can invoke. The adapter lives here rather than in src/lib/mcp so that
// module stays free of LLM types.
//
// Permission is structural: `selectTools` returns only the tools the agent's
// scopes cover, so a tool it may not use is absent from the array rather than
// refused at call time. There is no runtime check to forget.

export interface AgentToolBinding {
  name: string;
  scope: AgentScope;
  readOnly: boolean;
  definition: LlmToolDefinition;
  invoke(args: unknown, ctx: AgentToolContext): Promise<CallToolResult>;
}

export interface AgentToolContext {
  workspaceId: string;
  scopes: AgentScope[];
  tokenId: string;
  tokenName: string;
  runId: string;
  agentId: string;
  leaseToken: string;
}

// The catalogue is static and converting 109 zod schemas on every step would be
// pure waste, so each conversion is kept after the first run of the process.
const schemaCache = new Map<string, Record<string, unknown>>();

function jsonSchemaFor(name: string, schema: z.ZodObject) {
  const cached = schemaCache.get(name);
  if (cached) return cached;
  // `io: "input"` for the same reason as src/lib/web-mcp/define-tool.ts: the
  // default treats a field with `.default()` as required, which would make the
  // model fill in values the tool would have supplied itself.
  const converted = z.toJSONSchema(schema, { io: "input" }) as Record<
    string,
    unknown
  >;
  schemaCache.set(name, converted);
  return converted;
}

/**
 * The toolset for one run.
 *
 * `allowNames`, when given, intersects the scope-selected set — this is how an
 * attached skill narrows an agent's focus. It can only remove tools: a skill
 * that could add one would make the agent's scope list a lie.
 */
export function buildAgentToolset(
  scopes: readonly AgentScope[],
  allowNames?: readonly string[],
): AgentToolBinding[] {
  const allow = allowNames?.length ? new Set(allowNames) : null;
  const mcpTools = selectTools(toMcpScopes(scopes))
    .filter((tool) => !allow || allow.has(tool.name))
    .map((tool): AgentToolBinding => ({
      name: tool.name,
      scope: tool.scope,
      readOnly: tool.readOnly,
      definition: {
        name: tool.name,
        description: tool.description,
        inputSchema: jsonSchemaFor(tool.name, tool.inputSchema),
      },
      invoke: (args, context) =>
        tool.invoke(args, {
          workspaceId: context.workspaceId,
          scopes: toMcpScopes(context.scopes),
          tokenId: context.tokenId,
          tokenName: context.tokenName,
        }),
    }));
  const privateTools = managementAgentTools.filter(
    (tool) =>
      hasAgentScope(scopes, tool.scope) && (!allow || allow.has(tool.name)),
  );
  return [...privateTools, ...mcpTools];
}

export interface ToolResultText {
  text: string;
  isError: boolean;
}

/**
 * Flattens an MCP result into the text that goes back to the model, capped so
 * one wide listing cannot spend the run's whole token budget.
 */
export function toolResultToText(result: CallToolResult): ToolResultText {
  const text = result.content
    .map((block) => (block.type === "text" ? block.text : `[${block.type}]`))
    .join("\n");
  return {
    text: truncate(text, env.AGENT_TOOL_RESULT_MAX_CHARS),
    isError: result.isError === true,
  };
}

export function truncate(text: string, max: number): string {
  return text.length <= max
    ? text
    : `${text.slice(0, max)}\n[truncated ${text.length - max} characters]`;
}

/**
 * Wraps a tool's answer in the delimiters the system prompt names as untrusted.
 * Applied to the `tool` message only — tool output never enters the system
 * prompt, where it would read as instructions.
 */
export function frameToolResult(toolName: string, text: string): string {
  return `${TOOL_RESULT_OPEN} name=${toolName}\n${text}\n${TOOL_RESULT_CLOSE}`;
}
