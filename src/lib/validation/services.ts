import { z } from "zod";
import { MonitorType } from "@/generated/prisma/client";

// Zod schemas — single source of input validation for Services (Uptime
// Kuma-style monitoring), shared by the /api/services route handlers.
// Conditional required fields per monitorType (HTTP needs url; TCP needs
// host+port; PING needs host) are enforced via a discriminated union on
// create (mirrors src/lib/validation/credentials.ts's per-provider
// discriminated union) and via superRefine on update (partial payload —
// type-specific fields are only required when monitorType itself is being
// changed in the same request).

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, "URL is required")
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { message: "URL must be a valid http(s) URL" },
  );

const hostSchema = z.string().trim().min(1, "Host is required");

const portSchema = z.coerce
  .number()
  .int()
  .min(1, "Port must be between 1 and 65535")
  .max(65535, "Port must be between 1 and 65535");

// e.g. "200-299" or a list of ranges/codes "200,204,301-399" — the default
// ("200-299") is applied at the service layer, not enforced here.
const expectedStatusCodesSchema = z
  .string()
  .trim()
  .min(1)
  .regex(
    /^\d{3}(-\d{3})?(,\d{3}(-\d{3})?)*$/,
    "Must be a comma-separated list of 3-digit codes or ranges, e.g. 200-299",
  );

const intervalSecondsSchema = z.coerce
  .number()
  .int()
  .min(10, "Interval must be at least 10 seconds")
  .max(86400, "Interval must be at most 86400 seconds");

const timeoutMsSchema = z.coerce
  .number()
  .int()
  .min(1000, "Timeout must be at least 1000ms")
  .max(30000, "Timeout must be at most 30000ms");

const retriesSchema = z.coerce
  .number()
  .int()
  .min(1, "Retries must be at least 1")
  .max(10, "Retries must be at most 10");

const commonFields = {
  name: z.string().trim().min(1, "Name is required"),
  description: z.string().trim().min(1).optional().nullable(),
  intervalSeconds: intervalSecondsSchema.optional(),
  timeoutMs: timeoutMsSchema.optional(),
  retries: retriesSchema.optional(),
  isActive: z.boolean().optional(),
};

export const serviceCreateSchema = z.discriminatedUnion("monitorType", [
  z.object({
    monitorType: z.literal(MonitorType.HTTP),
    url: httpUrlSchema,
    expectedStatusCodes: expectedStatusCodesSchema.optional(),
    ...commonFields,
  }),
  z.object({
    monitorType: z.literal(MonitorType.TCP),
    host: hostSchema,
    port: portSchema,
    ...commonFields,
  }),
  z.object({
    monitorType: z.literal(MonitorType.PING),
    host: hostSchema,
    port: portSchema.optional(),
    ...commonFields,
  }),
]);

export const serviceUpdateSchema = z
  .object({
    monitorType: z.nativeEnum(MonitorType).optional(),
    url: httpUrlSchema.optional(),
    host: z.string().trim().min(1).optional(),
    port: portSchema.optional(),
    expectedStatusCodes: expectedStatusCodesSchema.optional(),
    ...commonFields,
    name: commonFields.name.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.monitorType === MonitorType.HTTP && !data.url) {
      ctx.addIssue({
        code: "custom",
        message: "url is required for HTTP monitors",
        path: ["url"],
      });
    }
    if (data.monitorType === MonitorType.TCP) {
      if (!data.host) {
        ctx.addIssue({
          code: "custom",
          message: "host is required for TCP monitors",
          path: ["host"],
        });
      }
      if (!data.port) {
        ctx.addIssue({
          code: "custom",
          message: "port is required for TCP monitors",
          path: ["port"],
        });
      }
    }
    if (data.monitorType === MonitorType.PING && !data.host) {
      ctx.addIssue({
        code: "custom",
        message: "host is required for PING monitors",
        path: ["host"],
      });
    }
  });

export type ServiceCreateSchemaInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateSchemaInput = z.infer<typeof serviceUpdateSchema>;
