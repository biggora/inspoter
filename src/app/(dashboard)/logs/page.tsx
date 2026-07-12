import { ScrollText } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function LogsPage() {
  return (
    <SectionPlaceholder
      section="Logs"
      description="Log viewing, filtering, and webhook ingest will be available in a future release."
      icon={ScrollText}
    />
  );
}
