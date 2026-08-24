"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { fetchActivities } from "@/components/activity/api";
import { createActivityTools } from "@/components/activity/web-mcp-tools";
import {
  alertCategoriesApi,
  alertsApi,
  fetchAlerts,
} from "@/components/alerts/api";
import { createAlertsTools } from "@/components/alerts/web-mcp-tools";
import {
  bookmarkFaviconApi,
  bookmarksApi,
  categoriesApi,
} from "@/components/bookmarks/api";
import { createBookmarksTools } from "@/components/bookmarks/web-mcp-tools";
import { contactLabelsApi, contactsApi } from "@/components/contacts/api";
import { createContactsTools } from "@/components/contacts/web-mcp-tools";
import {
  createRecord,
  deleteRecord,
  fetchDomains,
  fetchRecords,
  updateRecord,
} from "@/components/domains/api";
import { createDomainsTools } from "@/components/domains/web-mcp-tools";
import {
  boardsApi,
  cardsApi,
  checklistApi,
  columnsApi,
  commentsApi,
  kanbanLabelsApi,
} from "@/components/kanban/api";
import { createKanbanTools } from "@/components/kanban/web-mcp-tools";
import { fetchLogs } from "@/components/logs/api";
import { createLogsTools } from "@/components/logs/web-mcp-tools";
import {
  assignMailLabel,
  deleteMailItem,
  fetchFolders,
  fetchMail,
  fetchMailAccounts,
  fetchMailById,
  fetchMailFilterRules,
  fetchMailLabels,
  moveMailItem,
  patchMailItem,
  removeMailLabel,
  saveMailDraft,
  sendMail,
  syncAccount,
} from "@/components/mail/api";
import { createMailTools } from "@/components/mail/web-mcp-tools";
import {
  channelsApi,
  channelWebhooksApi,
  fetchMessages,
  markChannelRead,
  messageCategoriesApi,
  sendMessage,
} from "@/components/messages/api";
import { createMessagesTools } from "@/components/messages/web-mcp-tools";
import { notesApi } from "@/components/notes/api";
import { createNotesTools } from "@/components/notes/web-mcp-tools";
import {
  fetchServers,
  getServerByLocalId,
  powerAction,
  refreshServers,
} from "@/components/servers/api";
import { createServersTools } from "@/components/servers/web-mcp-tools";
import { serviceLabelsApi, servicesApi } from "@/components/services/api";
import { createServicesTools } from "@/components/services/web-mcp-tools";
import { useWebMcpTools } from "@/hooks/use-web-mcp-tool";

// Mounts the whole browser-side WebMCP catalog — 98 tools across twelve
// domains (activity, alerts, bookmarks, contacts, domains, kanban, logs, mail,
// messages, notes, servers, services). Every one of them is page-independent:
// they reach their domain's /api client rather than reading live page state,
// so an agent can discover and call any tool from any dashboard route. Mounted
// from the dashboard layout outside the `{children}` slot, which is why they
// survive navigation.
//
// The api modules are plain object literals and standalone functions whose
// members never reference `this`, so they are passed through unbound.
export function WebMcpGlobalTools() {
  const router = useRouter();

  const tools = React.useMemo(() => {
    const refresh = () => router.refresh();

    return [
      ...createNotesTools({
        search: notesApi.search,
        listFolders: notesApi.tree,
        get: notesApi.get,
        create: notesApi.create,
        update: notesApi.update,
        remove: notesApi.remove,
        refresh,
      }),
      ...createMailTools({
        fetchMailAccounts,
        fetchFolders,
        fetchMail,
        fetchMailById,
        fetchMailLabels,
        fetchMailFilterRules,
        patchMailItem,
        moveMailItem,
        deleteMailItem,
        assignMailLabel,
        removeMailLabel,
        sendMail,
        saveMailDraft,
        syncAccount,
        refresh,
      }),
      ...createContactsTools({
        list: contactsApi.list,
        get: contactsApi.get,
        duplicates: contactsApi.duplicates,
        suggest: contactsApi.suggest,
        create: contactsApi.create,
        update: contactsApi.update,
        remove: contactsApi.remove,
        bulk: contactsApi.bulk,
        merge: contactsApi.merge,
        listLabels: contactLabelsApi.list,
        createLabel: contactLabelsApi.create,
        updateLabel: contactLabelsApi.update,
        removeLabel: contactLabelsApi.remove,
        refresh,
      }),
      ...createMessagesTools({
        listCategories: messageCategoriesApi.list,
        fetchMessages,
        sendMessage,
        markChannelRead,
        createCategory: messageCategoriesApi.create,
        renameCategory: messageCategoriesApi.rename,
        removeCategory: messageCategoriesApi.remove,
        createChannel: channelsApi.create,
        renameChannel: channelsApi.rename,
        removeChannel: channelsApi.remove,
        listWebhooks: channelWebhooksApi.list,
        refresh,
      }),
      ...createLogsTools({ fetchLogs }),
      ...createActivityTools({ fetchActivities }),
      ...createServicesTools({
        list: servicesApi.list,
        get: servicesApi.get,
        listChecks: servicesApi.listChecks,
        create: servicesApi.create,
        update: servicesApi.update,
        remove: servicesApi.remove,
        checkNow: servicesApi.checkNow,
        setActive: servicesApi.setActive,
        listLabels: serviceLabelsApi.list,
        createLabel: serviceLabelsApi.create,
        updateLabel: serviceLabelsApi.update,
        removeLabel: serviceLabelsApi.remove,
        refresh,
      }),
      ...createServersTools({
        fetchServers,
        getServerByLocalId,
        refreshServers,
        powerAction,
        refresh,
      }),
      ...createBookmarksTools({
        searchBookmarks: bookmarksApi.search,
        listCategories: categoriesApi.list,
        suggestFavicon: bookmarkFaviconApi.suggest,
        createBookmark: bookmarksApi.create,
        updateBookmark: bookmarksApi.update,
        deleteBookmark: bookmarksApi.remove,
        createCategory: categoriesApi.create,
        renameCategory: categoriesApi.rename,
        refresh,
      }),
      ...createDomainsTools({
        fetchDomains,
        fetchRecords,
        createRecord,
        updateRecord,
        deleteRecord,
        refresh,
      }),
      ...createKanbanTools({
        listBoards: boardsApi.list,
        getBoard: boardsApi.get,
        getCard: cardsApi.get,
        createCard: cardsApi.create,
        updateCard: cardsApi.update,
        deleteCard: cardsApi.remove,
        moveCards: cardsApi.move,
        setCardLabels: cardsApi.setLabels,
        listLabels: kanbanLabelsApi.list,
        listChecklist: checklistApi.list,
        addChecklistItem: checklistApi.add,
        updateChecklistItem: checklistApi.update,
        listComments: commentsApi.list,
        addComment: commentsApi.add,
        createColumn: columnsApi.create,
        refresh,
      }),
      ...createAlertsTools({
        fetchAlerts,
        listCategories: alertCategoriesApi.list,
        setCategoryBulk: alertsApi.setCategoryBulk,
        createCategory: alertCategoriesApi.create,
        refresh,
      }),
    ];
  }, [router]);

  useWebMcpTools(tools);

  return null;
}
