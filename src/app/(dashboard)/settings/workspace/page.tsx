import { requireAuth } from "@/lib/auth/dal";
import * as workspacesService from "@/lib/services/workspaces";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { AddMemberForm } from "@/components/workspace/add-member-form";
import { CreateWorkspaceForm } from "@/components/workspace/create-workspace-form";
import { MembersSection } from "@/components/workspace/members-section";
import { RenameWorkspaceForm } from "@/components/workspace/rename-workspace-form";

export const dynamic = "force-dynamic";

// Settings > Workspace management page (task spec: rename, members, add
// member, create new workspace). Server Component fetches its data directly
// through the service layer (the sole sanctioned pattern outside API routes,
// src/lib/auth/dal.ts) and hands it to Client Components for the interactive
// parts, mirroring src/app/(dashboard)/bookmarks/page.tsx.
export default async function WorkspaceSettingsPage() {
  const { workspace } = await requireAuth();
  const members = await workspacesService.listMembers(workspace.id);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-xl font-semibold text-foreground">Рабочее пространство</h1>

      <Card>
        <CardHeader>
          <CardTitle>Название рабочего пространства</CardTitle>
          <CardDescription>Переименовать текущее рабочее пространство.</CardDescription>
        </CardHeader>
        <CardContent>
          <RenameWorkspaceForm
            workspaceId={workspace.id}
            currentName={workspace.name}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Участники</CardTitle>
          <CardDescription>
            Операторы с доступом к этому рабочему пространству.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <MembersSection workspaceId={workspace.id} members={members} />
          <AddMemberForm workspaceId={workspace.id} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Создать новое рабочее пространство</CardTitle>
          <CardDescription>
            Начните новое пустое рабочее пространство и переключитесь на него.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CreateWorkspaceForm />
        </CardContent>
      </Card>
    </div>
  );
}
