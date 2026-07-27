import { z } from "zod";
import { SECTION_KEYS } from "@/components/shell/nav-items";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

// Section visibility (workspace-section-visibility): sanitizes the incoming
// keys — drops anything not in SECTION_KEYS and de-duplicates — so an unknown
// or repeated key can never reach the DB.
export const updateSectionVisibilitySchema = z.object({
  hiddenSections: z
    .array(z.string())
    .transform((keys) => [
      ...new Set(keys.filter((key) => SECTION_KEYS.includes(key))),
    ]),
});

// Section-wide kill switch for the background provider-listing refresh.
// Same sanitising shape as section visibility above: unknown or repeated
// kinds are dropped rather than rejected.
export const AUTO_REFRESH_KINDS = [
  "DNS_ZONES",
  "HOSTING_ACCOUNTS",
  "SERVERS",
] as const;

export const updateAutoRefreshSchema = z.object({
  disabledKinds: z
    .array(z.enum(AUTO_REFRESH_KINDS))
    .transform((kinds) => [...new Set(kinds)]),
});

export const addMemberSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6).optional(),
});
