import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mail transport libs use Node APIs/dynamic requires that must not be
  // bundled by Turbopack (plan §2) — keep them external at runtime.
  serverExternalPackages: ["imapflow", "mailparser", "nodemailer"],
};

export default nextConfig;
