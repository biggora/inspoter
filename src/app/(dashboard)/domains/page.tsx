import { Globe } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function DomainsPage() {
  return (
    <SectionPlaceholder
      section="Domains"
      description="Domain and DNS record management across Cloudflare, Hetzner, and GoDaddy will be available in a future release."
      icon={Globe}
    />
  );
}
