import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Upper bound on one bulk recategorization request, so a single call cannot
 * rewrite an unbounded slice of the table (NFR-PERF-001 in spirit). Lives
 * here rather than in the service because both the route schema and the
 * service clamp against it.
 */
export const MAX_BULK_ALERTS = 100;

export const alertDateSchema = z
  .string()
  .regex(DATE_PATTERN)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  });

export const alertListQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    // `"none"` is the uncategorized sentinel (UNCATEGORIZED in
    // src/lib/services/alerts.ts); anything else is a category id.
    categoryId: z.string().min(1).optional(),
    severity: z.string().min(1).optional(),
    query: z.string().optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    date: alertDateSchema.optional(),
  })
  .strict();

// `null` means "make this alert uncategorized" — the same value the list
// filter reaches with the "none" sentinel.
export const alertCategoryAssignmentSchema = z
  .object({
    alertCategoryId: z.string().min(1).nullable(),
  })
  .strict();

export const alertBulkCategorySchema = z
  .object({
    ids: z.array(z.string().min(1)).min(1).max(MAX_BULK_ALERTS),
    alertCategoryId: z.string().min(1).nullable(),
  })
  .strict();
