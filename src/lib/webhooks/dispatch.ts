import * as logsService from "@/lib/services/logs";
import * as alertsService from "@/lib/services/alerts";
import * as mailService from "@/lib/services/mail";
import * as messagesService from "@/lib/services/messages";
import type {
  LogWebhookPayload,
  AlertWebhookPayload,
  MailWebhookPayload,
  MessageWebhookPayload,
} from "@/lib/validation/webhooks";

export class UnsupportedWebhookTypeError extends Error {
  code = "UNSUPPORTED_TYPE" as const;
  constructor(type: string) {
    super(`Unsupported webhook type: ${type}`);
  }
}

export class ChannelNotFoundWebhookError extends Error {
  code = "CHANNEL_NOT_FOUND" as const;
  constructor(channelId: string) {
    super(`Channel not found: ${channelId}`);
  }
}

type Handler = (
  workspaceId: string,
  payload: unknown,
) => Promise<{ id: string }>;

const handlers: Record<string, Handler> = {
  log: (workspaceId, payload) =>
    logsService.create(workspaceId, payload as LogWebhookPayload),
  alert: (workspaceId, payload) =>
    alertsService.create(workspaceId, payload as AlertWebhookPayload),
  mail: (workspaceId, payload) =>
    mailService.create(workspaceId, payload as MailWebhookPayload),
  message: async (workspaceId, payload) => {
    try {
      return await messagesService.createMessage(workspaceId, {
        ...(payload as MessageWebhookPayload),
        origin: "WEBHOOK",
      });
    } catch (error) {
      if (error instanceof messagesService.ChannelNotFoundError) {
        throw new ChannelNotFoundWebhookError(
          (payload as MessageWebhookPayload).channelId,
        );
      }
      throw error;
    }
  },
};

export async function dispatch(
  type: string,
  payload: unknown,
  workspaceId: string,
): Promise<{ id: string }> {
  const handler = handlers[type];
  if (!handler) throw new UnsupportedWebhookTypeError(type);
  return handler(workspaceId, payload);
}
