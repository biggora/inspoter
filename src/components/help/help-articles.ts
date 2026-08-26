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
  /**
   * Section can also be *managed* by a token, not merely written into
   * (docs/prd.md FR-MSG-004). Separate from `webhook` because it answers a
   * different question: not "how do I push an event here" but "how does an
   * assistant set this section up on its own".
   */
  managementApi?: HelpWebhook;
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
    // No incoming webhook: a bookmark is added by hand or by an agent, not
    // pushed in from the outside.
    managementApi: {
      endpoint: "GET|POST /api/v1/bookmarks",
      curl: `curl "http://your-host/api/v1/bookmarks?query=grafana" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
  },
  {
    slug: "kanban",
    href: "/help/kanban",
    icon: iconFor("kanban"),
    titleKey: "kanbanTitle",
    cardDescriptionKey: "kanbanCardDescription",
    // No incoming webhook: a card is created by hand or by an agent.
    managementApi: {
      endpoint: "POST /api/v1/kanban/cards",
      curl: `curl -X POST http://your-host/api/v1/kanban/cards \\
  -H "Authorization: Bearer YOUR_TOKEN" -H "Content-Type: application/json" \\
  -d '{"columnId":"COLUMN_ID","title":"Rotate the API token","priority":"HIGH"}'`,
    },
    outgoing: true,
  },
  {
    slug: "calendar",
    href: "/help/calendar",
    icon: iconFor("calendar"),
    titleKey: "calendarTitle",
    cardDescriptionKey: "calendarCardDescription",
  },
  {
    slug: "agents",
    href: "/help/agents",
    icon: iconFor("agents"),
    titleKey: "agentsTitle",
    cardDescriptionKey: "agentsCardDescription",
    // No incoming webhook and no management API: a run is started from the
    // interface or by its own schedule, and there is no /api/v1 twin — an
    // external client already drives the dashboard through POST /api/mcp.
    outgoing: true,
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
    // No incoming webhook: the dashboard runs the checks itself, so there is
    // nothing for an external system to push in.
    managementApi: {
      endpoint: "GET|POST /api/v1/services",
      curl: `curl "http://your-host/api/v1/services?status=DOWN" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
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
    // Unlike the webhook above, this works an existing IMAP mailbox rather
    // than filing into the built-in one: search, send, file drafts, label,
    // and sync.
    managementApi: {
      endpoint: "GET /api/v1/mail",
      curl: `curl "http://your-host/api/v1/mail?unread=true" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
    outgoing: true,
  },
  {
    slug: "contacts",
    href: "/help/contacts",
    icon: iconFor("contacts"),
    titleKey: "contactsTitle",
    cardDescriptionKey: "contactsCardDescription",
    // No incoming webhook: an address book is filled by import or by hand,
    // not pushed. The agent-facing REST/MCP surface is the API story here.
    managementApi: {
      endpoint: "GET|POST /api/v1/contacts",
      curl: `curl "http://your-host/api/v1/contacts?query=anna" \\
  -H "Authorization: Bearer YOUR_TOKEN"`,
    },
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
    // The workspace token goes in a header here, so unlike the two blocks
    // above this sample is safe to print in full.
    managementApi: {
      endpoint: "POST /api/v1/messages/categories",
      curl: `curl -X POST http://your-host/api/v1/messages/categories \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"name":"Deployments"}'`,
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
