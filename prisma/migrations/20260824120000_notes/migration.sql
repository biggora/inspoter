-- Notes: an Obsidian-style note vault — arbitrarily nested folders, markdown
-- notes with a wiki-link index, managed color tags, and image attachments.
-- Additive only — no existing table is touched, other than the
-- DashboardWidgetKind enum extension below.
--
-- Follows the project's composite foreign key convention ([id, workspaceId])
-- so a column can never point at a row from another workspace, with the
-- workspace-consistency CHECKs mirroring 20260812120000_kanban.
--
-- Two deliberate departures from that migration's conventions:
--
-- (a) NoteFolder is self-referential with no depth limit expressed in the
-- foreign key itself. Category (prisma/schema.prisma) is the project's only
-- other self-relation through a composite FK, and its nesting is capped at
-- one level by an application-side check (assertParentIsTopLevel in
-- src/lib/services/bookmarks.ts), not by the schema. NoteFolder needs
-- arbitrary depth, so that one-level limit is lifted, and the guard moves to
-- a CHECK on the materialized "depth" column capped at 8
-- (NOTE_FOLDER_MAX_DEPTH). A CHECK only ever sees a single row, so it can
-- also reject immediate self-parenting ("parentFolderId" = "id"); a longer
-- cycle (A -> B -> C -> A) requires comparing rows to each other and is
-- caught instead by a recursive CTE in src/lib/services/note-folders.ts
-- before a move is committed.
--
-- (b) Note carries a GENERATED STORED tsvector column plus a GIN index for
-- full-text search. Prisma has no tsvector type, so the column is declared
-- Unsupported("tsvector") in the schema and is never read or written by the
-- generated client — all FTS queries go through $queryRaw in
-- src/lib/services/notes.ts.
--
-- The enum extension below only declares a new value; no row in this
-- migration uses it, which is what PostgreSQL requires when ALTER TYPE ...
-- ADD VALUE runs inside the migration transaction. Same technique as
-- 20260812120000_kanban.

-- AlterEnum
-- NOTES (this section's dashboard widget) is a separate enum value from the
-- existing NOTE (the single-note "sticky" widget, see
-- src/components/dashboards/widget-catalog.ts) — the name collision between
-- the singular and plural is intentional, not a typo: they are unrelated
-- widgets that happen to share a root word.
ALTER TYPE "DashboardWidgetKind" ADD VALUE 'NOTES';

-- CreateTable
CREATE TABLE "NoteFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "parentFolderId" TEXT,
    "parentFolderWorkspaceId" TEXT,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteFolder_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NoteFolder_workspace_consistency_check"
      CHECK ("parentFolderWorkspaceId" IS NULL OR "workspaceId" = "parentFolderWorkspaceId"),
    CONSTRAINT "NoteFolder_parent_pair_check"
      CHECK (("parentFolderId" IS NULL) = ("parentFolderWorkspaceId" IS NULL)),
    -- The only cycle a CHECK can see; anything longer needs the recursive
    -- CTE in src/lib/services/note-folders.ts.
    CONSTRAINT "NoteFolder_self_parent_check"
      CHECK ("parentFolderId" IS NULL OR "parentFolderId" <> "id"),
    -- Mirrors NOTE_FOLDER_MAX_DEPTH.
    CONSTRAINT "NoteFolder_depth_check"
      CHECK ("depth" >= 0 AND "depth" <= 8)
);

-- CreateTable
CREATE TABLE "Note" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "folderId" TEXT,
    "folderWorkspaceId" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "excerpt" TEXT NOT NULL DEFAULT '',
    "isPinned" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    -- 'simple', not 'english': the product is bilingual (en/ru) and the
    -- English stemmer turns Russian text into noise. 'simple' is also
    -- IMMUTABLE, which a GENERATED column requires. Title is weighted above
    -- body via setweight.
    "searchVector" tsvector GENERATED ALWAYS AS (
      setweight(to_tsvector('simple', coalesce("title", '')), 'A')
      || setweight(to_tsvector('simple', coalesce("content", '')), 'B')
    ) STORED,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Note_workspace_consistency_check"
      CHECK ("folderWorkspaceId" IS NULL OR "workspaceId" = "folderWorkspaceId"),
    CONSTRAINT "Note_folder_pair_check"
      CHECK (("folderId" IS NULL) = ("folderWorkspaceId" IS NULL))
);

-- CreateTable
CREATE TABLE "NoteLink" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sourceNoteId" TEXT NOT NULL,
    "sourceNoteWorkspaceId" TEXT NOT NULL,
    "targetNoteId" TEXT,
    "targetNoteWorkspaceId" TEXT,
    "targetTitle" TEXT NOT NULL,
    "displayText" TEXT,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteLink_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NoteLink_workspace_consistency_check"
      CHECK (
        "workspaceId" = "sourceNoteWorkspaceId"
        AND ("targetNoteWorkspaceId" IS NULL OR "workspaceId" = "targetNoteWorkspaceId")
      ),
    CONSTRAINT "NoteLink_target_pair_check"
      CHECK (("targetNoteId" IS NULL) = ("targetNoteWorkspaceId" IS NULL)),
    -- A note cannot link to itself.
    CONSTRAINT "NoteLink_self_link_check"
      CHECK ("targetNoteId" IS NULL OR "targetNoteId" <> "sourceNoteId")
);

-- CreateTable
CREATE TABLE "NoteTag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoteTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NoteTagLink" (
    "workspaceId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "noteWorkspaceId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "tagWorkspaceId" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteTagLink_workspace_consistency_check"
      CHECK (
        "workspaceId" = "noteWorkspaceId"
        AND "workspaceId" = "tagWorkspaceId"
      )
);

-- CreateTable
CREATE TABLE "NoteAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "noteId" TEXT NOT NULL,
    "noteWorkspaceId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NoteAsset_workspace_consistency_check"
      CHECK ("workspaceId" = "noteWorkspaceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteFolder_id_workspaceId_key" ON "NoteFolder"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "NoteFolder_workspaceId_parentFolderId_position_id_idx" ON "NoteFolder"("workspaceId", "parentFolderId", "position", "id");

-- CreateIndex
-- Two partial unique indexes for sibling name uniqueness, not one: Postgres
-- treats every NULL as distinct from every other NULL, so a single index on
-- ("workspaceId","parentFolderId","normalizedName") would silently allow two
-- root folders both named "Inbox" (both rows have parentFolderId = NULL).
-- Partial indexes work on any PostgreSQL version, unlike
-- UNIQUE NULLS NOT DISTINCT (16+ only).
CREATE UNIQUE INDEX "NoteFolder_workspaceId_parent_normalizedName_key"
  ON "NoteFolder"("workspaceId", "parentFolderId", "normalizedName")
  WHERE "parentFolderId" IS NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "NoteFolder_workspaceId_root_normalizedName_key"
  ON "NoteFolder"("workspaceId", "normalizedName")
  WHERE "parentFolderId" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Note_id_workspaceId_key" ON "Note"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Note_workspaceId_normalizedTitle_key" ON "Note"("workspaceId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "Note_workspaceId_folderId_normalizedTitle_idx" ON "Note"("workspaceId", "folderId", "normalizedTitle");

-- CreateIndex
CREATE INDEX "Note_workspaceId_updatedAt_id_idx" ON "Note"("workspaceId", "updatedAt", "id");

-- CreateIndex
CREATE INDEX "Note_searchVector_idx" ON "Note" USING GIN ("searchVector");

-- CreateIndex
CREATE UNIQUE INDEX "NoteLink_sourceNoteId_targetTitle_key" ON "NoteLink"("sourceNoteId", "targetTitle");

-- CreateIndex
CREATE INDEX "NoteLink_workspaceId_targetNoteId_idx" ON "NoteLink"("workspaceId", "targetNoteId");

-- CreateIndex
CREATE INDEX "NoteLink_workspaceId_targetTitle_idx" ON "NoteLink"("workspaceId", "targetTitle");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTag_id_workspaceId_key" ON "NoteTag"("id", "workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTag_workspaceId_normalizedName_key" ON "NoteTag"("workspaceId", "normalizedName");

-- CreateIndex
CREATE INDEX "NoteTag_workspaceId_normalizedName_idx" ON "NoteTag"("workspaceId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "NoteTagLink_noteId_tagId_key" ON "NoteTagLink"("noteId", "tagId");

-- CreateIndex
CREATE INDEX "NoteTagLink_workspaceId_tagId_noteId_idx" ON "NoteTagLink"("workspaceId", "tagId", "noteId");

-- CreateIndex
CREATE UNIQUE INDEX "NoteAsset_id_workspaceId_key" ON "NoteAsset"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "NoteAsset_workspaceId_noteId_createdAt_idx" ON "NoteAsset"("workspaceId", "noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteFolder" ADD CONSTRAINT "NoteFolder_parentFolderId_parentFolderWorkspaceId_fkey" FOREIGN KEY ("parentFolderId", "parentFolderWorkspaceId") REFERENCES "NoteFolder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_folderId_folderWorkspaceId_fkey" FOREIGN KEY ("folderId", "folderWorkspaceId") REFERENCES "NoteFolder"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_sourceNoteId_sourceNoteWorkspaceId_fkey" FOREIGN KEY ("sourceNoteId", "sourceNoteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteLink" ADD CONSTRAINT "NoteLink_targetNoteId_targetNoteWorkspaceId_fkey" FOREIGN KEY ("targetNoteId", "targetNoteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTag" ADD CONSTRAINT "NoteTag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTagLink" ADD CONSTRAINT "NoteTagLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTagLink" ADD CONSTRAINT "NoteTagLink_noteId_noteWorkspaceId_fkey" FOREIGN KEY ("noteId", "noteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteTagLink" ADD CONSTRAINT "NoteTagLink_tagId_tagWorkspaceId_fkey" FOREIGN KEY ("tagId", "tagWorkspaceId") REFERENCES "NoteTag"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAsset" ADD CONSTRAINT "NoteAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteAsset" ADD CONSTRAINT "NoteAsset_noteId_noteWorkspaceId_fkey" FOREIGN KEY ("noteId", "noteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
