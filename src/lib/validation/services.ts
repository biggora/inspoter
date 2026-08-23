import { z } from "zod";
import { MonitorType, ServiceStatus } from "@/generated/prisma/client";
import { isLabelColor, type LabelColor } from "@/lib/label-color";
import { normalizeLabelDisplayName } from "@/lib/label-normalization";
import { VALIDATION_MESSAGES } from "@/lib/validation/error-map";

// Zod schemas — single source of input validation for Services (Uptime
// Kuma-style monitoring), shared by the /api/services route handlers.
// Conditional required fields per monitorType (HTTP needs url; TCP needs
// host+port; PING needs host) are enforced via a discriminated union on
// create (mirrors src/lib/validation/credentials.ts's per-provider
// discriminated union) and via superRefine on update (partial payload —
// type-specific fields are only required when monitorType itself is being
// changed in the same request). Messages come from the base-language catalog
// because they surface directly as fieldErrors in the service form dialog.

export const SERVICE_LABELS_PER_SERVICE_LIMIT = 20;

const httpUrlSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_MESSAGES.service.urlRequired })
  .refine(
    (value) => {
      try {
        const parsed = new URL(value);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    },
    { error: () => VALIDATION_MESSAGES.service.urlInvalidFormat },
  );

const hostSchema = z
  .string()
  .trim()
  .min(1, { error: () => VALIDATION_MESSAGES.service.hostRequired });

const portSchema = z.coerce
  .number()
  .int()
  .min(1, { error: () => VALIDATION_MESSAGES.service.portOutOfRange })
  .max(65535, { error: () => VALIDATION_MESSAGES.service.portOutOfRange });

// e.g. "200-299" or a list of ranges/codes "200,204,301-399" — the default
// ("200-299") is applied at the service layer, not enforced here.
const expectedStatusCodesSchema = z
  .string()
  .trim()
  .min(1)
  .regex(/^\d{3}(-\d{3})?(,\d{3}(-\d{3})?)*$/, {
    error: () => VALIDATION_MESSAGES.service.statusCodesInvalidFormat,
  });

const intervalSecondsSchema = z.coerce
  .number()
  .int()
  .min(10, { error: () => VALIDATION_MESSAGES.service.intervalTooSmall })
  .max(86400, { error: () => VALIDATION_MESSAGES.service.intervalTooBig });

const timeoutMsSchema = z.coerce
  .number()
  .int()
  .min(1000, { error: () => VALIDATION_MESSAGES.service.timeoutTooSmall })
  .max(30000, { error: () => VALIDATION_MESSAGES.service.timeoutTooBig });

const retriesSchema = z.coerce
  .number()
  .int()
  .min(1, { error: () => VALIDATION_MESSAGES.service.retriesTooSmall })
  .max(10, { error: () => VALIDATION_MESSAGES.service.retriesTooBig });

// Ids come straight from the label picker, so a bad value here is a client
// bug rather than operator input — one generic message is enough.
const labelIdsSchema = z
  .array(z.string().trim().min(1), {
    error: () => VALIDATION_MESSAGES.service.labelIdsInvalid,
  })
  .max(SERVICE_LABELS_PER_SERVICE_LIMIT, {
    error: () => VALIDATION_MESSAGES.service.labelIdsInvalid,
  });

const commonFields = {
  name: z
    .string()
    .trim()
    .min(1, { error: () => VALIDATION_MESSAGES.service.nameRequired }),
  description: z.string().trim().min(1).optional().nullable(),
  intervalSeconds: intervalSecondsSchema.optional(),
  timeoutMs: timeoutMsSchema.optional(),
  retries: retriesSchema.optional(),
  isActive: z.boolean().optional(),
  labelIds: labelIdsSchema.optional(),
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
        message: VALIDATION_MESSAGES.service.urlRequiredForHttp,
        path: ["url"],
      });
    }
    if (data.monitorType === MonitorType.TCP) {
      if (!data.host) {
        ctx.addIssue({
          code: "custom",
          message: VALIDATION_MESSAGES.service.hostRequiredForTcp,
          path: ["host"],
        });
      }
      if (!data.port) {
        ctx.addIssue({
          code: "custom",
          message: VALIDATION_MESSAGES.service.portRequiredForTcp,
          path: ["port"],
        });
      }
    }
    if (data.monitorType === MonitorType.PING && !data.host) {
      ctx.addIssue({
        code: "custom",
        message: VALIDATION_MESSAGES.service.hostRequiredForPing,
        path: ["host"],
      });
    }
  });

export type ServiceCreateSchemaInput = z.infer<typeof serviceCreateSchema>;
export type ServiceUpdateSchemaInput = z.infer<typeof serviceUpdateSchema>;

// --- Query strings ---
// Only the agent-facing /api/v1/services family parses a query string: the
// dashboard loads the whole list once and filters it in the browser. Values
// arrive as strings, hence the coercion on pageSize.

export const serviceListQuerySchema = z
  .object({
    query: z.string().trim().min(1).optional(),
    status: z.enum(ServiceStatus).optional(),
    labelId: z.string().trim().min(1).optional(),
  })
  .strict();

export const serviceChecksQuerySchema = z
  .object({
    cursor: z.string().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(100).optional(),
  })
  .strict();

// --- Service labels ---
// Unlike the schemas above these emit machine-readable codes rather than
// prose: the manage-labels dialog maps them to locale-aware messages,
// exactly like the mail label schemas in @/lib/validation/mail.

const serviceLabelColorSchema = z
  .string({ error: "LABEL_COLOR_INVALID" })
  .transform((value) => value.trim().toUpperCase())
  .refine(isLabelColor, { error: "LABEL_COLOR_INVALID" })
  .transform((value) => value as LabelColor);

const serviceLabelNameSchema = z
  .string({ error: "LABEL_NAME_REQUIRED" })
  .transform(normalizeLabelDisplayName)
  .pipe(
    z
      .string()
      .min(1, { error: "LABEL_NAME_REQUIRED" })
      .max(40, { error: "LABEL_NAME_TOO_LONG" }),
  );

export const createServiceLabelSchema = z
  .object({
    name: serviceLabelNameSchema,
    color: serviceLabelColorSchema,
  })
  .strict();

export const updateServiceLabelSchema = z
  .object({
    name: serviceLabelNameSchema.optional(),
    color: serviceLabelColorSchema.optional(),
  })
  .strict()
  .refine((input) => input.name !== undefined || input.color !== undefined, {
    error: "LABEL_UPDATE_REQUIRED",
  });

export type CreateServiceLabelSchemaInput = z.infer<
  typeof createServiceLabelSchema
>;
export type UpdateServiceLabelSchemaInput = z.infer<
  typeof updateServiceLabelSchema
>;
