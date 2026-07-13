import { z } from "zod";

export const createWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
});

export const addMemberSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(6).optional(),
});
