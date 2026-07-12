import { Bell } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function AlertsPage() {
  return (
    <SectionPlaceholder
      section="Alerts"
      description="Categorized alert viewing and webhook ingest will be available in a future release."
      icon={Bell}
    />
  );
}
