import { MessagesSquare } from "lucide-react";
import { SectionPlaceholder } from "@/components/shell/section-placeholder";

export default function MessagesPage() {
  return (
    <SectionPlaceholder
      section="Messages"
      description="Discord-style categories and channels for incoming messages will be available in a future release."
      icon={MessagesSquare}
    />
  );
}
