# Repository Guidelines

## Project Structure & Module Organization

Inspoter is a Next.js 16, React 19, TypeScript app for self-hosted infrastructure management. Main code lives in `src/`: routes in `src/app`, feature UI in `src/components`, shared logic in `src/lib`, hooks in `src/hooks`, i18n helpers in `src/i18n`, and messages in `src/messages/en` and `src/messages/ru`. Prisma schema, migrations, and seeds live in `prisma/`; generated Prisma client code under `src/generated` is not edited manually. Unit tests live in `tests/unit`, Playwright tests in `e2e`, and static assets in `public`.

## Build, Test, and Development Commands

Use pnpm 11.12.0 via Corepack.

- `pnpm dev`: start the Turbopack dev server on `http://localhost:3800`.
- `pnpm build`: create a production Next.js build.
- `pnpm start`: run the built production app.
- `pnpm lint`: run ESLint plus the native-control checker.
- `pnpm typecheck`: run TypeScript with `--noEmit`.
- `pnpm test` or `pnpm test:unit`: run Vitest unit tests.
- `pnpm test:e2e`: run Playwright through the CI profile wrapper.
- `pnpm test:db:prepare`: prepare the test PostgreSQL database.
- `pnpm db:migrate` and `pnpm db:seed`: apply production migrations and seed baseline data.

## Coding Style & Naming Conventions

Prettier is authoritative: 2 spaces, semicolons, double quotes, trailing commas, LF endings, and 80-column print width. Use the `@/` alias for imports from `src`. Prefer typed, narrow modules in `src/lib` and feature components under `src/components/<feature>`. React components use PascalCase, hooks use `useX`, tests use `*.test.ts` or `*.test.tsx`, and route folders follow App Router conventions.

## Testing Guidelines

Vitest uses globals, `tests/setup.ts`, single-worker execution, and files matching `tests/**/*.test.ts(x)`. Keep unit tests close to changed behavior and cover workspace isolation, validation, auth, providers, and service logic when touched. Use Playwright specs in `e2e/*.spec.ts` for UI flows, accessibility, and responsive behavior. Database-backed tests must target the test DB helpers.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style, for example `feat(i18n): add English as default locale` and `docs: update project metadata and README`; merge commits are present. Keep subjects imperative and scoped when useful. Pull requests should include a clear summary, linked issue or rationale, commands run, migration or env changes, and screenshots for visible UI changes.

## Security & Configuration Tips

Copy `.env.example` to `.env` and keep secrets out of git. Required production values include `DATABASE_URL` and operator credentials; provider tokens and mail credentials are stored encrypted, so configure `CREDENTIAL_ENCRYPTION_KEY` before using those features.
