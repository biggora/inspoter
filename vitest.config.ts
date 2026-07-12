import "dotenv/config";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Vitest (unlike Next.js) does not auto-load .env — load it here so
// src/lib/config/env.ts and src/lib/db.ts see DATABASE_URL etc. `dotenv` is
// already a devDependency (package.json, implementor-owned).

// Vitest config (plan.md §4.2 item 13 / T-1). Unit/integration tests live
// under tests/**. Default environment is "node" — Slice 1 has no
// component-level (Testing Library render) tests yet, only service/
// validation/config/auth suites against the real Prisma/pg driver, which
// jsdom would only get in the way of. The `react()` plugin is kept wired for
// when component tests are added.
// NOTE: `jsdom` is now a devDependency (package.json, implementor-owned) but
// unused here for the reason above — when the first component test is
// added, wire `environmentMatchGlobs: [["tests/components/**", "jsdom"]]`.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
