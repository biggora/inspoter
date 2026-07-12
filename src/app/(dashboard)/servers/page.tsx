import { Server } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function ServersPage() {
  return (
    <SectionPlaceholder
      section="Servers"
      description="Hetzner VPS monitoring and power controls will be available in a future release."
      icon={Server}
    />
  );
}
