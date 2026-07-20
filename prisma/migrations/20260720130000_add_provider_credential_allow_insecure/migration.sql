-- Opt-in per-credential flag (CPANEL_WHM/CPANEL_UAPI only) to disable TLS
-- certificate verification for self-signed cPanel servers. Not a secret —
-- stored in plaintext so the settings UI can prefill it on edit.
ALTER TABLE "ProviderCredential" ADD COLUMN "allowInsecure" BOOLEAN NOT NULL DEFAULT false;
