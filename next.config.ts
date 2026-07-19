import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const nextConfig: NextConfig = {
  // Mail transport libs use Node APIs/dynamic requires that must not be
  // bundled by Turbopack (plan §2) — keep them external at runtime.
  // nodemailer is excluded: imap-smtp.ts imports the internal
  // `nodemailer/lib/mail-composer` subpath (to build the raw RFC822
  // buffer independent of a send()), which Next.js's externalization
  // resolver refuses to treat as external ("can't be external" warning),
  // so it must stay bundled instead.
  serverExternalPackages: ["imapflow", "mailparser"],
};

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

export default withNextIntl(nextConfig);
