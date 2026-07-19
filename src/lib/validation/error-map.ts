import { z } from "zod";
import validationMessages from "@/messages/ru/validation.json";

// Global fallback — reached ONLY for schema calls that pass NO message at
// all. Cannot intercept schema-level literal/function messages (Zod v4
// precedence: schema-level > per-parse > global z.config > locale) — those
// source text from `validationMessages` directly at the call site instead.
//
// TODO(i18n): this is a static, Russian-only catalog with no request/locale
// awareness. Safe today because (a) there are zero client-side .parse()/
// .safeParse() calls on any @/lib/validation/* schema anywhere under
// src/components (verified by grep — schemas are only ever parsed
// server-side in route handlers) and (b) no second locale is planned
// imminently. If either of those changes, this needs a request-scoped
// rework (e.g. an error map built per-request from the active locale
// instead of registered once globally at boot).
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

export const VALIDATION_RU = validationMessages;
