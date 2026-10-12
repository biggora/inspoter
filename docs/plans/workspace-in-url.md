# Workspace в URL: независимые вкладки

Статус: ПЛАН v3 (не реализован). Дата: 2026-10-12. Решение оператора: вариант 1
(workspace в пути URL). v2 отвечает на 12 замечаний adversarial-ревью, v3 — на
2 замечания перепроверки (§12).

## 1. Цель и корневая причина

**Проблема.** Две вкладки браузера не могут показывать два разных workspace.

**Корневая причина (проверено по коду):**

- Активный workspace хранится на сервере в `Session.activeWorkspaceId`
  (`prisma/schema.prisma:61-72`). Его разрешает `requireAuth()`
  (`src/lib/auth/dal.ts:54-137`): сначала session, потом
  `operator.defaultWorkspaceId`, потом первое membership (L75-123). Результат
  записывается обратно в session (L125-134).
- Переключение: `POST /api/workspaces/switch` → `switchWorkspace()`
  (`src/app/api/workspaces/switch/route.ts:38`, `src/lib/auth/session.ts:91-103`)
  → `router.refresh()` (`src/components/shell/workspace-switcher.tsx:104-115`,
  `src/components/workspace/create-workspace-form.tsx:44-48`). Cookie `session`
  одна на все вкладки, поэтому и workspace у них общий.
- У каждой вкладки есть свой in-memory id (`src/lib/client/active-workspace.ts:11-22`).
  Он засевается во время render в `src/components/shell/app-sidebar.tsx:102-107`.
  Его отправляют ~25 клиентов `src/components/*/api.ts`, плюс
  `management-shared.tsx:50` и `indicator-store.ts:120`. Но
  `requireAuthWithWorkspaceHeader` (`dal.ts:174-183`) использует заголовок
  только как guard: 409 при расхождении (L162-172). Workspace по нему не
  выбирается.
- `Workspace.slug` объявлен `@unique` (`schema.prisma:87`).

**Целевое поведение.** «Активный workspace вкладки» — это workspace из URL
`/w/<slug>`. Страница берёт его из URL; API-вызовы вкладки выбирают его
заголовком (после проверки membership). `Session.activeWorkspaceId` хранит
только «последний использованный» workspace: по нему разрешаются входы без
префикса.

## 2. Конфликт с нормативными документами (блокер, решается первым)

| Документ (владелец)                | Место                                                   | Текущая норма                                                                                         |
| ---------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `docs/prd.md` (requirements)       | L71 (Q-13)                                              | всё «follows the active workspace»; «switcher … no-full-page-reload flow remain normative»            |
| `docs/prd.md`                      | L704-713 (AC-WS-008..011, FR-WS-003 L708)               | «this value never selects a workspace»; AC-WS-009: session разрешает workspace каждого запроса        |
| `docs/prd.md`                      | L834 NFR-SEC-004, L979 N-21                             | `409 WORKSPACE_CONTEXT_STALE`; «header never selects or authorizes»                                   |
| `docs/architecture.md` (architect) | §5.1 L429-439, §5.2 L443-447, L286, L411, L2006, L2023  | header — stale precondition; `WorkspaceBoundary` перемонтируется по switch/409                        |
| `docs/design.md` (designer)        | L61                                                     | корневой вход разрешается в `/management`                                                             |
| `docs/test-plan.md` (tester)       | L134-138 (гейты R2.1), L258-260 (Q13-CTX-001..003)      | mismatch → 409; «Header never selects authority»                                                      |

`specs/ui.md:15` (switcher в шапке sidebar) описывает только раскладку. План
её сохраняет, правка не нужна.

**Срез 0** вводит одно определение «активного workspace» (см. §1) и
применяет его во всех перечисленных местах. Предлагаемые критерии (номера
окончательно присваивает владелец PRD):

- **AC-WS-012 (предл.)**: Given оператор состоит в A и B, When вкладка 1 на
  `/w/a/...`, а вкладка 2 на `/w/b/...`, Then чтения и записи каждой вкладки
  затрагивают только её workspace, и навигация в одной не меняет другую.
- **AC-WS-013 (предл.)**: Given `/w/<slug>/...`, где slug неизвестен или
  оператор не член, Then одинаковый non-disclosing 404.
- **AC-WS-014 (предл.)**: Given URL без префикса `/<section>/...` или вход после
  login, Then 307 на `/w/<slug>/<section>/...` с сохранением query. Slug
  берётся из same-origin Referer `/w/<slug>` (если оператор член), иначе из
  last-used.
- **AC-WS-015 (предл.)**: Given browser API-запрос с `X-Inspoter-Workspace`, Then
  сервер проверяет membership и действует в указанном workspace. Без
  заголовка или с некорректным → `400 WORKSPACE_CONTEXT_REQUIRED`. Non-member
  или неизвестный id → одинаковый отказ (код задаёт OQ-4).

## 3. Допущения (явные)

- **A-1. Slug неизменяем.** `updateWorkspace` меняет только `name`
  (`src/lib/services/workspaces.ts:228-240`, `src/lib/validation/workspaces.ts:8-10`).
  Restore slug не трогает (`src/lib/services/backup.ts:1919-1926`). Slug
  пишется только при создании (`workspaces.ts:160-170`, `prisma/seed.ts:82-87,129-132`,
  `prisma/migrations/20260713042150_add_workspaces/migration.sql:39-43`). Все
  пути дают `[a-z0-9-]`.
- **A-2. Operator-level страниц нет.** Все 43 `page.tsx` в
  `src/app/[locale]/(dashboard)/` (свежий glob) рендерятся внутри
  workspace-shell (`(dashboard)/layout.tsx:25-54`). Operator-level только язык,
  тема, cookie `sidebar_state` (`src/components/ui/sidebar.tsx:86`) и «default
  workspace» (`/api/workspaces/default`).
- **A-3. Все browser API-клиенты уже шлют заголовок** (25 модулей по grep
  `WORKSPACE_HEADER_NAME`, `docs/remediation-plan.md:87`). Fallback на session
  без заголовка не нужен. Исключение — `<img>` фото контакта (§4.3).
- **A-4.** Смена значения `[workspace]` пересоздаёт поддерево layout (не
  проверено). План не полагается на это: в Срезе 3 добавляется явный
  `key={workspace.id}`.
- **A-5. При soft-навигации рендерится только page-сегмент**
  (`(dashboard)/layout.tsx:28-32`). Каждая страница авторизует workspace сама.
- **A-6. Playwright `page.goto` по умолчанию не шлёт Referer** (не проверено).
  От этого зависит `e2e/mail-label-filtering.spec.ts` (§6, Срез 3; §7).

## 4. Проектные решения

### 4.1 Схема URL

- **Slug, не id** (OQ-1): читаемый, неизменяемый (A-1), уникальный.
- **Префикс `/w/<slug>`** (OQ-2): нет коллизий с `login`, `no-workspace`,
  секциями и будущими корневыми маршрутами.
- **Локали.** `localePrefix: "as-needed"` (`src/i18n/routing.ts:3-7`):
  `/w/acme/notes/123` и `/ru/w/acme/notes/123`. `src/proxy.ts` не меняется:
  `/w/**` проходит обычный cookie-check (`proxy.ts:86-102`).
- **Дерево маршрутов** (перенос `git mv`, хвосты URL не меняются):

```
src/app/[locale]/
  page.tsx                       (без изменений: "/management" → legacy)
  login/**, no-workspace/**      (без изменений)
  [...legacy]/page.tsx           (НОВЫЙ: /<section>/... → /w/<slug>/<section>/...)
  (dashboard)/
    w/
      not-found.tsx              (НОВЫЙ: 404 неизвестного/чужого slug, без shell)
      [workspace]/
        page.tsx                 (НОВЫЙ: /w/<slug> → /w/<slug>/management)
        layout.tsx               (бывший (dashboard)/layout.tsx)
        not-found.tsx            (бывший (dashboard)/not-found.tsx)
        <19 секций>/**           (43 page, 32 loading, 2 layout, 1 css — переносом)
```

В `(dashboard)` всего 80 файлов:

- 43 page;
- 32 loading;
- 3 layout (`(dashboard)/layout.tsx`, `notes/layout.tsx`,
  `settings/api-docs/layout.tsx`);
- 1 not-found;
- 1 css: `settings/api-docs/swagger-overrides.css`, его импортирует
  `settings/api-docs/layout.tsx:2`.

Файлов `.ts` нет (glob по всем расширениям, 2026-10-12). Переносятся целые
каталоги секций, а не список файлов: файлы, не попавшие в инвентарь, не
теряются.

### 4.2 Серверное разрешение (`src/lib/auth/dal.ts`)

Контракт (вводится в Срезе 1, к живым путям подключается в Срезе 3):

```ts
export const requireWorkspaceBySlug: (slug: string) => Promise<AuthContext>;
// React cache(). session → operator (иначе redirect /login, как L55-73)
// → workspaceMember.findFirst({ where: { operatorId, workspace: { slug } },
//                                include: { workspace: true } })
// → нет строки: notFound()
// → ws.id !== session.activeWorkspaceId: записать last-used (как L126-134)

export async function resolveLastUsedWorkspace(
  operator: Operator, session: Session,
): Promise<Workspace | null>; // цепочка L75-123 без записи

export async function requireWorkspaceFromHeader(request: NextRequest): Promise<AuthContext>;
export async function requireWorkspaceFromParam(request: NextRequest, name?: string): Promise<AuthContext>;
// selector: operator → разбор (ASCII, 1..128 байт) → membership(workspaceId, operatorId)
// → нет: WorkspaceAccessDeniedError; запись в session — нет
```

- **Параметры (Next 16).** `params: Promise<{ locale; workspace; ... }>`.
  Layout и каждая страница (A-5) вызывают `requireWorkspaceBySlug(slug)`.
  Таких мест 43: 41 page и 2 layout, которые сейчас зовут `await requireAuth()`.
  `settings/page.tsx` и `settings/api-docs/page.tsx` данных workspace не
  читают. Вариант «layout кладёт workspace в request-scoped holder»
  отклонён: при soft-навигации layout не рендерится.
- **404 vs redirect** (OQ-3): неизвестный или чужой slug → `notFound()`
  (non-disclosing, `prd.md:713`). `notFound()` из `[workspace]/layout.tsx`
  ловит boundary родителя → `w/not-found.tsx` со ссылкой на `/`.
- **Явный remount.** В `[workspace]/layout.tsx` поддерево провайдеров
  (`IndicatorStoreProvider`, новый `WorkspaceProvider`) получает
  `key={workspace.id}`. Так реализуется keyed `WorkspaceBoundary` из
  `architecture.md:443` без опоры на A-4.
- **Кэш.** Страницы `force-dynamic` (`(dashboard)/layout.tsx:12`). Router
  Cache ключуется URL, поэтому `/w/a/notes` и `/w/b/notes` разные: устаревший
  RSC после переключения больше не показывается. `revalidatePath`,
  `unstable_cache` и `"use cache"` в `src/` не используются (grep: 0).
- **Prefetch.** Ссылки на чужой workspace (пункты switcher) имеют
  `prefetch={false}`. Иначе prefetch отрисует layout B и запишет B как
  last-used.

### 4.3 API: заголовок как selector

**Когда меняется семантика (CH-PLAN-001).** В Срезе 1 selector-функции
только создаются и тестируются. Живые `requireAuthWithWorkspaceHeader` и
`...Param` сохраняют guard-семантику 409 до Среза 3. Причина: до Среза 3
страница при soft-навигации рендерится из `Session.activeWorkspaceId`
(`requireAuth()`), а заголовок засеян sidebar при последнем полном рендере
layout (`(dashboard)/layout.tsx:28-32`, `app-sidebar.tsx:107`).

Пример: вкладка 1 переключила session на A. Вкладка 2 (заголовок B) делает
soft-навигацию и получает страницу с данными A, а её мутации с selector
ушли бы в B. Например, создание заметки, которой пользователь не увидит.
Guard 409 ловит именно это расхождение.

В Срезе 3 страница и заголовок оба берутся из URL. Только тогда
`requireAuthWithWorkspaceHeader`/`...Param` делегируют selector-функциям —
двухстрочная правка в том же PR, что и перенос страниц.

**Логика selector**: session → operator (`dal.ts:15-37`, без `requireAuth()`) →
заголовок: непустой ASCII, ≤128 байт. Сейчас проверяется только непустота
(`dal.ts:166`), а `prd.md:834` требует больше; валидация входит в живой guard
уже в Срезе 1. Missing/malformed → `400 WORKSPACE_CONTEXT_REQUIRED`
(`src/lib/api/errors.ts:125-130`) → membership по
`@@unique([workspaceId, operatorId])` (`schema.prisma:185`) → нет строки →
`WorkspaceAccessDeniedError` (код — OQ-4, рекомендация
`403 WORKSPACE_ACCESS_DENIED`, одинаковый для неизвестного и чужого id).

**Инвентарь routes:**

| Группа                                                                                                   | Сейчас                                       | Что нужно                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~171 browser routes                                                                                      | `requireAuthWithWorkspaceHeader`             | ничего: семантика меняется в dal (Срез 3)                                                                                                                                                                  |
| `src/app/api/indicators/stream/route.ts:29`                                                              | `requireAuthWithWorkspaceParam`              | ничего (Срез 3). Комментарии про 409 (`indicators/route.ts:7-10`, `indicator-store-provider.tsx:168-171`) — Срез 4                                                                                         |
| `src/app/api/contacts/[id]/photo/route.ts:21-25` (GET)                                                   | header, но вызывается из `<img>` без заголовка (`contact-avatar.tsx:42-46`) | **сейчас по исходникам всегда 400**: заголовок отсутствует → `WorkspaceContextRequiredError` → `errors.ts:125-130`. Срез 4: GET → `requireAuthWithWorkspaceParam`, `<img src=".../photo?workspace=<id>">` |
| `src/app/api/workspaces/default/route.ts:9,26`                                                           | plain `requireAuth()`                        | `requireOperator()` (Срез 1): route operator-level                                                                                                                                                        |
| `src/app/api/workspaces/switch/route.ts`                                                                 | header + body                                | UI перестаёт вызывать в Срезе 3. **Оставить** (OQ-7): e2e используют endpoint (§6, Срез 4)                                                                                                                |
| `src/app/api/workspaces/[id]/**`                                                                         | header + target id                           | без изменений (`[id]/route.ts:57-69`)                                                                                                                                                                     |
| Token: `api/v1/**` (~63 файла), `api/mcp`, `api/server-metrics`, `api/webhooks/**`, `api/discord/webhooks/**` | bearer, dal не импортируют                   | без изменений (NFR-SEC-001, `prd.md:828`)                                                                                                                                                                 |
| `api/auth/authentik/**`, Server Actions `login/actions.ts`                                               | до session / login-logout                    | без изменений                                                                                                                                                                                             |

**Безопасность.**

- Заголовок выбирает только среди собственных membership оператора, и
  membership проверяется на каждый запрос.
- CSRF-позиция не меняется. В `src/` нет проверок Origin/CSRF/`Sec-Fetch-*` и
  нет `Access-Control-Allow-*` (grep). Защита держится на `SameSite=lax`
  (`session.ts:44`) и на обязательном нестандартном заголовке, который
  требует preflight. Исключения без заголовка — только GET, только чтение:
  SSE и фото (`?workspace=`). Ответ cross-origin атакующему недоступен.
- **Остаточный риск SSE.** `stream/route.ts:29` проверяет membership только
  при подключении. После удаления оператора из workspace открытый поток ещё
  отдаёт счётчики индикаторов (только числа) до разрыва: idle-disconnect
  60 с в фоне (`indicator-store-provider.tsx:68`) или reconnect. Риск
  принимается (§9).
- `Vary: x-inspoter-workspace` (`src/lib/api/response.ts:3-6`) остаётся и при
  selector-семантике стал точным.

### 4.4 Клиент

- **Единая точка навигации (CH-PLAN-010).**
  - `src/i18n/navigation.ts` переименовывается в `src/i18n/navigation-base.ts`
    (raw `createNavigation(routing)`).
  - Новый `src/i18n/navigation.ts` (без директивы) реэкспортирует
    `redirect`/`getPathname` из base, а `Link`/`useRouter`/`usePathname` — из
    нового `src/i18n/navigation-client.tsx` (`"use client"`).
  - Wrapper берёт slug из `useParams().workspace` и добавляет `/w/<slug>`
    только workspace-relative путям (`src/lib/workspace-path.ts`). Он
    поддерживает объектный href (`mail-widget.tsx:34`, `messages-widget.tsx:33`)
    и сохраняет query и hash. `usePathname` снимает префикс, поэтому сравнения в
    `app-sidebar.tsx:99-100`, `dashboard-topbar.tsx:39-41`,
    `notes-workspace-view.tsx:54` и пара `usePathname` + `router.replace(..., { locale })`
    в `language-switcher.tsx:70` работают без правок.
  - **Ни один из 61 импорта `@/i18n/navigation` не меняется** (свежий grep).
    Вне `/w` (login, маркетинг, no-workspace) параметра нет → no-op.
  - Server `redirect` остаётся raw, частично отклонено. Источник slug у
    Server Components — только `params` (A-5), а `headers()` пути не содержит.
    Поэтому два серверных места (`dashboards/(index)/page.tsx:18-21` и legacy
    page) передают `toWorkspacePath(slug, ...)` явно.
  - ESLint (`eslint.config.mjs`, `no-restricted-imports`): запрет
    `@/i18n/navigation-base` везде, кроме `src/i18n/**`; запрет default-импорта
    `next/link` в `src/components/**` и `src/app/**`. Исключения — файлы с
    внешними URL: `linkified-text.tsx`, `message-embed.tsx`, `mail-body.tsx`,
    `bookmark-card.tsx`, `login-form.tsx`, `global-not-found.tsx`.
    `route-progress.tsx:14` импортирует именованный `useLinkStatus` и под
    запрет не попадает. `alerts-widget.tsx:3,36` переходит на
    `@/i18n/navigation`; попутно исправляется потеря префикса локали.
  - **Расширение запрета (CH-PLAN-014, Срез 3).**
    - Запрещены `useRouter`, `usePathname`, `redirect` и `permanentRedirect`
      из `"next/navigation"` в `src/components/**` и `src/app/**`. Router из
      `next/navigation` не добавляет ни префикс локали, ни `/w/<slug>`.
    - Разрешено только в `src/i18n/navigation-base.ts` (и в `src/i18n/**` —
      вне области запрета). Других неустранимых случаев нет.
    - Остаются разрешёнными `notFound`, `useSearchParams` и `useParams`:
      `notFound` используют `src/app/[locale]/layout.tsx:5` и 9 detail-страниц.
    - Сегодня (grep) `useRouter` из `next/navigation` импортируют 15 файлов,
      все переходят на `@/i18n/navigation`:
      - навигирующие (после Среза 3): `create-workspace-form.tsx:4`,
        `members-section.tsx:4`, `workspace-switcher.tsx:4`;
      - только `refresh()`: `time-zone-form.tsx:4`,
        `section-visibility-form.tsx:4`, `rename-workspace-form.tsx:4`,
        `auto-refresh-form.tsx:4`, `add-member-form.tsx:4`,
        `backup/import-form.tsx:4`, `bookmarks/bookmarks-board.tsx:11`,
        `notes/note-editor-panel.tsx:4`, `shell/web-mcp-global-tools.tsx:3`,
        `kanban/kanban-board-view.tsx:10`, `kanban/boards-list.tsx:4`,
        `domains/domains-view.tsx:4`.
    - `refresh()` wrapper передаёт как есть. Тесты с per-file моком
      `next/navigation` (`forms.test.tsx:30-40`, `interactions.test.tsx:32-43`,
      `note-editor-panel.test.tsx:15-17`) продолжают ловить вызовы: мок
      `createNavigation` в `tests/setup.unit.ts:25-58` берёт `useRouter` из
      мока `next/navigation`. Так уже работает `login-form.tsx:7`, который
      проверяет `forms.test.tsx:196`. `useParams` в эти моки добавляет Срез 2.
  - Filesystem-тест: `WORKSPACE_SECTIONS` (19) совпадает с верхними папками
    `src/app/[locale]/(dashboard)/` (в Срезе 3 — `.../w/[workspace]/`).
- **Хранимые href остаются workspace-relative**: `CalendarLink.targetHref`
  (`schema.prisma:2028`), `Decision.resultHref` (L2436), receipts (L2470-2472).
  Их создают `management.ts:715,769,795,813`, `calendar-link-targets.ts:355-452`,
  `kanban/link-targets.ts:23-31`, `management/snapshot.ts:345-485`,
  `backup.ts:1778-1781`. Миграции данных нет.
- **`WorkspaceProvider`** (`src/components/shell/workspace-provider.tsx`,
  Срез 3): context `{ id, slug }` из `[workspace]/layout.tsx`. Потребители —
  switcher, синхронизация singleton (Срез 4) и фото контакта (Срез 4).
  `ContactAvatar` рендерится только из client-компонентов (5 потребителей, все
  `"use client"`).
- **Per-tab id для заголовка** — по-прежнему workspace **id**. 25 api-модулей,
  `e2e/fixtures/test.ts:61-66,84,136` и integration-тесты не меняются.
- **Switcher** (`workspace-switcher.tsx`, Срез 3). Пункты — это
  `DropdownMenuItem render={<Link href=... prefetch={false} />}`: role
  `menuitem` сохраняется (на него опирается
  `e2e/messages-channel-webhooks.spec.ts:427-429`), Ctrl/middle-click
  открывает новую вкладку. Цель — `/w/<slug>/<первый сегмент текущего пути>`
  (OQ-6). `switchTo` + `router.refresh()` (L104-115) удаляются.
- **Все вызовы `switchTo` и refresh, зависящие от workspace** (re-sweep
  `src/components/workspace/*`, grep `switchTo|router.refresh`):
  - `workspace-switcher.tsx:108` (`switchTo`) → навигация (Срез 3).
  - `create-workspace-form.tsx:44-48` (`switchTo` + refresh) →
    `router.push("/w/<new slug>/settings/workspace")`, без `switchTo` (Срез 3).
    Ответ `create` уже содержит `slug` (строка `Workspace`).
  - Создание из switcher (`workspace-switcher.tsx:134-137`) → `/w/<new slug>/management`.
  - `members-section.tsx:45-48`: удаление самого себя → `router.push("/")` вместо
    refresh. Нужен prop `currentOperatorId` из `settings/workspace/page.tsx`;
    `MembersSectionProps` сейчас `{ workspaceId, members }` (L33). Удаление
    другого участника → refresh, как сейчас.
  - Во всех трёх навигирующих файлах `useRouter` сейчас импортируется из
    `"next/navigation"` (`create-workspace-form.tsx:4`, `members-section.tsx:4`,
    `workspace-switcher.tsx:4`). Новые `push` через него потеряли бы префикс
    локали (`/ru`), поэтому импорт переходит на `@/i18n/navigation`
    (CH-PLAN-014).
  - `rename-workspace-form.tsx:53`, `time-zone-form.tsx:32`,
    `section-visibility-form.tsx:68`, `auto-refresh-form.tsx:85`,
    `add-member-form.tsx:58,84` → refresh остаётся корректным (slug и URL не
    меняются).
  - UI удаления workspace нет: в `workspacesApi` нет `delete`,
    `src/components/workspace/api.ts:71-128`.
  - e2e вызов endpoint: `e2e/mail-label-filtering.spec.ts:94-114`; хелпер
    используется в L435, 489, 517, 609, 638, 760, 818, 982, 1026, 1390, после
    чего идёт `page.goto("/mail")`.
- **Индикаторы (CH-PLAN-004).** В v1 было утверждение «store отбрасывает
  payload чужого workspace (L89)». **Оно неточно.** `applyIndicators`
  отбрасывает payload по *метке* workspace, а метку ставит провайдер из
  замыкания (`indicator-store-provider.tsx:95-96`). Сам запрос
  `fetchIndicators()` берёт id из singleton (`indicator-store.ts:118-121`).
  Если singleton уже сменился, числа B применятся с меткой A. Исправление
  (Срез 4): `fetchIndicators(workspaceId)`; провайдер передаёт свой id;
  `refreshIndicators` (L132-142) передаёт id, который прочитал.
- **Singleton в api.ts после `await`.** Обработчик старого дерева, который
  возобновился после commit нового, прочтёт уже новый id. Захват id через
  context в 25 модулях — несоразмерная правка. Риск **принимается** (§9). Окно
  сужают Срез 4 (засев в `useLayoutEffect`, а не в render) и keyed remount.
  Тест фиксирует, что singleton не меняется во время render нового дерева.

### 4.5 Legacy URL

`src/app/[locale]/[...legacy]/page.tsx` (proxy остаётся без DB):

1. `legacy[0]` не в `WORKSPACE_SECTIONS` → `notFound()`.
2. `requireOperator()`.
3. **Referer (CH-PLAN-005).** Если `headers().get("referer")` same-origin
   (host равен `x-forwarded-host ?? host`, как `settings/webhooks/page.tsx:14`)
   и путь (без локали) начинается с `/w/<slug>`, а оператор — член `<slug>`,
   берётся этот slug.
4. Иначе `resolveLastUsedWorkspace()`. Если null → `redirect("/no-workspace")`.
5. `redirect({ href: toWorkspacePath(slug, "/" + segments.map(encodeURIComponent).join("/") + query), locale })`.

Referer не повышает права: slug проверяется по membership. Ссылки с
`rel="noreferrer"` (`kanban/sanitize.ts:34`, `note-markdown-editor.tsx:120,143`)
идут на last-used.

Login (`login-form.tsx:89`, `POST_LOGIN_PATH`, `src/lib/auth/redirect.ts:12`),
Authentik callback, `no-workspace/page.tsx:21` и корень `[locale]/page.tsx:9`
не меняются.

**Срез 5 (опц.)** добавляет перед шагом 3 владельца сущности для
`/{notes,kanban,contacts,services,servers,agents,agents/runs,agents/chats,dashboards}/<id>`
(`src/lib/services/legacy-link-resolver.ts`). Порядок: владелец (если член) →
Referer → last-used. Если оператор не член, существование сущности не
раскрывается.

### 4.6 Фон и realtime

- SSE и polling: `indicator-store-provider.tsx:104-126`, `indicator-store.ts:118-124`.
  Исправление `fetchIndicators` см. в §4.4. Каждая вкладка держит свой поток.
  WebSocket и BroadcastChannel отсутствуют (grep).
- `localStorage`/`sessionStorage` в `src/` не используются (grep: 0). Cookies:
  `session`, `sidebar_state`, локаль next-intl. Workspace-scoped клиентского
  хранилища нет.

## 5. Альтернативы

| #   | Вариант                                                                                    | Решение                                                                              |
| --- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| A   | `/w/<slug>` + header-selector (id) + относительные href + единая точка `@/i18n/navigation` | **Выбран**                                                                           |
| B   | Query `?ws=`                                                                               | Отклонён оператором                                                                  |
| C   | Strangler по секциям (два shell)                                                           | Отклонён: смешение session- и URL-семантики между секциями                           |
| D   | Заголовок несёт slug из `window.location`                                                  | Отклонён: правка fixtures и тестов, неоднозначность id/slug                          |
| E   | Proxy → route handler для legacy                                                           | Резерв К-1                                                                           |
| F   | Proxy инжектит заголовок в RSC-запрос                                                      | Отклонён: хрупко, подделывается                                                      |
| G   | Cookie или sessionStorage на вкладку                                                       | Невозможно                                                                           |
| H   | Замена 61 импорта на новый модуль (v1)                                                     | Отклонён в v2 в пользу единой точки (CH-PLAN-010): 0 правок импортов                 |
| I   | Selector «вживую» в Срезе 1 (v1)                                                           | Отклонён в v2 (CH-PLAN-001): stale-tab запись в чужой workspace                      |

## 6. Срезы

**Gate (DoD, `docs/plan.md:489-497`).** Срез N+1 начинается после: зелёных
acceptance-тестов; свежего вывода `pnpm lint`, `pnpm typecheck`, `pnpm test:unit`,
`pnpm test:integration`, `pnpm test:e2e`; code-review DONE; демо оператору.
Отступление от gate — решение оператора с отдельным срезом закрытия долга.
Схема БД не меняется ни в одном срезе. Откат любого среза — revert.

### Задача 0 — локальное окружение (devops-engineer; не срез, AC нет)

- Изменение: устранить `ERR_PNPM_BROKEN_PNPM_RELEASE` для `pnpm@11.12.0` (решено: 11.28.2, см. OQ-10)
  (`package.json:121`). Об ошибке сообщил оператор; я её не воспроизводил.
  Поднять тестовый Postgres (`pnpm test:db:up && pnpm test:db:prepare`, порт
  3833, `AGENTS.md`).
- Проверка: `pnpm --version` выводит выбранную версию; baseline
  lint/typecheck/unit/integration/e2e зелёный на `main`, вывод приложен.
- Гейтится: OQ-10.

### Срез 0 — ревизия нормативных документов (requirements-analyst, architect, designer, tester)

- Файлы:
  - `docs/prd.md`: L71, L704-713, L834, L979, новые AC-WS-012..015.
  - `docs/architecture.md`: §5.1 L423-439, §5.2 L441-447 (`WorkspaceBoundary`
    = keyed `[workspace]` layout), L286, L411, L2006, L2023.
  - `docs/design.md`: L61.
  - `docs/test-plan.md`: L134-138 и L258-260 (строки трассировки для
    AC-WS-012..015 и Q13-CTX).
- Изменение: одно определение «активного workspace вкладки» (§1)
  применяется во всех местах. Session = last-used. Заголовок = selector.
  Коды по OQ-3/OQ-4. Без префикса → legacy-redirect с Referer.
- AC: определяет AC-WS-012..015, переформулирует AC-WS-009/010, FR-WS-003,
  NFR-SEC-004, N-21. Сам ничего не верифицирует.
- Проверка: doc-review PASS; формулировки утверждены оператором.
- Гейтится: OQ-1, OQ-2, OQ-3, OQ-4, OQ-5, OQ-6, OQ-11.

### Срез 1 — DAL-фундамент, инертный для живых путей (backend-dev → tester → code-reviewer)

- Файлы (src): `src/lib/auth/dal.ts`, `src/lib/api/errors.ts`,
  `src/app/api/workspaces/default/route.ts`.
- Тесты:
  - `tests/unit/auth/dal-selector.test.ts` (новый);
  - `tests/integration/auth/workspace-selector.test.ts` (новый, по образцу
    `tests/integration/auth/session-contract.test.ts:13-18`);
  - `tests/integration/auth/workspace-by-slug.test.ts` (новый).
- Размер: 3 src + 3 test.
- Изменение:
  - добавить `requireWorkspaceFromHeader`/`...FromParam` (selector),
    `requireWorkspaceBySlug` (`cache()`), `resolveLastUsedWorkspace`,
    `WorkspaceAccessDeniedError`. Живыми routes и страницами они **не
    используются**;
  - живой guard получает валидацию ASCII ≤128;
  - `workspaces/default` → `requireOperator()`.
- AC: AC-WS-015 и AC-WS-013 — PARTIAL (facet: функции); NFR-SEC-004
  (malformed-header facet, живой).
- Проверка:
  - selector: одна session, заголовки A и B → контекст своего workspace;
    `Session.activeWorkspaceId` не меняется; non-member и неизвестный id →
    одинаковый отказ;
  - by-slug: member → ok + запись last-used; non-member и неизвестный slug →
    `notFound`;
  - живой guard: пустой, не-ASCII или 129-байтный заголовок → 400; matching
    → 200; mismatch → 409 (без изменений);
  - все suites зелёные.
- Гейтится: Срез 0, OQ-4, OQ-5.
- Зависит от: Задача 0, Срез 0.

### Срез 2 — единая точка навигации, no-op без параметра (frontend-dev → tester → code-reviewer)

- Файлы (src/config):
  - `src/i18n/navigation.ts` → переименовать в `src/i18n/navigation-base.ts`;
  - новый `src/i18n/navigation.ts` (реэкспорт);
  - новый `src/i18n/navigation-client.tsx`;
  - новый `src/lib/workspace-path.ts`;
  - `src/components/dashboards/widgets/alerts-widget.tsx` (import);
  - `src/app/[locale]/(dashboard)/settings/api-docs/page.tsx:2`: относительный
    `../../../../../../specs/openapi.json` сломается после переноса. Заменить
    на `@specs/openapi.json` и добавить `"@specs/*": ["./specs/*"]` в
    `tsconfig.json:21-23`. Unit-тесты эту страницу не импортируют (grep),
    поэтому алиас в `vitest.config.ts:24-26` не нужен;
  - `eslint.config.mjs`.
- Тесты (tester):
  - новые: `tests/unit/lib/workspace-path.test.ts`,
    `tests/unit/i18n/navigation-client.test.tsx`,
    `tests/unit/app/workspace-sections-fs.test.ts`;
  - **добавить `useParams: () => ({})`** в моки `next/navigation` без него:
    `tests/setup.unit.ts:5-21`, `tests/setup.integration.ts:5-…`,
    `tests/unit/ui/interactions.test.tsx:32-43`,
    `tests/unit/ui/forms.test.tsx:30-40`,
    `tests/unit/ui/note-editor-panel.test.tsx:15-17`.
    `tests/unit/ui/domains-view.test.tsx:18` его уже имеет;
  - моки `@/i18n/navigation` в `management-view.test.tsx:7`,
    `dashboard-widgets.test.tsx:22`, `notes-tree.test.tsx:17`,
    `system-health-chips.test.tsx:7` подменяют модуль целиком и остаются
    рабочими. Проверить прогоном.
- Аудит e2e (без правок): все 40 `toHaveURL`/`waitForURL` в 12 файлах (свежий
  grep) не якорятся к началу пути. Это regex-подстроки (`/\/domains$/`,
  `new RegExp(\`/contacts/[^/?]+\\?query=…\`)`, `/\/management/`) и
  `popup.url().endsWith(...)` (`bookmarks.spec.ts:486-487`), так что префикс
  `/w/<slug>` они уже принимают.
- Размер: ~8 src/config + ~8 test.
- Изменение: wrapper добавляет `/w/<slug>` только при
  `useParams().workspace`. До Среза 3 параметра нет → поведение не меняется.
- AC: нет (общая обвязка).
- Проверка:
  - unit: `toWorkspacePath("acme", "/notes/1?x=1#h")` → `"/w/acme/notes/1?x=1#h"`;
    `/login`, `/api/x`, `https://…`, `/` и уже префиксованный путь не
    меняются; объектный href; `stripWorkspacePrefix`;
  - filesystem-тест 19 = 19;
  - `pnpm lint` ловит импорт `navigation-base` и `next/link` в фикстуре;
  - полный e2e зелёный без изменений.
- Гейтится: OQ-1, OQ-2.
- Зависит от: Задача 0. Параллелен Срезу 1: области записи не пересекаются.

### Срез 3 — tracer bullet: `/w/<slug>` + flip selector + legacy + switcher

Сначала замораживаются контракты Среза 1 (уже в `main`). Роли и
непересекающиеся области записи:

- **backend-dev:** `src/lib/auth/dal.ts` — flip:
  `requireAuthWithWorkspaceHeader`/`...Param` делегируют selector, 2 строки;
  `src/app/[locale]/[...legacy]/page.tsx` (новый, Referer → last-used).
- **frontend-dev:**
  - коммит 1 — только `git mv` **целых каталогов**, без списка файлов:
    19 каталогов секций (`activity agents alerts bookmarks calendar contacts
    dashboards domains help hosting kanban logs mail management messages notes
    servers services settings`) из `src/app/[locale]/(dashboard)/<section>` в
    `src/app/[locale]/(dashboard)/w/[workspace]/<section>`, плюс
    `(dashboard)/layout.tsx` и `(dashboard)/not-found.tsx`. Проверка коммита:
    в `(dashboard)/` остался только `w/`; под `w/[workspace]/` ровно 80 файлов,
    включая `settings/api-docs/swagger-overrides.css`; `git status` показывает
    только rename;
  - коммит 2 — правки: 41 page + 2 layout → `requireWorkspaceBySlug(slug)`;
    новые `w/not-found.tsx`, `w/[workspace]/page.tsx`,
    `src/components/shell/workspace-provider.tsx`; `key={workspace.id}` в
    layout; `dashboards/(index)/page.tsx:18-21`; `workspace-switcher.tsx`;
    `create-workspace-form.tsx`; `members-section.tsx` +
    `settings/workspace/page.tsx` (prop `currentOperatorId`); импорт
    `useRouter` в 15 файлах → `@/i18n/navigation`; расширение запрета в
    `eslint.config.mjs` (§4.4, CH-PLAN-014).
- **tester:** путь в `workspace-sections-fs.test.ts`; новый
  `e2e/workspace-tabs.spec.ts`.
- Размер: 80 rename + ~67 файлов с правками (из них 43 — 1-3 строки, 12 —
  замена одного import) + 1 новый spec. Re-evaluation: перенос, flip,
  switcher и create-form неотделимы — каждый по отдельности оставляет
  приложение сломанным или небезопасным (CH-PLAN-001, CH-PLAN-002). Всё
  отделимое вынесено: DAL → Срез 1, навигация, алиас и моки → Срез 2,
  индикаторы, синхронизация и фото → Срез 4.
- AC: AC-WS-012, AC-WS-013, AC-WS-014, AC-WS-015 (живой) → PASS;
  AC-WS-009/010 (в редакции Среза 0); AC-WS-011 и AC-WS-008 — регрессия.
- Проверка (e2e `workspace-tabs.spec.ts`; два `page` в одном `context`):
  - на `/w/<A>/notes` и `/w/<B>/notes` в каждой вкладке создаётся заметка:
    взаимная невидимость, после `reload()` то же самое; имя в sidebar и
    индикаторы свои;
  - `goto("/notes")` → `/w/<last-used>/notes`; `goto("/ru/kanban?x=1")` →
    `/ru/w/<last-used>/kanban?x=1`;
  - `page.goto("/notes", { referer: "<origin>/w/<B>/management" })` при
    last-used = A → `/w/<B>/notes`; при чужом slug в Referer → last-used;
  - `/w/<чужой>/notes` и `/w/nope/notes` → одинаковая 404 без shell; `/w/<A>`
    → `/w/<A>/management`;
  - switcher (role `menuitem`) на `/w/A/notes/<id>` → `/w/B/notes`;
  - создание workspace из `/w/A/settings/workspace` → URL `/w/<new slug>/settings/workspace`,
    в switcher новое имя;
  - то же на `/ru/w/A/settings/workspace` → URL `/ru/w/<new slug>/settings/workspace`
    (префикс локали сохранён, CH-PLAN-014); переключение через switcher и
    удаление себя на `/ru/...` остаются в `/ru`;
  - `pnpm lint` ловит `import { useRouter } from "next/navigation"` в
    фикстуре внутри `src/components`;
  - удаление себя из B (есть второй owner) → уход с `/w/B`, итог — не 404;
  - смена языка на `/w/A/notes` → `/ru/w/A/notes`;
  - существующие e2e зелёные без правок, включая
    `messages-channel-webhooks.spec.ts:426-432` (switcher через `menuitem`) и
    `mail-label-filtering.spec.ts` (endpoint switch + `goto("/mail")`, A-6).
  - Демо оператору: две вкладки с разными workspace.
- Гейтится: OQ-3, OQ-6, OQ-7.
- Зависит от: Срезы 1 и 2.

### Срез 4 — hardening и очистка (frontend-dev + backend-dev → tester → code-reviewer)

- Файлы:
  - `src/components/shell/workspace-provider.tsx` (засев singleton в
    `useLayoutEffect`) и `app-sidebar.tsx:102-107` (убрать засев в render);
  - `src/components/shell/indicator-store.ts:118-142` (`fetchIndicators(workspaceId)`)
    и `indicator-store-provider.tsx:95-96,168-171`;
  - `src/app/api/contacts/[id]/photo/route.ts` (GET → `requireAuthWithWorkspaceParam`)
    и `src/components/contacts/contact-avatar.tsx` (`"use client"`,
    `?workspace=${useWorkspace().id}`);
  - `src/lib/auth/dal.ts`, `src/lib/api/errors.ts:131-136`: удалить
    `WorkspaceContextStaleError` и `requireAuth()`, если grep не найдёт
    вызовов;
  - комментарии `src/app/api/indicators/route.ts:7-10`.
- Тесты:
  - unit: singleton не меняется во время render нового дерева и меняется
    после commit;
  - unit: `fetchIndicators` шлёт переданный id;
  - integration: фото с `?workspace=` member → 200, без параметра → 400,
    non-member → отказ OQ-4;
  - правка `tests/unit/api/indicators-stream.test.ts:23,182` (409 → новый код).
- Размер: ~9 src + 4 test.
- OQ-7 (рекомендация «оставить»): `switch/route.ts` и
  `workspacesApi.switchTo` (`src/components/workspace/api.ts:101-105`)
  остаются. Если оператор выберет «удалить», в этот срез добавляется
  переписывание `e2e/mail-label-filtering.spec.ts:94-114` (10 вызовов) на
  `goto("/w/<slug>/mail")`.
- AC: AC-WS-015 (facet «переход внутри вкладки»), AC-CNT-004 («served only to
  an authenticated member», `prd.md:523`), NFR-SEC-004 (без 409).
- Проверка: тесты выше; grep `WORKSPACE_CONTEXT_STALE` по `src/` → 0; на
  `/w/A/contacts` аватар загружается (e2e-проверка `img.naturalWidth > 0`).
- Гейтится: OQ-7, OQ-9 (план ставит фото сюда; оператор подтверждает).
- Зависит от: Срез 3.

### Срез 5 (опционально) — deep-link в workspace-владелец (backend-dev → tester)

- Файлы: `src/lib/services/legacy-link-resolver.ts` (новый),
  `src/app/[locale]/[...legacy]/page.tsx`, integration-тест. Размер: 3-4 файла.
- AC: AC-WS-014 (facet deep-link).
- Проверка: last-used = A, оператор член B: `/notes/<id из B>` → `/w/B/notes/<id>`.
  Оператор не член B → ведёт себя как без id (Referer → last-used), без
  раскрытия.
- Гейтится: OQ-8.
- Зависит от: Срез 3.

### Порядок

```
Задача 0 ─┬─> Срез 0 ─> Срез 1 ─┐
          └─> Срез 2 ───────────┴─> Срез 3 ─> Срез 4
                                           └─> Срез 5 (опц.)
```

## 7. Регистр зависимостей и неопределённостей

| Зависимость/неопределённость                                                                        | Владелец                | Доказательство                                                       | Влияние | Уверенность | Триггер                                                            |
| --------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------- | ------- | ----------- | ------------------------------------------------------------------ |
| Нормативные документы разрешают selector                                                            | requirements, architect | §2                                                                   | высокое | high        | Срез 0 PASS                                                        |
| pnpm работает локально                                                                              | devops-engineer         | сообщение оператора; `package.json:121`                              | высокое | unknown     | Задача 0 / К-2                                                     |
| `notFound()` из `[workspace]/layout` ловит `w/not-found.tsx`; catch-all не меняет 404 мусорных URL (`next.config.ts:7-9`) | frontend-dev            | не проверено                                                         | среднее | medium      | e2e Среза 3 / К-1                                                  |
| A-6: `page.goto` без Referer                                                                        | tester                  | не проверено                                                         | среднее | medium      | прогон `mail-label-filtering.spec.ts` в Срезе 3; иначе `goto("/w/<slug>/mail")` |
| Рендер `CalendarLink.targetHref`                                                                    | frontend-dev            | grep нашёл только запись (`link-picker.tsx:59`)                      | низкое  | unknown     | ревью Среза 2                                                      |
| E2E-флейки: лимит логина, сироты на портах, суффикс имён                                            | tester                  | заметки оператора (memory)                                           | среднее | high        | `LOGIN_RATE_LIMIT_IP`, `TEST_APP_PORT`, teardown в fixture         |

## 8. Контингенции (только высокое влияние)

- **К-1: catch-all или `w/not-found.tsx` ведут себя не так.**
  - Триггер: e2e Среза 3 (мусорный URL не даёт прежний 404, или чужой slug
    даёт 500 или shell).
  - Fallback: 19 тонких `src/app/[locale]/(legacy)/<section>/[[...rest]]/page.tsx`
    с общим helper, плюс `src/app/[locale]/not-found.tsx`. Либо вариант E.
  - Проверка: те же e2e.
  - Возврат: до merge Среза 3.
- **К-2: Задача 0 не даёт рабочий pnpm.**
  - Триггер: команды падают через corepack.
  - Fallback: оператор решает по OQ-10 (сменить `packageManager` или
    локальный обход).
  - Проверка: `pnpm --version` равен выбранной версии; полный baseline
    (lint/typecheck/unit/integration/e2e) зелёный на `main` со свежим выводом.
  - Возврат: старт Среза 1/2.

## 9. Решения и остаточные риски

| Риск                                                                                              | Мера / статус                                                                                  |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Stale tab пишет в чужой workspace при раннем selector                                             | Устранён порядком: flip только в Срезе 3 (§4.3)                                                |
| Обработчик старого дерева после `await` читает новый id singleton                                 | **Принят**; окно сужают Срез 4 и keyed remount; тест на commit-фазу; последствие — 404 по чужому id или запись в B |
| SSE после удаления membership отдаёт счётчики до разрыва                                          | **Принят** (только числа; ≤60 с в фоне, до reconnect на активной вкладке)                       |
| Массовый rename конфликтует с параллельными ветками                                               | «Тихое» окно; rename отдельным коммитом (целые каталоги)                                       |
| Запись last-used при чередовании вкладок                                                          | Только при отличии (`dal.ts:126`); принят                                                      |
| Новый код обходит навигацию                                                                       | Единая точка + ESLint (Срез 2: base и `next/link`; Срез 3: router/redirect/pathname из `next/navigation`) |
| Чужие deep-link → last-used → 404                                                                 | Referer (Срез 3), владелец (Срез 5)                                                            |

## 10. Пред-существующие проблемы

1. Нет валидации ASCII ≤128 (`dal.ts:162-172` против `prd.md:834`) → Срез 1.
2. Фото контакта всегда 400 по исходникам (§4.3) → Срез 4 (AC-CNT-004).
3. `alerts-widget.tsx:3,36` теряет префикс локали → Срез 2.
4. Payload индикаторов может получить чужую метку (§4.4) → Срез 4.
5. `Vary` без `Cookie` (`response.ts:5` против `architecture.md:445`) — не
   трогается.

## 11. Решения оператора (2026-10-12)

Все открытые вопросы закрыты; оператор принял рекомендации, Срез 5 включён.

- **OQ-1:** slug в URL.
- **OQ-2:** `/w/<slug>`.
- **OQ-3:** неизвестный или чужой slug на странице — 404.
- **OQ-4:** отказ API для non-member или неизвестного id —
  `403 WORKSPACE_ACCESS_DENIED`.
- **OQ-5:** last-used обновляется на каждом рендере workspace-страницы.
- **OQ-6:** switcher ведёт в корень той же секции.
- **OQ-7:** `POST /api/workspaces/switch` остаётся.
- **OQ-8:** Срез 5 делаем.
- **OQ-9:** починка фото контакта (`?workspace=`) входит в Срез 4.
- **OQ-10:** pnpm чинится сменой `packageManager` (и закреплений в CI и
  Dockerfile) на `pnpm@11.28.2` (тег `latest-11`: тот же major, lockfile v9).
- **OQ-11:** Help и api-docs остаются внутри `/w`.

## 12. Изменения v2 и v3

| CH-ID       | Диспозиция                                                    | Где / доказательство                                                                                                                                                                                                                       |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CH-PLAN-001 | accepted                                                      | §4.3 «Когда меняется семантика»; Срез 1 инертен, flip в Срезе 3; §5 I; §9                                                                                                                                                                  |
| CH-PLAN-002 | accepted                                                      | §4.4 «Все вызовы switchTo и refresh» (re-sweep); Срез 3 (create-form, members-section + page, e2e создания и удаления себя)                                                                                                                 |
| CH-PLAN-003 | accepted                                                      | Срез 2: `@specs/*` в `tsconfig.json`; пересчёт по свежему grep: 43 page, 41 page + 2 layout с `requireAuth()`, 61 импорт навигации, 40 URL-ассертов в 12 e2e-файлах (число файлов к переносу уточнено до 80 в v3, CH-PLAN-013)                |
| CH-PLAN-004 | accepted                                                      | §4.4 «Индикаторы» (утверждение v1 исправлено), Срез 4 `fetchIndicators(workspaceId)`; singleton после `await` — принятый риск с тестом (§9)                                                                                                 |
| CH-PLAN-005 | accepted                                                      | §4.5 шаг 3 (same-origin Referer + membership), AC-WS-014, e2e в Срезе 3; порядок со Срезом 5                                                                                                                                                |
| CH-PLAN-006 | accepted                                                      | Каждый срез — «AC» и «Гейтится»; OQ-11 в гейте Среза 0; OQ-9 → Срез 4 (AC-CNT-004); Срез 0 расширен на `prd.md:71`, §5.2 `architecture.md:441-447` и `test-plan.md:134-138`                                                                  |
| CH-PLAN-007 | accepted                                                      | Срез 2 гейтится OQ-1/OQ-2; перечислены 5 моков `next/navigation` без `useParams` и 4 мока `@/i18n/navigation`                                                                                                                              |
| CH-PLAN-008 | accepted                                                      | §4.4 (e2e-вызовы endpoint и строки хелпера), Срез 4 и OQ-7 (рекомендация «оставить»); switcher через `DropdownMenuItem render=Link` сохраняет `menuitem` (`messages-channel-webhooks.spec.ts:427-429`)                                         |
| CH-PLAN-009 | accepted                                                      | §4.3: фото по исходникам всегда 400 (`photo/route.ts:21-25`, `errors.ts:125-130`); фикс `?workspace=` + `requireAuthWithWorkspaceParam` в Срезе 4; остаточный риск SSE в §4.3 и §9                                                           |
| CH-PLAN-010 | accepted (частично: server `redirect` остаётся raw)           | §4.4: base + реэкспорт, 0 правок импортов, ESLint на base и `next/link`, filesystem-тест; server-redirect не может знать slug без `params` (A-5) → явный `toWorkspacePath` в 2 местах                                                         |
| CH-PLAN-011 | accepted                                                      | §4.2 `key={workspace.id}`; новый `w/[workspace]/page.tsx`; К-2 получила шаг проверки                                                                                                                                                       |
| CH-PLAN-012 | accepted (DAL → Срез 1); rejected with evidence (e2e loosening) | `requireWorkspaceBySlug` перенесён в Срез 1. Ослаблять e2e нечего: все 40 ассертов — неякорные regex или `endsWith` (`shell.spec.ts:53,157`, `contacts.spec.ts:203-205`, `bookmarks.spec.ts:486-487`, `e2e/utils/auth.ts:38`). Вместо правок — аудит в Срезе 2. Размер Среза 3 пересмотрен |
| CH-PLAN-013 (v3) | accepted                                                 | §4.1: инвентарь 80 файлов (добавлен `settings/api-docs/swagger-overrides.css`, импорт `settings/api-docs/layout.tsx:2`); Срез 3, коммит 1: `git mv` 19 каталогов секций + `layout.tsx` + `not-found.tsx` с проверкой «ровно 80, только rename»                                                                     |
| CH-PLAN-014 (v3) | accepted                                                 | §4.4: 15 файлов с `useRouter` из `next/navigation` (grep), включая `create-workspace-form.tsx:4`, `members-section.tsx:4`, `workspace-switcher.tsx:4`, переходят на `@/i18n/navigation`; ESLint запрещает `useRouter`/`usePathname`/`redirect`/`permanentRedirect` из `next/navigation` в `src/components` и `src/app`, разрешено только в `src/i18n/navigation-base.ts`, других исключений нет; e2e Среза 3 проверяет `/ru/w/<new slug>/settings/workspace` |
