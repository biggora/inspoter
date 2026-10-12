-- Note images: pictures embedded in note content as
-- ![alt](/api/notes/images/<id>) and served by an authenticated route. Bytes
-- live in the database, like contact photos and mail attachments.
-- Additive only — no existing table is touched. NoteAsset (20260824120000_notes)
-- is left alone: it is unused and requires a note up front, whereas an image
-- is uploaded before the note that references it is saved.
--
-- Follows the project's composite foreign key convention ([id, workspaceId])
-- so an image can never point at a note from another workspace. noteId is
-- optional: it stays NULL until the note is saved with the image referenced,
-- and NULL rows older than the grace period are swept as orphans by
-- src/lib/services/note-image-retention-scheduler.ts. Deleting a note
-- cascades to its images.

-- CreateTable
CREATE TABLE "NoteImage" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "noteId" TEXT,
    "noteWorkspaceId" TEXT,
    "contentType" TEXT NOT NULL,
    "bytes" BYTEA NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NoteImage_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NoteImage_workspace_consistency_check"
      CHECK ("noteWorkspaceId" IS NULL OR "workspaceId" = "noteWorkspaceId"),
    CONSTRAINT "NoteImage_note_pair_check"
      CHECK (("noteId" IS NULL) = ("noteWorkspaceId" IS NULL))
);

-- CreateIndex
CREATE UNIQUE INDEX "NoteImage_id_workspaceId_key" ON "NoteImage"("id", "workspaceId");

-- CreateIndex
CREATE INDEX "NoteImage_workspaceId_sha256_idx" ON "NoteImage"("workspaceId", "sha256");

-- CreateIndex
CREATE INDEX "NoteImage_noteId_createdAt_idx" ON "NoteImage"("noteId", "createdAt");

-- AddForeignKey
ALTER TABLE "NoteImage" ADD CONSTRAINT "NoteImage_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NoteImage" ADD CONSTRAINT "NoteImage_noteId_noteWorkspaceId_fkey" FOREIGN KEY ("noteId", "noteWorkspaceId") REFERENCES "Note"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
