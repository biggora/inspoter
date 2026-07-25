import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

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
  let nextNavigation: Record<string, unknown> | null;
  try {
    nextNavigation =
      await vi.importMock<Record<string, unknown>>("next/navigation");
  } catch {
    // Fallback if next/navigation mock is not yet loaded
    nextNavigation = null;
  }

  return {
    createNavigation: () => {
      // Try to get useRouter from next/navigation mock
      const useRouterImpl =
        nextNavigation?.useRouter ||
        (() => ({
          push: vi.fn(),
          replace: vi.fn(),
          refresh: vi.fn(),
          forward: vi.fn(),
          back: vi.fn(),
        }));

      return {
        Link: ({ children }: { children: unknown }) => children,
        redirect: ({ href, locale }: { href: string; locale: string }) => {
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
