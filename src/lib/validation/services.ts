import { z } from "zod";
import { MonitorType } from "@/generated/prisma/client";
import { VALIDATION_RU } from "@/lib/validation/error-map";

// Zod schemas — single source of input validation for Services (Uptime
// Kuma-style monitoring), shared by the /api/services route handlers.
// Conditional required fields per monitorType (HTTP needs url; TCP needs
// host+port; PING needs host) are enforced via a discriminated union on
// create (mirrors src/lib/validation/credentials.ts's per-provider
// discriminated union) and via superRefine on update (partial payload —
// type-specific fields are only required when monitorType itself is being
// changed in the same request). Messages are Russian because they surface
// directly as fieldErrors in the service form dialog.

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_RU.service.urlRequired })
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { error: () => VALIDATION_RU.service.urlInvalidFormat },
  );

const hostSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_RU.service.hostRequired });

const portSchema = z.coerce
  .number()
  .int()
  .min(1, { error: () => VALIDATION_RU.service.portOutOfRange })
  .max(65535, { error: () => VALIDATION_RU.service.portOutOfRange });

// e.g. "200-299" or a list of ranges/codes "200,204,301-399" — the default
// ("200-299") is applied at the service layer, not enforced here.
const expectedStatusCodesSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^\d{3}(-\d{3})?(,\d{3}(-\d{3})?)*$/, {
    error: () => VALIDATION_RU.service.statusCodesInvalidFormat,
  });

const intervalSecondsSchema = z.coerce
  .number()
  .int()
  .min(10, { error: () => VALIDATION_RU.service.intervalTooSmall })
  .max(86400, { error: () => VALIDATION_RU.service.intervalTooBig });

const timeoutMsSchema = z.coerce
  .number()
  .int()
  .min(1000, { error: () => VALIDATION_RU.service.timeoutTooSmall })
  .max(30000, { error: () => VALIDATION_RU.service.timeoutTooBig });

const retriesSchema = z.coerce
  .number()
  .int()
  .min(1, { error: () => VALIDATION_RU.service.retriesTooSmall })
  .max(10, { error: () => VALIDATION_RU.service.retriesTooBig });

const commonFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_RU.service.nameRequired }),
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
        message: VALIDATION_RU.service.urlRequiredForHttp,
        path: ["url"],
      });
    }
    if (data.monitorType === MonitorType.TCP) {
      if (!data.host) {
        ctx.addIssue({
          code: "custom",
          message: VALIDATION_RU.service.hostRequiredForTcp,
          path: ["host"],
        });
      }
      if (!data.port) {
        ctx.addIssue({
          code: "custom",
          message: VALIDATION_RU.service.portRequiredForTcp,
          path: ["port"],
        });
      }
    }
    if (data.monitorType === MonitorType.PING && !data.host) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION_RU.service.hostRequiredForPing,
        path: ["host"],
      });
    }
  });

export type ServiceCreateSchemaInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateSchemaInput = z.infer<typeof serviceUpdateSchema>;
