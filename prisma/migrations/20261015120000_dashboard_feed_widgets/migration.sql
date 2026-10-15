-- Dashboard widgets for external feeds: an RSS/Atom feed tile and a YouTube
-- channel tile. The new enum values are not used in this migration, so the
-- PostgreSQL restriction on using a freshly added enum value inside the same
-- transaction does not apply.
ALTER TYPE "DashboardWidgetKind" ADD VALUE 'RSS';
ALTER TYPE "DashboardWidgetKind" ADD VALUE 'YOUTUBE';
