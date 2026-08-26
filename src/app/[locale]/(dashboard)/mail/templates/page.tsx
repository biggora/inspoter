import { MailTemplatesView } from "@/components/mail/mail-templates-view";
import type {
  MailTemplateListDto,
  MailTemplateTagSummaryDto,
} from "@/components/mail/api";
import { requireAuth } from "@/lib/auth/dal";
import {
  listMailTemplates,
  listMailTemplateTags,
} from "@/lib/services/mail-templates";
import { listMailTemplatesQuerySchema } from "@/lib/validation/mail";

export const dynamic = "force-dynamic";

interface MailTemplatesPageProps {
  searchParams: Promise<{
    query?: string;
    tagId?: string;
    starred?: string;
    page?: string;
  }>;
}

export default async function MailTemplatesPage({
  searchParams,
}: MailTemplatesPageProps) {
  const { workspace } = await requireAuth();
  const raw = await searchParams;
  const parsed = listMailTemplatesQuerySchema.safeParse(raw);
  const filters = parsed.success
    ? parsed.data
    : {
        query: "",
        tagId: undefined,
        starred: undefined,
        page: 1,
        pageSize: 24,
      };
  const [result, tags] = await Promise.all([
    listMailTemplates(workspace.id, filters),
    listMailTemplateTags(workspace.id),
  ]);

  const clientResult: MailTemplateListDto = {
    ...result,
    items: result.items.map((template) => ({
      ...template,
      createdAt: template.createdAt.toISOString(),
      updatedAt: template.updatedAt.toISOString(),
    })),
  };
  const clientTags: MailTemplateTagSummaryDto[] = tags.map((tag) => ({
    ...tag,
    color: tag.color,
  }));

  return (
    <MailTemplatesView
      result={clientResult}
      tags={clientTags}
      filters={{
        query: filters.query ?? "",
        tagId: filters.tagId ?? null,
        starred: filters.starred === true,
        page: filters.page,
      }}
    />
  );
}
