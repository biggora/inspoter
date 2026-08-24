import { z } from "zod";

import { defineWebMcpTool, type WebMcpTool } from "@/lib/web-mcp/define-tool";
import type {
  AlertCategoryDto,
  FetchAlertsParams,
  FetchAlertsResult,
} from "./api";
import { UNCATEGORIZED_FILTER } from "./api";

// WebMCP tools for Alerts. `createAlertsTools` is page-independent and
// registered from the dashboard shell: the tools reach the /api/alerts client
// directly, take ids only, and deliberately carry the same tool names as the
// server-side catalog in src/lib/mcp/tools/alerts.ts.
//
// There is no `alerts_get` here: /api/alerts exposes no single-alert GET, so a
// read by id would have to be faked from a list call. `alerts_search` already
// returns the whole alert row.

/**
 * Every client API call the global alert tools make, injected rather than
 * imported so the factory unit-tests without React or `fetch`. Each member
 * matches the signature of the same-named export in
 * `src/components/alerts/api.ts`.
 */
export interface AlertsToolDeps {
  /** fetchAlerts */
  fetchAlerts: (params: FetchAlertsParams) => Promise<FetchAlertsResult>;
  /** alertCategoriesApi.list */
  listCategories: () => Promise<AlertCategoryDto[]>;
  /** alertsApi.setCategoryBulk */
  setCategoryBulk: (
    alertIds: string[],
    categoryId: string | null,
  ) => Promise<{ updated: number }>;
  /** alertCategoriesApi.create */
  createCategory: (name: string) => Promise<AlertCategoryDto>;
  /** Re-runs the page fetches so a visible alerts table reflects a mutation. */
  refresh: () => void;
}

// A single tool result should stay near ~1500 characters, so messages are
// trimmed and the page is capped rather than returned whole.
const MAX_MESSAGE_LENGTH = 160;
const MAX_ALERT_ROWS = 25;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

const searchInputSchema = z
  .object({
    query: z
      .string()
      .min(1)
      .max(200)
      .optional()
      .describe("Matches the alert message; omit to list the newest alerts"),
    categoryId: z
      .string()
      .min(1)
      .optional()
      .describe(
        `Category id from alert_categories_list, or "${UNCATEGORIZED_FILTER}" for the uncategorized ones`,
      ),
    severity: z
      .string()
      .min(1)
      .optional()
      .describe("Severity to filter by, e.g. info, warning, critical"),
    sort: z
      .enum(["asc", "desc"])
      .default("desc")
      .describe("Timestamp order; desc is newest first"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .default(10)
      .describe("Maximum number of alerts to return"),
  })
  .strict();

function createSearchTool(deps: AlertsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "alerts_search",
    title: "Search alerts",
    description: `Searches workspace alerts by message, severity or category, newest first by default. Pass categoryId "${UNCATEGORIZED_FILTER}" to find the alerts that have no category yet. The ids returned here are what alerts_set_category takes.`,
    inputSchema: searchInputSchema,
    readOnly: true,
    // Alert messages come from webhooks and third-party monitors.
    untrustedOutput: true,
    async handler({ query, categoryId, severity, sort, limit }) {
      const result = await deps.fetchAlerts({
        query,
        // "none" travels through untouched: the list route reads it as the
        // "has no category" sentinel, exactly as the server-side tool does.
        categoryId,
        severity,
        sort,
      });

      return {
        total: result.items.length,
        hasMore: result.nextCursor !== null,
        alerts: result.items
          .slice(0, Math.min(limit, MAX_ALERT_ROWS))
          .map((alert) => ({
            id: alert.id,
            message: truncate(alert.message, MAX_MESSAGE_LENGTH),
            severity: alert.severity,
            source: alert.source,
            categoryId: alert.alertCategoryId,
            categoryName: alert.alertCategory?.name ?? null,
            categorySource: alert.categorySource,
            timestamp: alert.timestamp,
          })),
      };
    },
  });
}

function createCategoriesListTool(deps: AlertsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "alert_categories_list",
    title: "List alert categories",
    description: `Lists the workspace's alert categories. Their ids are what alerts_search and alerts_set_category take; "${UNCATEGORIZED_FILTER}" is the search sentinel for alerts with no category.`,
    inputSchema: z.object({}).strict(),
    readOnly: true,
    async handler() {
      const categories = await deps.listCategories();
      return {
        total: categories.length,
        categories: categories.map((category) => ({
          id: category.id,
          name: category.name,
          isSystem: category.systemKey !== null,
        })),
      };
    },
  });
}

function createGlobalSetCategoryTool(deps: AlertsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "alerts_set_category",
    title: "Set alerts' category",
    description: `Assigns up to 50 alerts to a category, or clears it with categoryId null. Alert ids come from alerts_search, category ids from alert_categories_list; alerts_search with categoryId "${UNCATEGORIZED_FILTER}" finds the ones still unfiled.`,
    inputSchema: z
      .object({
        alertIds: z
          .array(z.string().min(1))
          .min(1)
          .max(50)
          .describe("Ids of the alerts to update, from alerts_search"),
        categoryId: z
          .string()
          .min(1)
          .nullable()
          .describe(
            "Category id from alert_categories_list, or null to clear it",
          ),
      })
      .strict(),
    readOnly: false,
    async handler({ alertIds, categoryId }) {
      const result = await deps.setCategoryBulk(alertIds, categoryId);
      deps.refresh();
      return { updated: result.updated };
    },
  });
}

function createCategoryCreateTool(deps: AlertsToolDeps): WebMcpTool {
  return defineWebMcpTool({
    name: "alert_category_create",
    title: "Create an alert category",
    description:
      "Creates a workspace alert category. Check alert_categories_list first — names are unique, so creating one that already exists fails.",
    inputSchema: z
      .object({
        name: z.string().trim().min(1).max(60).describe("Category name"),
      })
      .strict(),
    readOnly: false,
    async handler({ name }) {
      const category = await deps.createCategory(name);
      deps.refresh();
      return { categoryId: category.id, name: category.name };
    },
  });
}

/**
 * The page-independent alert tool set, registered from the dashboard shell.
 * Every tool takes ids from `alerts_search` / `alert_categories_list` rather
 * than resolving free text.
 */
export function createAlertsTools(deps: AlertsToolDeps): WebMcpTool[] {
  return [
    createSearchTool(deps),
    createCategoriesListTool(deps),
    createGlobalSetCategoryTool(deps),
    createCategoryCreateTool(deps),
  ];
}
