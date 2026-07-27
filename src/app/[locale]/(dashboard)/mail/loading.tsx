import { MailSkeleton } from "@/components/mail/mail-skeleton";
import { PageBody } from "@/components/shell/page-body";

export default function MailLoading() {
  return (
    <PageBody fullBleed>
      <MailSkeleton />
    </PageBody>
  );
}
