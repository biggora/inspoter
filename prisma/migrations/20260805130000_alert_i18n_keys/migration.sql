-- Base language = English for Inspoter's own alerts.
--
-- Until now the internal alert producers wrote Russian literals straight into
-- Alert.message and AlertCategory.name, so an operator on the English locale
-- saw an English page framing Russian rows. Those producers now write the
-- English base text plus a translation key, and the UI renders the key in the
-- active locale.
--
-- Scope of the data migration is deliberately narrow: the long-lived rows an
-- operator keeps seeing (the five system categories and the local mailbox's
-- INBOX folder) are renamed; historical Alert.message rows are left untouched,
-- because rewriting free text by pattern is a guess and those rows age out of
-- the list on their own.

-- 1. New columns.
ALTER TABLE "AlertCategory" ADD COLUMN "systemKey" TEXT;
ALTER TABLE "Alert" ADD COLUMN "messageKey" TEXT;
ALTER TABLE "Alert" ADD COLUMN "messageParams" JSONB;

-- 2. Rename the categories the internal producers created, and mark them.
--
-- Renaming can collide: AlertCategory has a UNIQUE (workspaceId,
-- normalizedName), so a workspace that already has an English "Services"
-- alongside the Russian "Сервисы" cannot take both. The NOT EXISTS guard skips
-- the rename in that case and step 3 marks the English row instead, leaving
-- the Russian one as an ordinary operator-owned category.
--
-- normalizedName follows the same trim + whitespace-collapse + lowercase
-- encoding the app applies (see 20260804120000_alert_category_source).
UPDATE "AlertCategory" c
SET "name" = v.en_name,
    "normalizedName" = v.en_normalized,
    "systemKey" = v.system_key,
    "updatedAt" = now()
FROM (
    VALUES
        ('почта',   'Mail',     'mail',     'mail'),
        ('серверы', 'Servers',  'servers',  'servers'),
        ('сервисы', 'Services', 'services', 'services'),
        ('хостинг', 'Hosting',  'hosting',  'hosting'),
        ('dns',     'DNS',      'dns',      'dns')
) AS v(ru_normalized, en_name, en_normalized, system_key)
WHERE c."normalizedName" = v.ru_normalized
  AND NOT EXISTS (
      SELECT 1
      FROM "AlertCategory" other
      WHERE other."workspaceId" = c."workspaceId"
        AND other."normalizedName" = v.en_normalized
        AND other."id" <> c."id"
  );

-- 3. Mark categories that already carried the English name (fresh installs,
-- and the workspaces skipped by the guard above).
UPDATE "AlertCategory" c
SET "systemKey" = v.system_key
FROM (
    VALUES
        ('mail',     'mail'),
        ('servers',  'servers'),
        ('services', 'services'),
        ('hosting',  'hosting'),
        ('dns',      'dns')
) AS v(en_normalized, system_key)
WHERE c."normalizedName" = v.en_normalized
  AND c."systemKey" IS NULL;

-- 4. The local (webhook) mailbox's default folder. Every other MailFolder name
-- mirrors a folder on a remote IMAP server and is not ours to rename; the mail
-- sidebar already renders special-use folders through the message catalog, so
-- this only fixes what is stored.
UPDATE "MailFolder"
SET "name" = 'Inbox'
WHERE "specialUse" = 'INBOX'
  AND "name" = 'Входящие';
