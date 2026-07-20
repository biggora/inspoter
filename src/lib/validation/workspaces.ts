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

export const addMemberSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6).optional(),
});
