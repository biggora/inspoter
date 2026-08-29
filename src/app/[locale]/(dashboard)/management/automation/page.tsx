import { ManagementAutomationView } from "@/components/management/management-automation-view";
import { requireAuth } from "@/lib/auth/dal";

export const dynamic = "force-dynamic";

// The AI-brief configuration surface split off the management landing
// (critique 2026-08-29, P2): provider, agent, skill, schedules, and brief
// history. No kanban targets needed here.
export default async function ManagementAutomationPage() {
  await requireAuth();
  return <ManagementAutomationView />;
}
