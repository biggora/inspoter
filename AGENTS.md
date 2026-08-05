# Repository Guidelines

## Project Structure & Module Organization

Inspoter is a Next.js 16, React 19, TypeScript app for self-hosted infrastructure management. Main code lives in `src/`: routes in `src/app`, feature UI in `src/components`, shared logic in `src/lib`, hooks in `src/hooks`, i18n helpers in `src/i18n`, and messages in `src/messages/en` and `src/messages/ru`. Prisma schema, migrations, and seeds live in `prisma/`; generated Prisma client code under `src/generated` is not edited manually. Unit tests live in `tests/unit` (no external dependencies), DB-backed integration tests live in `tests/integration` (require the test Postgres on port 3833), Playwright tests in `e2e`, and static assets in `public`.

## Build, Test, and Development Commands

Use pnpm 11.12.0 via Corepack.

- `pnpm dev`: start the Turbopack dev server on `http://localhost:3800`.
- `pnpm build`: create a production Next.js build.
- `pnpm start`: run the built production app.
- `pnpm lint`: run ESLint plus the native-control and base-language checkers.
- `pnpm check:base-language`: fail on non-base-language strings in `src/`.
- `pnpm typecheck`: run TypeScript with `--noEmit`.
- `pnpm test`: run the full Vitest suite (both projects below).
- `pnpm test:unit`: run pure unit tests in `tests/unit/` — no database, no Docker.
- `pnpm test:integration`: run DB-backed integration tests in `tests/integration/`. Requires the test Postgres; run `pnpm test:db:up && pnpm test:db:prepare` first (with `ALLOW_TEST_DB_RESET=1` and `TEST_DATABASE_MARKER=inspoter-e2e`). Fails fast with a clear message if the database is unreachable.
- `pnpm test:e2e`: run Playwright through the CI profile wrapper.
- `pnpm test:db:prepare`: prepare the test PostgreSQL database.
- `pnpm db:migrate` and `pnpm db:seed`: apply production migrations and seed baseline data.

## Coding Style & Naming Conventions

Prettier is authoritative: 2 spaces, semicolons, double quotes, trailing commas, LF endings, and 80-column print width. Use the `@/` alias for imports from `src`. Prefer typed, narrow modules in `src/lib` and feature components under `src/components/<feature>`. React components use PascalCase, hooks use `useX`, tests use `*.test.ts` or `*.test.tsx`, and route folders follow App Router conventions.

English is the base language. Author every operator-visible string in `src/messages/en` and translate it in every other locale — `pnpm lint` rejects non-base-language text in `src/` (see `scripts/check-base-language.mjs` for the two exempt files), and `tests/unit/i18n/message-parity.test.ts` rejects a key that exists in one locale but not another. Text Inspoter writes into the database (system alert categories and messages) is stored in English and carries a translation key alongside, so it can still be rendered in the active locale; see `src/lib/services/alert-catalog.ts` and `src/components/alerts/localize.ts`.

## Testing Guidelines

Vitest is configured as two projects. The `unit` project (files under `tests/unit/**`, setup `tests/setup.unit.ts`) runs in parallel with no external dependencies. The `integration` project (files under `tests/integration/**`, setup `tests/setup.integration.ts`, global setup `tests/integration/db-global-setup.ts`) runs serialized against the test Postgres and fails fast if the database is unreachable. Keep pure tests (validation, mappers, mocked UI, mocked services) under `tests/unit/`, and DB-backed tests (real Prisma queries, workspace-isolation, auth session flows) under `tests/integration/`. Use Playwright specs in `e2e/*.spec.ts` for UI flows, accessibility, and responsive behavior.

## Commit & Pull Request Guidelines

Recent history uses Conventional Commit style, for example `feat(i18n): add English as default locale` and `docs: update project metadata and README`; merge commits are present. Keep subjects imperative and scoped when useful. Pull requests should include a clear summary, linked issue or rationale, commands run, migration or env changes, and screenshots for visible UI changes.

## Security & Configuration Tips

Copy `.env.example` to `.env` and keep secrets out of git. Required production values include `DATABASE_URL` and operator credentials; provider tokens and mail credentials are stored encrypted, so configure `CREDENTIAL_ENCRYPTION_KEY` before using those features.
