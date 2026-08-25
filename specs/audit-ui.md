# UI audit report

Date: 2026-08-25  
Target: `http://localhost:3800`  
Application: Inspot / Inspoter Infrastructure Management Dashboard  
Method: live browser audit with Playwright, DOM assertions, screenshots, console/network collection, and source corroboration.

## Executive summary

The authenticated application is broadly usable across the tested surface:

- 246 desktop authenticated route checks completed with HTTP 200 across `en`, `ru`, and `lv`, in light and dark themes.
- 12 public route checks completed with HTTP 200 across the same locale/theme matrix.
- 12 mobile checks at `375 × 800` completed without horizontal overflow.
- The Help index and all 14 Help articles rendered in every locale and theme: 84 article renders.
- Login validation, password reveal, theme switching, locale switching, Help article back navigation, and stable dashboard loading passed.
- No broken images or missing-translation markers were found on the tested dashboard/help routes.

Three actionable findings were substantiated, plus one accessibility/landmark consistency finding:

1. `ru` and `lv` marketing landing pages are entirely English.
2. English and Latvian Settings → Webhooks show the raw key `settings.mcpAuthHint` and emit a runtime `IntlError`.
3. Messages renders a nested `<main>` landmark inside the dashboard layout `<main>`.
4. Swagger UI similarly injects a nested `<main>` on Settings → API Documentation.

No data was created, edited, deleted, revoked, or rotated during this audit. The only stateful interactions were login, theme/locale switching, opening menus, and navigation.

## Coverage

### Locales and themes

| Surface               | `en` light | `en` dark | `ru` light | `ru` dark | `lv` light | `lv` dark |
| --------------------- | ---------- | --------- | ---------- | --------- | ---------- | --------- |
| Public home and login | PASS       | PASS      | PASS*      | PASS*     | PASS*      | PASS*     |
| Authenticated routes  | PASS       | PASS      | PASS       | PASS      | PASS       | PASS      |
| Help index/articles   | PASS       | PASS      | PASS       | PASS      | PASS       | PASS      |

`*` HTTP/render checks pass; the landing-page content defect is described below because the non-English pages remain English.

### Routes and flows

Authenticated route coverage included:

`/dashboards`, `/bookmarks`, `/kanban`, `/notes`, `/agents`, `/agents/skills`, `/agents/runs`, `/domains`, `/servers`, `/hosting`, `/services`, `/mail`, `/contacts`, `/contacts/duplicates`, `/messages`, `/activity`, `/logs`, `/alerts`, `/settings`, `/settings/providers`, `/settings/workspace`, `/settings/webhooks`, `/settings/outgoing-webhooks`, `/settings/backup`, `/settings/mail`, `/settings/api-docs`, `/help`, and all 14 Help articles.

Interactive checks:

- Empty login form keeps Submit disabled.
- Password reveal changes the password input from `password` to `text` and back.
- Theme button changes both the document theme class and persisted `localStorage.theme`.
- Language menu exposes `English`, `Русский`, and `Latviešu`; selecting Russian navigates to `/ru/dashboards/...` and sets `<html lang="ru">`.
- Help article has a working `Back to Help` control. The default English locale correctly normalizes the return URL to `/help`.
- Stable dashboard data loads after the initial shell/skeleton phase; `/api/workspaces` and `/api/notifications/counts` returned 200 in the stable check.

Responsive checks used a `375 × 800` viewport in dark mode for `/dashboards`, `/help`, `/mail`, and `/settings` in all three locales. All 12 checks had `scrollWidth === innerWidth`; no horizontal overflow was observed.

## Findings

### UI-001 — Non-English marketing pages are not translated

Severity: P1 / high localization impact  
Status: FAIL  
Affected routes: `/ru/`, `/lv/` in both light and dark theme settings.

Steps:

1. Open `http://localhost:3800/ru/` or `http://localhost:3800/lv/`.
2. Inspect the landing page from hero through footer.

Actual:

- The page returns 200 and has the correct `<html lang>` (`ru` or `lv`), but the visible marketing copy remains English: `Your Infrastructure. One Dashboard.`, `Everything You Need`, `Get Started`, `View on GitHub`, feature descriptions, deployment instructions, and footer copy.
- The localized login and authenticated dashboard/help pages demonstrate that locale routing works; only the marketing surface is left in English.

Expected:

- Every operator-visible string on the `ru` and `lv` landing pages should be localized, or the page should deliberately redirect to a supported fallback locale instead of advertising a localized route.

Evidence:

- Live render: `/ru/` and `/lv/`, light/dark, heading remains `Your Infrastructure. One Dashboard.`.
- Source uses hard-coded English strings without a translation namespace in [hero-section.tsx](../src/components/marketing/hero-section.tsx#L21), [features-grid.tsx](../src/components/marketing/features-grid.tsx#L75), and [marketing-home-page.tsx](../src/components/marketing/marketing-home-page.tsx#L17).

### UI-002 — Raw `settings.mcpAuthHint` and `IntlError` in Webhooks settings

Severity: P1 / visible broken copy  
Status: FAIL  
Affected routes: `/en/settings/webhooks` and `/lv/settings/webhooks`, light and dark themes.

Steps:

1. Sign in.
2. Open Settings → Webhooks.
3. Inspect the MCP endpoint card and browser console.

Actual:

- The card displays the literal key `settings.mcpAuthHint` instead of the authentication hint.
- The browser emits `IntlError: INVALID_MESSAGE: UNCLOSED_TAG` for the same message.
- The rest of the page remains usable, but the operator loses an important explanation of how MCP authentication works.

Expected:

- Render the translated authentication hint as normal text, with the token placeholder escaped or rendered through the appropriate rich-text API.

Evidence:

- Live visible text on English: `settings.mcpAuthHint`.
- Console error: `IntlError: INVALID_MESSAGE: UNCLOSED_TAG (Authenticate with "Authorization: Bearer <token>"...)`.
- The component calls plain `t("mcpAuthHint")` at [webhook-tokens-view.tsx](../src/components/settings/webhook-tokens-view.tsx#L312).
- English and Latvian translation values contain the angle-bracket token placeholder at [en/settings.json](../src/messages/en/settings.json#L133) and [lv/settings.json](../src/messages/lv/settings.json#L133).
- Screenshot: [webhooks-light.png](../.playwright-mcp/ui-audit-stable/webhooks-light.png).

The Russian value rendered correctly in the live run because its placeholder uses Cyrillic text inside the angle brackets; the shared implementation remains fragile and should be corrected for all locales.

### UI-003 — Messages contains a nested `<main>` landmark

Severity: P2 / accessibility and semantic structure  
Status: FAIL  
Affected route: `/en/messages`, reproduced in the locale/theme matrix.

Actual:

- The DOM contains two `<main>` elements: the dashboard layout main and a second main for the message timeline.
- The inner message main starts at viewport coordinates `x=512, y=135` and is nested inside the outer dashboard main.
- This can confuse screen-reader landmark navigation and automated accessibility tooling.

Expected:

- Keep the dashboard layout `<main>` as the single page landmark and use a `div`, `section`, or appropriately labelled region for the message pane.

Evidence:

- Outer landmark: [dashboard layout](<../src/app/[locale]/(dashboard)/layout.tsx#L47>).
- Inner landmark: [messages-view.tsx](../src/components/messages/messages-view.tsx#L367).
- Live DOM check: `document.querySelectorAll('main').length === 2` on `/en/messages`.

### UI-004 — Swagger UI injects a nested `<main>` landmark

Severity: P2 / accessibility and semantic structure  
Status: OBSERVED DEFECT  
Affected route: `/en/settings/api-docs`, reproduced in the locale/theme matrix.

Actual:

- The page renders correctly and the OpenAPI documentation is usable, but the live DOM contains the dashboard layout `<main>` plus Swagger UI's generated `<main id="operations">`.
- The outer main was approximately 15,389 CSS pixels tall in the captured desktop render; the Swagger operations main was nested inside it.

Expected:

- The page should expose one page-level main landmark. If the third-party Swagger markup cannot be configured not to emit `main`, isolate it behind a non-main application landmark or apply a supported wrapper strategy.

Evidence:

- Live DOM check: `document.querySelectorAll('main').length === 2` on `/en/settings/api-docs`.
- Swagger is mounted into the application container at [swagger-documentation.tsx](../src/components/api-docs/swagger-documentation.tsx#L58).
- The route itself returned 200, rendered the OpenAPI document, and emitted no console error.

## Passed checks and observations

- All tested document navigations returned HTTP 200.
- All tested pages had a non-empty title, a single page body render, and loaded images; no broken image URL was found.
- No horizontal overflow appeared at desktop `1440 × 900` or mobile `375 × 800` on the tested routes.
- Help index exposed 14 unique article links, and every article rendered with a heading and body content in all locales and both themes.
- The Help webhook/API examples rendered without leaking a real token.
- Theme switching changes light/dark state correctly and persists the selection.
- Locale switching exposes all three supported choices and navigates correctly.
- The desktop dark theme and light theme are visually coherent in the stable dashboard/help captures. Stable screenshots: [dashboard-light.png](../.playwright-mcp/ui-audit-stable/dashboard-light.png), [dashboard-dark.png](../.playwright-mcp/ui-audit-stable/dashboard-dark.png), [help-light.png](../.playwright-mcp/ui-audit-stable/help-light.png), [help-dark.png](../.playwright-mcp/ui-audit-stable/help-dark.png).
- The first short wait after navigating to `/dashboards` can show the loading skeleton and aborted RSC/API requests if the next route is opened immediately. A 3.5-second stable check loaded the dashboard data and returned 200 for the workspace/notification APIs; this was treated as timing noise, not a product defect.
- Dashboard widget titles such as `Main` and `Local Time` remain English in Russian/Latvian because the active workspace stores custom widget titles. This is data/configuration content, not counted as an i18n defect; system labels and Help copy were localized.

## Static corroboration

`pnpm exec vitest run tests/unit/i18n/message-parity.test.ts`  
Result: PASS — 1 test file, 53 tests.

This verifies locale key parity but does not cover hard-coded marketing strings, which is why UI execution was required to find UI-001.

## Recommended remediation order

1. Move all marketing-page operator-visible strings into the locale message bundles and render them through `next-intl`; add a route-level test that rejects English marketing copy for `ru` and `lv`.
2. Fix `mcpAuthHint` using escaped placeholder text or a rich translation renderer, then assert that `/en/settings/webhooks` and `/lv/settings/webhooks` contain neither `settings.mcpAuthHint` nor `IntlError`.
3. Replace the inner Messages `<main>` with a labelled non-main region.
4. Decide on a supported Swagger landmark strategy and add an accessibility assertion for one page-level `<main>`.
