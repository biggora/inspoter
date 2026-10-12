import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

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
          paths: [
            {
              name: "next/link",
              importNames: ["default"],
              message:
                "Import Link from '@/i18n/navigation' so locale and workspace prefixes are kept. Only external URLs or targets that must not be localized (API routes, the global 404 outside the intl provider) are exempt: add the file to the exemption list in eslint.config.mjs.",
            },
          ],
          patterns: [
            {
              group: ["@/i18n/navigation-base", "**/navigation-base"],
              message:
                "Import from '@/i18n/navigation'. navigation-base is the raw next-intl navigation without the workspace prefix.",
            },
          ],
        },
      ],
    },
  },
  {
    // The wrapper modules build on navigation-base. The remaining files link to
    // external URLs or targets that must not be localized (API routes, the
    // global 404 outside the intl provider), so they get no locale or workspace
    // prefix.
    files: [
      "src/i18n/navigation.ts",
      "src/i18n/navigation-client.tsx",
      "src/app/global-not-found.tsx",
      "src/app/[[]locale]/login/login-form.tsx",
      "src/components/bookmarks/bookmark-card.tsx",
      "src/components/mail/mail-body.tsx",
      "src/components/messages/linkified-text.tsx",
      "src/components/messages/message-embed.tsx",
    ],
    rules: { "no-restricted-imports": "off" },
  },
]);

export default eslintConfig;
