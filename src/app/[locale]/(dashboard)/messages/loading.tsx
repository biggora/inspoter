import { MessagesSkeleton } from "@/components/messages/messages-skeleton";
import { PageBody } from "@/components/shell/page-body";

export default function MessagesLoading() {
  return (
    <PageBody fullBleed>
      <MessagesSkeleton />
    </PageBody>
  );
}
