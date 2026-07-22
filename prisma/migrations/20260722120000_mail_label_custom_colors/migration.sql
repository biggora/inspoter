-- Preserve existing preset values while allowing validated custom hex colors.
ALTER TABLE "MailLabel"
  ALTER COLUMN "color" TYPE TEXT USING "color"::text;

DROP TYPE "MailLabelColor";

ALTER TABLE "MailLabel"
  ADD CONSTRAINT "MailLabel_color_check"
  CHECK (
    "color" IN ('SLATE', 'RED', 'AMBER', 'GREEN', 'BLUE', 'VIOLET')
    OR "color" ~ '^#[0-9A-F]{6}$'
  );
