import type {
  OutgoingWebhookEventValue,
  OutgoingWebhookFormatValue,
} from "./outgoing-webhooks-api";

// Maps enum values to next-intl keys in the "settings" namespace. Shared by
// the webhooks view and the deliveries dialog.
export const EVENT_LABEL_KEY: Record<OutgoingWebhookEventValue, string> = {
  ALERT_CREATED: "eventAlertCreated",
  SERVICE_STATUS: "eventServiceStatus",
  MESSAGE_CREATED: "eventMessageCreated",
  LOG_CREATED: "eventLogCreated",
  MAIL_RECEIVED: "eventMailReceived",
};

export const ALL_EVENTS: OutgoingWebhookEventValue[] = [
  "ALERT_CREATED",
  "SERVICE_STATUS",
  "MESSAGE_CREATED",
  "LOG_CREATED",
  "MAIL_RECEIVED",
];

// Wire formats (specs/discord-webhook-compatibility.md §6-§7).
export const FORMAT_LABEL_KEY: Record<OutgoingWebhookFormatValue, string> = {
  INSPOT: "formatInspot",
  DISCORD_EXECUTE: "formatDiscordExecute",
  DISCORD_EVENTS: "formatDiscordEvents",
};

export const FORMAT_HINT_KEY: Record<OutgoingWebhookFormatValue, string> = {
  INSPOT: "formatInspotHint",
  DISCORD_EXECUTE: "formatDiscordExecuteHint",
  DISCORD_EVENTS: "formatDiscordEventsHint",
};

export const ALL_FORMATS: OutgoingWebhookFormatValue[] = [
  "INSPOT",
  "DISCORD_EXECUTE",
  "DISCORD_EVENTS",
];
