import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Prisma client singleton (architecture.md §6, ADR-012). This is the only
// module that constructs a PrismaClient — the service layer and the auth DAL
// (src/lib/auth/dal.ts) are the sole sanctioned callers of this export.
//
// Cached on `globalThis` in development so Next.js's hot-reload doesn't spawn
// a new connection pool on every module reload.

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  return new PrismaClient({ adapter });
}

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
