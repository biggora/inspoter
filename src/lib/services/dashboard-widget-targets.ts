import * as bookmarksService from "@/lib/services/bookmarks";
import * as mailAccountsService from "@/lib/services/mail-accounts";
import * as serversService from "@/lib/services/servers";
import * as servicesService from "@/lib/services/services";

// The option lists the widget configuration dialogs offer: which bookmark
// category, which services, which server, which mailbox. Loaded once with the
// dashboard page rather than fetched per dialog, because all four lists are
// small and the dialogs must open instantly.
//
// Ids only, plus a display name — nothing here is widget data, so this never
// grows into a second copy of resolveWidgetData().

export interface WidgetTargetOption {
  id: string;
  name: string;
}

export interface WidgetTargets {
  bookmarkCategories: WidgetTargetOption[];
  services: WidgetTargetOption[];
  servers: WidgetTargetOption[];
  mailAccounts: WidgetTargetOption[];
}

export async function listConfigurableTargets(
  workspaceId: string,
): Promise<WidgetTargets> {
  const [categories, services, servers, mailAccounts] = await Promise.all([
    bookmarksService.list(workspaceId),
    servicesService.list(workspaceId),
    serversService.listLocalServerMetrics(workspaceId),
    mailAccountsService.listAccounts(workspaceId),
  ]);

  // Subcategories are offered too, prefixed with their parent, so "Прод / БД"
  // is selectable and unambiguous.
  const bookmarkCategories: WidgetTargetOption[] = [];
  for (const category of categories) {
    bookmarkCategories.push({ id: category.id, name: category.name });
    for (const child of category.childCategories) {
      bookmarkCategories.push({
        id: child.id,
        name: `${category.name} / ${child.name}`,
      });
    }
  }

  return {
    bookmarkCategories,
    services: services.map((service) => ({
      id: service.id,
      name: service.name,
    })),
    servers: servers.map((server) => ({
      id: server.localServerId,
      name: server.name,
    })),
    mailAccounts: mailAccounts.map((account) => ({
      id: account.id,
      name: account.name,
    })),
  };
}
