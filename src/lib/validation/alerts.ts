import { z } from "zod";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
    categoryId: z.string().min(1).optional(),
    severity: z.string().min(1).optional(),
    query: z.string().optional(),
    sort: z.enum(["asc", "desc"]).optional(),
    date: alertDateSchema.optional(),
  })
  .strict();
