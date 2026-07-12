import { Mail } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function MailPage() {
  return (
    <SectionPlaceholder
      section="Mail"
      description="Mail viewing, filtering, and webhook ingest will be available in a future release."
      icon={Mail}
    />
  );
}
