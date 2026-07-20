-- Hosting section providers: Hostinger and cPanel (WHM + UAPI).
-- New ProviderType enum values are read from external hosting APIs; no new
-- table is introduced (accounts are not persisted).
ALTER TYPE "ProviderType" ADD VALUE 'HOSTINGER';
ALTER TYPE "ProviderType" ADD VALUE 'CPANEL_WHM';
ALTER TYPE "ProviderType" ADD VALUE 'CPANEL_UAPI';
