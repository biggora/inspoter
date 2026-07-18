import { NextResponse, type NextRequest } from "next/server";
import { requireAuthWithWorkspaceHeader } from "@/lib/auth/dal";
import { db } from "@/lib/db";
import { MailAccountNotFoundError } from "@/lib/services/mail-accounts";
import { toErrorResponse } from "@/lib/api/errors";
import { jsonResponse } from "@/lib/api/response";

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Folder list for the mail UI sidebar (member access, plan §4): sorted by
// position then name, with unread counts from a single groupBy. BigInt
// columns (uidValidity/lastSeenUid) intentionally never leave the server.
export async function GET(request: NextRequest, { params }: RouteContext) {
  const authResult = await requireAuthWithWorkspaceHeader(request).catch(
    (error) => toErrorResponse(error),
  );
  if (authResult instanceof NextResponse) return authResult;
  const { workspace } = authResult;
  const { id } = await params;

  const account = await db.mailAccount.findFirst({
    where: { id, workspaceId: workspace.id },
    select: { id: true },
  });
  if (!account) {
    const error = new MailAccountNotFoundError(id);
    return jsonResponse({ error: error.message }, { status: 404 });
  }

  const folders = await db.mailFolder.findMany({
    where: { accountId: id, workspaceId: workspace.id },
    orderBy: [{ position: "asc" }, { name: "asc" }],
  });
  const unreadCounts = await db.mailItem.groupBy({
    by: ["folderId"],
    where: { accountId: id, workspaceId: workspace.id, isRead: false },
    _count: true,
  });
  const unreadByFolder = new Map(
    unreadCounts.map((row) => [row.folderId, row._count]),
  );

  return jsonResponse(
    folders.map((folder) => ({
      id: folder.id,
      path: folder.path,
      name: folder.name,
      specialUse: folder.specialUse,
      position: folder.position,
      unreadCount: unreadByFolder.get(folder.id) ?? 0,
    })),
  );
}
