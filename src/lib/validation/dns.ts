import { z } from "zod";
import { VALIDATION_RU } from "@/lib/validation/error-map";

// Zod schemas — DNS record input validation (AC-DOM-008): type-specific
// value formats are rejected before reaching the provider. Mirrors the
// refine-based style of validation/bookmarks.ts. Messages are Russian
// because they surface directly as fieldErrors in the DNS record dialog.

const RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV"] as const;

const ipv4Regex =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

const ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;

const hostnameRegex =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

function checkValueForType(
  type: (typeof RECORD_TYPES)[number],
  value: string,
  ctx: z.RefinementCtx,
) {
  if (type === "A" && !ipv4Regex.test(value)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: VALIDATION_RU.dns.ipv4Invalid,
    });
  }
  if (type === "AAAA" && !ipv6Regex.test(value)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: VALIDATION_RU.dns.ipv6Invalid,
    });
  }
  if ((type === "CNAME" || type === "NS") && !hostnameRegex.test(value)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: VALIDATION_RU.dns.hostnameInvalid.replace("{type}", type),
    });
  }
  if (type === "MX" && !hostnameRegex.test(value)) {
    ctx.addIssue({
      code: "custom",
      path: ["value"],
      message: VALIDATION_RU.dns.mxHostnameInvalid,
    });
  }
}

export const dnsRecordInputSchema = z
  .object({
    type: z.enum(RECORD_TYPES),
    name: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.dns.nameRequired }),
    value: z
      .string()
      .trim()
      .min(1, { error: () => VALIDATION_RU.dns.valueRequired }),
    ttl: z.coerce
      .number()
      .int()
      .positive({ error: () => VALIDATION_RU.dns.ttlInvalid }),
    priority: z.coerce.number().int().nonnegative().optional(),
  })
  .superRefine((data, ctx) => {
    checkValueForType(data.type, data.value, ctx);
    if (data.type === "MX" && data.priority === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["priority"],
        message: VALIDATION_RU.dns.mxPriorityRequired,
      });
    }
  });

export const dnsRecordPatchSchema = z
  .object({
    value: z.string().trim().min(1).optional(),
    ttl: z.coerce.number().int().positive().optional(),
    priority: z.coerce.number().int().nonnegative().optional(),
  })
  .refine(
    (data) =>
      data.value !== undefined ||
      data.ttl !== undefined ||
      data.priority !== undefined,
    { error: () => VALIDATION_RU.dns.atLeastOneFieldRequired },
  );

export type DnsRecordInputPayload = z.infer<typeof dnsRecordInputSchema>;
export type DnsRecordPatchPayload = z.infer<typeof dnsRecordPatchSchema>;
