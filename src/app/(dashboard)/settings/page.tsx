import { Settings } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

// Settings placeholder — additive to the seven PRD sections (design.md §9
// C-1 / plan.md §9 C-1), hosting future webhook-token management (Slice 4).
// Tester note (plan.md §5.4 item 4): verified as a smoke check (route
// resolves at 200), not an AC-SHELL-003 assertion — that AC's section count
// stays exactly seven.
export default function SettingsPage() {
  return (
    <SectionPlaceholder
      section="Settings"
      description="Webhook token management will be available in a future release."
      icon={Settings}
    />
  );
}
