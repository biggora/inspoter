import type {
  OutgoingWebhookEventValue,
  WebhookDeliveryStatusValue,
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

export const DELIVERY_STATUS_LABEL_KEY: Record<
  WebhookDeliveryStatusValue,
  string
> = {
  PENDING: "deliveryPending",
  DELIVERING: "deliveryDelivering",
  DELIVERED: "deliveryDelivered",
  FAILED: "deliveryFailed",
};
