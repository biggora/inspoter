import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const NEXT_LINK_RESTRICTION = {
  name: "next/link",
  importNames: ["default"],
  message:
    "Import Link from '@/i18n/navigation' so locale and workspace prefixes are kept. Only external URLs or targets that must not be localized (API routes, the global 404 outside the intl provider) are exempt: add the file to the exemption list in eslint.config.mjs.",
};

const NAVIGATION_BASE_RESTRICTION = {
  group: ["@/i18n/navigation-base", "**/navigation-base"],
  message:
    "Import from '@/i18n/navigation'. navigation-base is the raw next-intl navigation without the workspace prefix.",
};

// `next/navigation`'s router, pathname and redirects know neither the locale
// prefix nor `/w/<slug>`. `notFound`, `useSearchParams` and `useParams` are
// not path-aware and stay allowed. Only `src/i18n/**` (outside this rule's
// scope) may touch the raw navigation.
const NEXT_NAVIGATION_RESTRICTION = {
  name: "next/navigation",
  importNames: ["useRouter", "usePathname", "redirect", "permanentRedirect"],
  message:
    "Import useRouter, usePathname and redirect from '@/i18n/navigation' so locale and workspace prefixes are kept.",
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    "node_modules/**",
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".claude/**",
    "src/generated/**",
    "public/vendor/swagger-ui/**",
    // Pre-existing reference material outside this app's scope (not touched by scaffolding).
    "specs/**",
    "docs/**",
    "playwright-report/**",
    "test-results/**",
  ]),
  // One navigation entry point: `@/i18n/navigation` adds the `/w/<slug>` prefix
  // that the raw next-intl navigation and `next/link` do not.
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_LINK_RESTRICTION],
          patterns: [NAVIGATION_BASE_RESTRICTION],
        },
      ],
    },
  },
  {
    // `next/navigation`'s router and redirects are banned everywhere in `src`
    // except `src/i18n/**`, which wraps them.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/i18n/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_LINK_RESTRICTION, NEXT_NAVIGATION_RESTRICTION],
          patterns: [NAVIGATION_BASE_RESTRICTION],
        },
      ],
    },
  },
  {
    // These files link to external URLs or targets that must not be localized
    // (API routes, the global 404 outside the intl provider), so they may use
    // `next/link` directly. Everything else stays restricted.
    files: [
      "src/app/global-not-found.tsx",
      "src/app/[[]locale]/login/login-form.tsx",
      "src/components/bookmarks/bookmark-card.tsx",
      "src/components/mail/mail-body.tsx",
      "src/components/messages/linkified-text.tsx",
      "src/components/messages/message-embed.tsx",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [NEXT_NAVIGATION_RESTRICTION],
          patterns: [NAVIGATION_BASE_RESTRICTION],
        },
      ],
    },
  },
  {
    // The wrapper modules build on navigation-base and the raw next/navigation.
    files: ["src/i18n/navigation*.{ts,tsx}"],
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;
