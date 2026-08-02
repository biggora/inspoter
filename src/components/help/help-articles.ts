import { SECTION_NAV_ITEMS } from "@/components/shell/nav-items";

export interface HelpWebhook {
  /** Displayed endpoint, e.g. "POST /api/webhooks/log". */
  endpoint: string;
  /**
   * Ready-to-paste sample request. Absent where the body is produced by an
   * agent rather than a human (Servers): the article then documents only the
   * endpoint, with no sample and no field list.
   */
  curl?: string;
}

export interface HelpArticle {
  slug: string;
  href: string;
  icon: string;
  titleKey: string;
  cardDescriptionKey: string;
  /** Section accepts data pushed in from the outside. */
  webhook?: HelpWebhook;
  /**
   * Section also accepts the Discord wire format on a second route
   * (specs/discord-webhook-compatibility.md). Documented as its own block
   * because the payload and the response codes differ from `webhook` above.
   */
  discord?: HelpWebhook;
  /** Section emits outgoing-webhook events (Settings > Outgoing webhooks). */
  outgoing?: boolean;
}

function iconFor(key: string): string {
  return SECTION_NAV_ITEMS.find((item) => item.key === key)!.icon;
}

// One entry per SECTION_NAV_ITEMS key, in sidebar order. Explicit (not
// derived) so a future 11th sidebar section doesn't silently render a Help
// card with missing i18n keys.
export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: "dashboards",
    href: "/help/dashboards",
    icon: iconFor("dashboards"),
    titleKey: "dashboardsTitle",
    cardDescriptionKey: "dashboardsCardDescription",
  },
  {
    slug: "bookmarks",
    href: "/help/bookmarks",
    icon: iconFor("bookmarks"),
    titleKey: "bookmarksTitle",
    cardDescriptionKey: "bookmarksCardDescription",
  },
  {
    slug: "domains",
    href: "/help/domains",
    icon: iconFor("domains"),
    titleKey: "domainsTitle",
    cardDescriptionKey: "domainsCardDescription",
  },
  {
    slug: "servers",
    href: "/help/servers",
    icon: iconFor("servers"),
    titleKey: "serversTitle",
    cardDescriptionKey: "serversCardDescription",
    // No sample: the body is assembled by the metrics agent, not by hand.
    webhook: { endpoint: "POST /api/server-metrics" },
  },
  {
    slug: "hosting",
    href: "/help/hosting",
    icon: iconFor("hosting"),
    titleKey: "hostingTitle",
    cardDescriptionKey: "hostingCardDescription",
  },
  {
    slug: "services",
    href: "/help/services",
    icon: iconFor("services"),
    titleKey: "servicesTitle",
    cardDescriptionKey: "servicesCardDescription",
    outgoing: true,
  },
  {
    slug: "mail",
    href: "/help/mail",
    icon: iconFor("mail"),
    titleKey: "mailTitle",
    cardDescriptionKey: "mailCardDescription",
    webhook: {
      endpoint: "POST /api/webhooks/mail",
      curl: `curl -X POST http://your-host/api/webhooks/mail \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"sender":"noreply@example.com","subject":"Test","body":"Hello"}'`,
    },
    outgoing: true,
  },
  {
    slug: "messages",
    href: "/help/messages",
    icon: iconFor("messages"),
    titleKey: "messagesTitle",
    cardDescriptionKey: "messagesCardDescription",
    // Only the workspace-wide endpoint is printed: a channel webhook URL
    // carries its credential in the path and must stay out of docs and logs.
    webhook: {
      endpoint: "POST /api/webhooks/message",
      curl: `curl -X POST http://your-host/api/webhooks/message \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"channelId":"CHANNEL_ID","content":"Hello","author":"deploy-bot"}'`,
    },
    // Placeholders, not a real credential: the Discord form carries its secret
    // in the path, so the sample must stay as unusable as the endpoint above.
    discord: {
      endpoint: "POST /api/discord/webhooks/{webhook-id}/{token}",
      curl: `curl -X POST http://your-host/api/discord/webhooks/WEBHOOK_ID/WEBHOOK_TOKEN \\
  -H "Content-Type: application/json" \\
  -d '{"username":"CI","content":"Build 842 passed","embeds":[{"title":"Build 842","description":"All checks passed.","color":3066993,"fields":[{"name":"branch","value":"main","inline":true}]}]}'`,
    },
    outgoing: true,
  },
  {
    slug: "activity",
    href: "/help/activity",
    icon: iconFor("activity"),
    titleKey: "activityTitle",
    cardDescriptionKey: "activityCardDescription",
  },
  {
    slug: "logs",
    href: "/help/logs",
    icon: iconFor("logs"),
    titleKey: "logsTitle",
    cardDescriptionKey: "logsCardDescription",
    webhook: {
      endpoint: "POST /api/webhooks/log",
      curl: `curl -X POST http://your-host/api/webhooks/log \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"level":"info","source":"test","message":"Hello"}'`,
    },
    outgoing: true,
  },
  {
    slug: "alerts",
    href: "/help/alerts",
    icon: iconFor("alerts"),
    titleKey: "alertsTitle",
    cardDescriptionKey: "alertsCardDescription",
    webhook: {
      endpoint: "POST /api/webhooks/alert",
      curl: `curl -X POST http://your-host/api/webhooks/alert \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"category":"deploy","severity":"warning","source":"test","message":"Hello"}'`,
    },
    outgoing: true,
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}
