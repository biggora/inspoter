import { z } from "zod";
import validationMessages from "@/messages/en/validation.json";

// Global fallback — reached ONLY for schema calls that pass NO message at
// all. Cannot intercept schema-level literal/function messages (Zod v4
// precedence: schema-level > per-parse > global z.config > locale) — those
// source text from `validationMessages` directly at the call site instead.
//
// English is the base language of the product, so this catalog is pinned to
// the English messages rather than translated per request. Schemas are
// parsed only server-side (there are zero client-side .parse()/.safeParse()
// calls on any @/lib/validation/* schema under src/components), and the
// resulting issues travel back as an /api/** JSON body — a surface that has
// no `[locale]` segment and is deliberately excluded from next-intl routing
// in src/proxy.ts, so no active locale is in scope there. Localizing these
// would mean resolving the request locale in every route handler (or
// returning message keys and translating them client-side) — a separate,
// larger change than pinning the base language.
z.config({
  customError: (iss) => {
    switch (iss.code) {
      case "invalid_type":
        return validationMessages.generic.invalidType;
      case "too_small":
        return validationMessages.generic.tooSmall;
      case "too_big":
        return validationMessages.generic.tooBig;
      case "invalid_format":
        return validationMessages.generic.invalidFormat;
      case "not_multiple_of":
        return validationMessages.generic.notMultipleOf;
      case "unrecognized_keys":
        return validationMessages.generic.unrecognizedKeys;
      case "invalid_union":
        return validationMessages.generic.invalidUnion;
      case "invalid_key":
        return validationMessages.generic.invalidKey;
      case "invalid_element":
        return validationMessages.generic.invalidElement;
      case "invalid_value":
        return validationMessages.generic.invalidValue;
      case "custom":
        return validationMessages.generic.custom;
      default:
        return validationMessages.generic.custom;
    }
  },
});

export const VALIDATION_MESSAGES = validationMessages;
