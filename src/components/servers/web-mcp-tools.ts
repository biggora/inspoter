import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type { ProviderServerDto } from "./api";
import type { getAvailableActions } from "./server-power-actions";
import type { PowerActionType } from "./use-server-power-action";

// WebMCP tool for a server's detail page — lets a browser agent trigger the
// same start/stop/restart power actions as the on-page buttons. Deliberately
// has no server-identifier parameter: it's only registered while one
// specific server's detail page is mounted (server-detail-view.tsx), so
// "this server" is implicit from context, exactly like the buttons.

export interface PowerActionToolContext {
  /** The server currently shown on this page. */
  server: ProviderServerDto;
  /** Reuses server-power-actions.tsx's status->available-actions mapping. */
  getAvailableActions: typeof getAvailableActions;
  /**
   * Bound use-server-power-action.ts's trigger function — applies the
   * optimistic status and starts polling, same as a button click would.
   */
  triggerPowerAction: (
    server: ProviderServerDto,
    action: PowerActionType,
  ) => Promise<void>;
}

const powerActionInputSchema = z
  .object({
    action: z
      .enum(["start", "stop", "restart"])
      .describe("The power action to perform on this server."),
  })
  .strict();

export function createPowerActionTool(
  ctx: PowerActionToolContext,
): WebMcpTool {
  return defineWebMcpTool({
    name: "server_power_action",
    description:
      "Starts, stops, or restarts the server currently shown on this page. Only valid actions for the server's current status will succeed.",
    inputSchema: powerActionInputSchema,
    readOnly: false,
    async handler({ action }) {
      const available = ctx
        .getAvailableActions(ctx.server)
        .map((entry) => entry.action);

      if (!available.includes(action)) {
        return {
          error: `Action '${action}' is not available for '${ctx.server.name}' in its current status ('${ctx.server.status}'). Available: ${
            available.length > 0 ? available.join(", ") : "none"
          }.`,
        };
      }

      await ctx.triggerPowerAction(ctx.server, action);
      return { server: ctx.server.name, action, requested: true };
    },
  });
}
