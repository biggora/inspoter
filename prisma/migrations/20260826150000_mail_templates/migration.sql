CREATE TABLE "MailTemplate" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "starred" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplate_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MailTemplateTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MailTemplateTag_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MailTemplateTag_color_check" CHECK (
      "color" IN ('SLATE', 'RED', 'AMBER', 'GREEN', 'BLUE', 'VIOLET')
      OR "color" ~ '^#[0-9A-F]{6}$'
    )
);

CREATE TABLE "MailTemplateTagLink" (
    "workspaceId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateWorkspaceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "MailTemplate_id_workspaceId_key" ON "MailTemplate"("id", "workspaceId");
CREATE UNIQUE INDEX "MailTemplate_workspaceId_normalizedName_key" ON "MailTemplate"("workspaceId", "normalizedName");
CREATE INDEX "MailTemplate_workspaceId_starred_updatedAt_id_idx" ON "MailTemplate"("workspaceId", "starred", "updatedAt", "id");
CREATE UNIQUE INDEX "MailTemplateTag_id_workspaceId_key" ON "MailTemplateTag"("id", "workspaceId");
CREATE UNIQUE INDEX "MailTemplateTag_workspaceId_normalizedName_key" ON "MailTemplateTag"("workspaceId", "normalizedName");
CREATE INDEX "MailTemplateTag_workspaceId_normalizedName_idx" ON "MailTemplateTag"("workspaceId", "normalizedName");
CREATE UNIQUE INDEX "MailTemplateTagLink_templateId_tagId_key" ON "MailTemplateTagLink"("templateId", "tagId");
CREATE INDEX "MailTemplateTagLink_workspaceId_tagId_templateId_idx" ON "MailTemplateTagLink"("workspaceId", "tagId", "templateId");

ALTER TABLE "MailTemplate" ADD CONSTRAINT "MailTemplate_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailTemplateTag" ADD CONSTRAINT "MailTemplateTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailTemplateTagLink" ADD CONSTRAINT "MailTemplateTagLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailTemplateTagLink" ADD CONSTRAINT "MailTemplateTagLink_templateId_templateWorkspaceId_fkey" FOREIGN KEY ("templateId", "templateWorkspaceId") REFERENCES "MailTemplate"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MailTemplateTagLink" ADD CONSTRAINT "MailTemplateTagLink_tagId_tagWorkspaceId_fkey" FOREIGN KEY ("tagId", "tagWorkspaceId") REFERENCES "MailTemplateTag"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
