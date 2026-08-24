"use client";

import { useRouter } from "next/navigation";

import { notesApi } from "@/components/notes/api";
import {
  createCreateNoteTool,
  createSearchNotesTool,
} from "@/components/notes/web-mcp-tools";
import { useWebMcpTool } from "@/hooks/use-web-mcp-tool";

// Mounts the WebMCP tools that need no live page state, so they stay
// registered on every dashboard route. Rendered from the dashboard layout
// outside the `{children}` slot — the page-scoped tools (kanban, alerts,
// servers) stay with their own components.
export function WebMcpGlobalTools() {
  const router = useRouter();

  useWebMcpTool(createSearchNotesTool({ search: notesApi.search }));
  useWebMcpTool(
    createCreateNoteTool({
      listFolders: notesApi.tree,
      create: notesApi.create,
      refresh: () => router.refresh(),
    }),
  );

  return null;
}
