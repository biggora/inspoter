import { z } from "zod";

export const createWebhookTokenSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
});

export type CreateWebhookTokenInput = z.infer<typeof createWebhookTokenSchema>;
