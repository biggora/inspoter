import { SECTION_NAV_ITEMS } from "@/components/shell/nav-items";

export interface HelpArticle {
  slug: string;
  href: string;
  icon: string;
  titleKey: string;
  cardDescriptionKey: string;
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
  },
  {
    slug: "mail",
    href: "/help/mail",
    icon: iconFor("mail"),
    titleKey: "mailTitle",
    cardDescriptionKey: "mailCardDescription",
  },
  {
    slug: "messages",
    href: "/help/messages",
    icon: iconFor("messages"),
    titleKey: "messagesTitle",
    cardDescriptionKey: "messagesCardDescription",
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
  },
  {
    slug: "alerts",
    href: "/help/alerts",
    icon: iconFor("alerts"),
    titleKey: "alertsTitle",
    cardDescriptionKey: "alertsCardDescription",
  },
];

export function getHelpArticle(slug: string): HelpArticle | undefined {
  return HELP_ARTICLES.find((article) => article.slug === slug);
}
