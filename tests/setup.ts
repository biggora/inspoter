import "@testing-library/jest-dom/vitest";
import { afterAll, vi } from "vitest";

// Mock next/navigation before any module can import it (next-intl dependency)
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  notFound: () => {
    throw new Error("notFound");
  },
  redirect: (url: string) => {
    throw new Error(`redirect to ${url}`);
  },
}));

// Mock next-intl/navigation (client-side routing helper)
// This needs to use the mocked next/navigation if available
vi.mock("next-intl/navigation", async () => {
  let nextNavigation: any;
  try {
    nextNavigation = await vi.importMock("next/navigation");
  } catch {
    // Fallback if next/navigation mock is not yet loaded
    nextNavigation = null;
  }

  return {
    createNavigation: (routing: unknown) => {
      // Try to get useRouter from next/navigation mock
      const useRouterImpl =
        nextNavigation?.useRouter || (() => ({
          push: vi.fn(),
          replace: vi.fn(),
          refresh: vi.fn(),
          forward: vi.fn(),
          back: vi.fn(),
        }));

      return {
        Link: ({ href, children }: any) => children,
        redirect: ({ href, locale }: any) => {
          throw new Error(`redirect to ${href} with locale ${locale}`);
        },
        usePathname: () => "/",
        useRouter: useRouterImpl,
        getPathname: () => "/",
      };
    },
  };
});

// Mock next-intl/server (server-side i18n helper)
vi.mock("next-intl/server", () => ({
  getLocale: async () => "ru",
  getTranslations: async () => (key: string) => key,
}));

// The forks pool runs each test file in its own worker process, so the Prisma
// client (src/lib/db.ts) — cached on globalThis — is constructed once per
// DB-touching file and its pg pool is otherwise only released when the worker
// is killed. Close it gracefully after each file so sockets are torn down
// cleanly instead of being severed by the process kill. Guarded on the cache
// so non-DB files (which never construct the client) create no pool here.
afterAll(async () => {
  const cached = (
    globalThis as { prisma?: { $disconnect: () => Promise<void> } }
  ).prisma;
  if (cached) await cached.$disconnect();
});
