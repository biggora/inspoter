-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "parentCategoryId" TEXT,
ADD COLUMN     "parentCategoryWorkspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Category_workspaceId_parentCategoryId_position_id_idx" ON "Category"("workspaceId", "parentCategoryId", "position", "id");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentCategoryId_parentCategoryWorkspaceId_fkey" FOREIGN KEY ("parentCategoryId", "parentCategoryWorkspaceId") REFERENCES "Category"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
