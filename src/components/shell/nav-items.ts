import {
  Bell,
  Bookmark,
  Globe,
  Mail,
  MessagesSquare,
  ScrollText,
  Server,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

// AC-SHELL-001: the seven PRD sections, in design.md §3.2.1 order.
export const SECTION_NAV_ITEMS: NavItem[] = [
  { href: "/bookmarks", label: "Bookmarks", icon: Bookmark },
  { href: "/domains", label: "Domains", icon: Globe },
  { href: "/servers", label: "Servers", icon: Server },
  { href: "/mail", label: "Mail", icon: Mail },
  { href: "/messages", label: "Messages", icon: MessagesSquare },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/alerts", label: "Alerts", icon: Bell },
];

// Additive to the seven PRD sections (design.md §9 C-1 / plan.md §9 C-1) —
// hosts future webhook-token management (Slice 4). Rendered in the same nav
// landmark, below a separator.
export const SETTINGS_NAV_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};
