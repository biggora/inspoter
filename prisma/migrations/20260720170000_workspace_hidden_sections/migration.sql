-- Per-workspace section visibility (workspace-section-visibility): keys of
-- sidebar sections the workspace owner has hidden from navigation. Empty array
-- means every section is visible. Keys match SECTION_NAV_ITEMS[].key in
-- src/components/shell/nav-items.ts.
ALTER TABLE "Workspace" ADD COLUMN "hiddenSections" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
