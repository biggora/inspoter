import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";

// WebMCP tools for the Alerts page — lets a browser agent act on the alerts
// currently visible in the table without reimplementing the bulk-category
// API call itself.

export interface SetCategoryToolContext {
  /** Bound alertsApi.setCategoryBulk (or equivalent). */
  setCategoryBulk: (
    alertIds: string[],
    categoryId: string | null,
  ) => Promise<{ updated: number }>;
  /** Re-runs the list fetch so the visible table reflects the change. */
  refresh: () => void;
}

const setCategoryInputSchema = z
  .object({
    alertIds: z
      .array(z.string().min(1))
      .min(1)
      .max(50)
      .describe("Ids of the alerts to update"),
    categoryId: z
      .string()
      .min(1)
      .nullable()
      .describe("Target category id, or null to clear the category"),
  })
  .strict();

export function createSetCategoryTool(
  ctx: SetCategoryToolContext,
): WebMcpTool {
  return defineWebMcpTool({
    name: "alert_set_category",
    title: "Set alert category",
    description:
      "Assigns or clears the category for one or more alerts on the currently open Alerts page, identified by their ids. Pass categoryId: null to remove the category.",
    inputSchema: setCategoryInputSchema,
    readOnly: false,
    async handler({ alertIds, categoryId }) {
      const result = await ctx.setCategoryBulk(alertIds, categoryId);
      ctx.refresh();
      return { updated: result.updated };
    },
  });
}
