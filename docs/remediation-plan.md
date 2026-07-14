# Remediation Plan — inspoter (доработка до готового продукта)

**Version:** 1.1
**Status:** Active — Q-1…Q-13 приняты; Phase 2 in progress
**Owner:** Coordinator
**Date:** 2026-07-14
**Normative inputs:** `docs/prd.md` v3.1, `docs/architecture.md` v1.4, `docs/design.md` v2.0, `docs/plan.md` v1.4, `docs/test-plan.md`, `docs/progress.md`, аудит кода 2026-07-13 (см. §1), `specs/ui.md`, `specs/prototype/**`, `specs/inspot-design/**`
**Consumed by:** coordinator (dispatch), product-analyst, ui-ux-designer, architect, planner, backend-dev, frontend-dev, tester, code-reviewer, technical-writer

**Назначение документа:** исходный план (`plan.md`) описывал создание продукта с нуля и формально выполнен по коду, но продукт не готов. Этот план закрывает выявленные разрывы: интеграции-заглушки, тестовый долг, рассинхрон документации с реальным продуктом, неотвеченные открытые вопросы и несоблюдение процессных гейтов. Он **дополняет**, а не заменяет `plan.md`: нормы процесса (tester Mode A/B, DoD §10.1, ADR-012 и т.д.) остаются в силе и здесь ужесточаются (§8).

---

## 1. Findings — зафиксированные разрывы (основание плана)

Итог аудита 2026-07-13 (сверка docs/* ↔ код ↔ git-история). Каждая фаза плана трассируется к этим ID (§9).

| ID  | Разрыв | Доказательство |
| --- | ------ | -------------- |
| F-1 | **Реальные провайдеры — пустые заглушки.** Все методы Cloudflare/Hetzner-DNS/GoDaddy/Hetzner-Cloud возвращают `{ok:false, kind:"unsupported"}`. При установке реального ключа env-переключатель (`dns/index.ts`, `servers/index.ts`) уводит на заглушку → разделы Domains/Servers деградируют. Основная ценность продукта (управление доменами/серверами из idea.md) не реализована. | `src/lib/providers/dns/cloudflare.ts:10-46`, `src/lib/providers/servers/hetzner.ts:12-25` |
| F-2 | **Тестовый долг: 67 из 90 активных AC не верифицированы.** Tester Mode A/B и code-review пройдены только для Slice 0/1 (23 AC). Slice WS — 11 AC `PENDING/PARTIAL`; Slices 2–7 — 56 AC без единого теста; test-plan.md покрывает только Slice 1. | `docs/progress.md:72`, `docs/test-plan.md` §3.2, `plan.md` §5a |
| F-3 | **Дизайн и язык продукта разошлись с design.md/PRD.** Реализованы светлая тема, русская локализация, Remix Icons, выравнивание по прототипу `specs/prototype/` — всё это противоречит design.md v1.1 (dark-only, Premium Parametric) и NFR-I18N-001 (English-only, требование не трассируется к idea.md — выдумано). Bookmarks/Servers/Messages выровнены по прототипу; остальные разделы — нет (интерфейс частично двуязычный). | git: `cb533c4`, `5d9ac58`, `4da90ea`, `1b48fe2`; `specs/ui.md`, `specs/inspot-design/` |
| F-4 | **Открытые вопросы не отвечены, код уже противоречит принятым интерпретациям.** OQ-1..OQ-4, OQ-6, OQ-7, OQ-9 не резолвлены, хотя триггеры «confirm before Slice N» сработали. Messages UI уже содержит ввод сообщений и роут создания — против MVP-интерпретации OQ-2 («view-only») и вне плана. | `docs/prd.md` Appendix A; `src/components/messages/messages-view.tsx` (message input), `src/app/api/channels/[id]/messages/route.ts` |
| F-5 | **Документы рассинхронизированы с кодом.** progress.md заявляет Next 15.5.20 — фактически Next 16.2.10; middleware переехал в `src/proxy.ts` (архитектура §5.3 говорит `src/middleware.ts`); проект переименован в inspoter; `specs/ui.md` + прототип живут вне контура docs/ как параллельный источник правды. | `package.json` (next 16.2.10), `src/proxy.ts`, `docs/progress.md:31` |
| F-6 | **Процессные гейты не работали.** Деviация Slice WS задокументирована с рекомендацией «закрыть до Slice 2» — не закрыта; Slices 2–7 прошли без tester и code-review. Ни одного демо-чекпоинта с пользователем в плане не было; фидбек пользователя случился постфактум и пошёл мимо документации. | `plan.md` §5a, `progress.md:72` |
| F-7 | **Инфраструктурные и workspace-хвосты.** DB-изоляция/CI проходит отдельный R2.0-гейт; provider mock state остаётся module-global, не workspace-scoped и restart-ephemeral; Domains/Servers не имеют локальных workspace bindings; fresh seed не создаёт полный demo; error mapping требует покрытия. | `docs/test-plan.md` §5, §4c; `src/lib/providers/dns/mock.ts:163`; `src/lib/providers/servers/mock.ts`; `prisma/schema.prisma` |

---

## 2. Phase 0 — Решения пользователя (блокирующий гейт)

**Правило:** ни одна фаза 1–5 не стартует, пока по каждому вопросу нет явного ответа пользователя или явного «принять рекомендацию». Ответы фиксируются в `progress.md` Decisions log и переносятся в PRD v3.1 (Phase 1). Это закрывает корневую причину F-4 и часть F-3.

| ID  | Вопрос | Рекомендация (default) | Влияет на |
| --- | ------ | ---------------------- | --------- |
| Q-1 | Язык интерфейса: русский-only, английский-only или i18n-переключатель? Код уже частично русифицирован. | Русский-only (заменить NFR-I18N-001) — соответствует фактическому направлению правок | Phase 1 (PRD/design), Phase 2 (копирайт в e2e-селекторах), Phase 4 |
| Q-2 | Тема: только светлая, только тёмная или переключатель? Код переведён на светлую, design.md специфицирует тёмную. | Светлая как основная; переключатель — отдельный слайс позже | Phase 1, Phase 4 |
| Q-3 | Источник дизайн-истины: `specs/prototype/` + `specs/inspot-design/` + `specs/ui.md`? Тогда design.md v2 переписывается по ним, а не наоборот. | Да — прототип нормативен | Phase 1 |
| Q-4 | (OQ-2) Ввод сообщений человеком в Messages UI — легитимизировать? Код уже содержит ввод. | Да — внести в PRD как FR-MSG-003 с новыми AC | Phase 1, Phase 2 (Slice 7 тесты) |
| Q-5 | (OQ-1) Mail: только чтение входящих (webhook) или нужен compose/send? | Read-only для этой итерации (D-4 подтвердить) | Phase 1, Phase 4 |
| Q-6 | (OQ-3) Servers: только статус + start/stop/restart или lifecycle (resize/rebuild/create)? | Только power-actions (A-7 подтвердить) | Phase 3b |
| Q-7 | (OQ-4) Alerts: нужен ли acknowledge/resolve-workflow? | Не в этой итерации; view/organize/delete | Phase 1 |
| Q-8 | (OQ-6) Webhook в несуществующий канал: 4xx (как сейчас) или auto-create? | Оставить 4xx; AC-MSG-008 остаётся inactive | — |
| Q-9 | (OQ-7) Скоупинг webhook-токенов (по типу/источнику)? | Оставить нескоупленные (как реализовано) | — |
| Q-10 | (OQ-9) Retention для mail/messages/logs/alerts? | Без авто-retention (A-5 подтвердить), риск R-5 остаётся принятым | — |
| Q-11 | **Реальные интеграции: какие провайдеры нужны первыми и есть ли API-ключи/тестовые аккаунты?** | Принято: Cloudflare DNS → Hetzner Cloud → Hetzner DNS → GoDaddy; ключи добавляются в deployment `.env` инкрементально. Отсутствующий ключ сохраняет zero-network mock mode, оставляет live smoke/AC-REAL провайдера PENDING и не блокирует foundation или более раннюю mock-работу. | Phase 3 |
| Q-12 | Нужны ли демо-данные на свежей установке (seed для Logs/Alerts/Mail/Messages/Bookmarks), чтобы разделы не были пустыми «из коробки»? | Да, опциональный `db:seed:demo` | Phase 4 |
| Q-13 | Должно ли переключение workspace менять весь контент, включая Domains и Servers? | Да: весь видимый/операбельный контент workspace-scoped; глобальны только provider credentials в `.env`; upstream resource никогда не удаляется неявно | Phase 2 R2.1a–e, R2.2–R2.8; Phase 3 |

**Exit gate Phase 0:** все Q-1..Q-13 имеют зафиксированный в `progress.md` ответ — **DONE 2026-07-14**.

---

## 3. Phase 1 — Синхронизация нормативной базы (документация ← реальность)

**Цель:** docs/ снова единственный источник правды; каждое требование трассируется либо к idea.md, либо к явному решению пользователя (Phase 0). Закрывает F-3, F-4 (документная часть), F-5.

**Порядок внутри фазы:** 1.1 → 1.2 → (1.3 ∥ 1.4) → 1.5. Тесты Phase 2 пишутся против обновлённых документов, поэтому Phase 1 предшествует Phase 2.

| #   | Задача | Роль | Deliverable / Acceptance |
| --- | ------ | ---- | ------------------------ |
| 1.1 | **PRD v3.1.** Внести решения Phase 0: заменить NFR-I18N-001 (язык per Q-1); добавить FR-MSG-003 (человеческий ввод сообщений, AC-MSG-009..0NN — если Q-4=да); резолвить OQ-1..4/6/7/9 (перевести D-4/D-5 из provisional в confirmed или расширить scope новыми FR); добавить §3.11 «Real provider enablement» c AC-REAL-* (см. Phase 3) и критерием готовности продукта, сформулированным от ценности: «оператор с реальным ключом провайдера видит и изменяет реальные DNS-записи / управляет реальным сервером». Каждое требование получает трассировку к idea.md или к Q-ID; требования без источника удаляются. | product-analyst | prd.md v3.1; doc-review PASS; ни одного требования без источника |
| 1.2 | **design.md v2 на основе прототипа.** Переписать по нормативным артефактам `specs/prototype/`, `specs/ui.md`, `specs/inspot-design/` (Q-3): светлая тема (Q-2), русские тексты (Q-1), Remix Icons, фактические лейауты Bookmarks/Servers/Messages. Зафиксировать дельту «прототип ↔ текущий код» по каждому разделу (какие разделы ещё не выровнены — вход для Phase 4). Тёмная тема — в deferred-приложение. | ui-ux-designer | design.md v2 + таблица дельт по 7 разделам; doc-review PASS |
| 1.3 | **architecture.md v1.4.** Сохранить CURRENT-аудит Next 16/Settings/providers и добавить утверждённый Q-13 TARGET: schema/migration/header/binding/lease/UI-cache contract. | architect | architecture.md v1.4; independent doc-review PASS; TARGET не выдан за CURRENT |
| 1.4 | **progress.md актуализация.** Исправить версии стека, добавить строки этого плана в Task table, зафиксировать ответы Phase 0 в Decisions log. | technical-writer | progress.md консистентен с package.json и этим планом |
| 1.5 | **Инвентаризация specs/ → docs/.** `specs/ui.md`, скриншоты и прототип объявляются нормативными входами (ссылки из design.md v2); правило синхронизации — §8 P-RULE-5. | technical-writer | Ссылочная целостность docs/ ↔ specs/ |

**Exit gate Phase 1:** PRD v3.1, design v2 и architecture v1.4 должны пройти doc-review; в документах нет утверждений, противоречащих коду, кроме явно помеченных «to be implemented in Phase N».

---

## 4. Phase 2 — Закрытие тестового долга и ревью (восстановление DoD-базы)

**Цель:** каждый реализованный слайс доведён до DoD §10.1 исходного плана: acceptance-тесты + code-review. Закрывает F-2, часть F-7. Тесты пишутся против PRD v3.1 (учитывая русскую локализацию в селекторах/копирайте).

**Порядок (по риску):** 2.0 инфраструктура → R2.1a–e workspace foundation → 2.2 Webhook/Logs/tokens → 2.3 Domains/DNS → 2.4 Servers → 2.5 Alerts → 2.6 Mail → 2.7 Messages → 2.8 all-section gate. После каждого под-слайса — code-review, rework ≤2, затем следующий.

**Q-13 общий implementation gate:** каждый session-authenticated browser API проходит auth/membership → `X-Inspoter-Workspace` compare → target authorization до query/cache/write/binding/provider; foreign binding = non-disclosing 404 и zero provider calls. Provider I/O запрещён в DB transactions. Миграции/repair исполняются без provider credentials/network. Все ответы private/no-store, все client caches/cursors workspace-bound.

**Q-13 database gate:** перед принятием R2.1a обязательны `prisma validate`, PostgreSQL 16 fresh replay и manifest-repaired replay, forced forward failure/retry, строгие partial-null CHECK, удаление superseded single-column FK, populated cascade/`SET NULL`/`RESTRICT`, sentinel id + `(workspaceId,reservedName)` collision/zero-remnant, выявление групп-дубликатов `AlertCategory (workspaceId,name)`; для каждой группы требуется явное решение человека merge/rename, иначе abort; identity/lease CHECK и JSON→SQL version/SHA/byte/checksum parity.

| #   | Задача | Роль | AC / Acceptance |
| --- | ------ | ---- | --------------- |
| 2.0 | **DB-изоляция e2e + CI.** Отдельная тестовая БД (schema-per-run или `docker compose` fresh volume + TRUNCATE перед прогоном); GitHub Actions (или локальный ci-скрипт): lint → typecheck → unit → e2e на чистой БД. Закрывает test-plan §5 residual risk. | implementor + tester | 3 подряд полных прогона e2e на CI-профиле зелёные и детерминированные |
| 2.1a | **Role/session/repair/migration foundation.** `WorkspaceRole`, Session composite membership, direct child ownership + compound FKs/CHECKs, Alert strict pair, full manifest repair, sentinel transport, forward/fresh migration, canonical mock SQL. | database engineer → tester → code-reviewer | PostgreSQL 16 database gate выше PASS; no provider/network; schema/manifest parity review PASS |
| 2.1b | **Workspace administration and session safety.** Owner/member authorization, target membership, never remove last owner/last membership, deterministic fallback, lock order workspace→operator→membership→binding; trimmed nonempty workspace name, deterministic nonempty ASCII fallback for Cyrillic-only names, atomic workspace+`OWNER` creation, bounded slug-conflict retry. | backend-dev → tester → code-reviewer | AC-WS-001..007/009 facets PASS; adversarial API/concurrency tests; review PASS |
| 2.1c | **Expected-workspace header across all browser APIs.** `X-Inspoter-Workspace` on every method including workspace list/create/admin/switch; exact `400 CONTEXT_REQUIRED`/`409 CONTEXT_STALE`; header never selects authority. | backend-dev → tester → code-reviewer | Route inventory 100%; missing/malformed/match/stale/order tests; zero business/provider work before compare |
| 2.1d | **Keyed browser boundary + Bookmarks facet.** Abort/discard/clear/refresh/remount, GET-only refetch, mutation no-retry, private/no-store/Vary, workspace-bound cache keys; cursor envelope binds workspace + normalized filter + sort/order + version and rejects malformed/replayed envelopes before query; compound Bookmark ownership; P2003/P2025 and axe coverage. | frontend-dev + backend-dev → tester → code-reviewer | Bookmarks facet of AC-WS-008/010/011 PASS; stale-tab and cursor-replay tests; review PASS |
| 2.1e | **Generic provider binding/claim/lease foundation.** Exclusive `ProviderResourceBinding`, account/remote identity bounds, manifest mocks, owner discovery/claim/transfer/remove, local-only delete, short lease tx → provider I/O/readback outside tx → CAS/reconcile. MOCK bindings are non-transferable because `remoteId` embeds workspace; only REAL transfer is allowed, and rejection makes zero provider calls. | backend-dev + database engineer → tester → code-reviewer | Collision/rotation/identity/claim/transfer/remove/delete/lease/reconcile tests; foreign=404+zero call; no active/unresolved deletion |
| 2.2 | **Webhook backbone, Logs, tokens + workspace facet.** Atomic idempotency, direct/compound ownership, all 401/400/201/429/413 paths, rate limit, one-time secret/revoke, pagination, header/stale-context/API isolation. | tester → code-reviewer | AC-WH/LOG plus Logs/tokens facets of AC-WS-008/010/011 PASS; review PASS |
| 2.3 | **Domains/DNS mock facet.** Workspace-exclusive manifest mocks/bindings, record CRUD/validation, provider error isolation, foreign-binding zero-call, cache/cursor/header/stale-tab behavior. | tester → code-reviewer | AC-DOM/PROV Domains facet + workspace facet PASS; review PASS |
| 2.4 | **Servers mock facet.** Workspace-exclusive servers, deterministic power state, confirmation/error/reconcile, foreign-binding zero-call, header/stale-tab behavior. | tester → code-reviewer | AC-SRV/PROV Servers facet + workspace facet PASS; review PASS |
| 2.5 | **Alerts facet.** Durable direct ownership, strict optional category pair/`SET NULL`, delete, ingest, filtering/pagination, header/cache/cursor isolation. | tester → code-reviewer | AC-ALR + Alerts facet of AC-WS-008/010/011 PASS; review PASS |
| 2.6 | **Mail facet.** Direct ownership, webhook ingest, filters/keyset cursor bound to workspace, header/stale-tab isolation. | tester → code-reviewer | AC-MAIL + Mail facet of AC-WS-008/010/011 PASS; review PASS |
| 2.7 | **Messages facet.** Compound category/channel/message ownership, operator/webhook origin, missing-channel 4xx, pagination cursor/header/stale-tab isolation. | tester → code-reviewer | Active AC-MSG + Messages facet of AC-WS-008/010/011 PASS; review PASS |
| 2.8 | **Two-workspace/two-member all-section integration gate.** Switch repeatedly across Bookmarks, Domains/DNS, Servers, Mail, Messages, Logs, Alerts, Settings, and tokens; exercise reads/mutations/caches/cursors/stale tabs and role boundaries. | integration tester → code-reviewer | Only this gate may set AC-WS-008/010/011 PASS and Workspaces 11/11; zero cross-workspace leaks/provider calls; full axe/error-mapping regression PASS |

**Note (Mode A/B для написанного кода):** классический Mode A («красные до реализации») невозможен ретроспективно. Правило подлинности вместо него: tester пишет тесты **только из PRD v3.1-формулировок AC**, не подглядывая в реализацию; каждый тест обязан упасть при инъекции мутации (spot-check code-reviewer'ом минимум на 2 тестах на слайс).

**Exit gate Phase 2:** test-plan.md покрывает все безусловно активные AC PRD v3.1; каждый facet имеет runtime evidence и review PASS; R2.8 единолично закрывает AC-WS-008/010/011 и Workspaces 11/11; CI зелёный. Static/discovery evidence не считается runtime PASS.

---

## 5. Phase 3 — Реальные интеграции (провайдеры)

**Цель:** продукт выполняет своё основное назначение с реальными аккаунтами. Закрывает F-1. Инкрементальна: каждый под-этап самостоятелен и включается по мере наличия ключей (Q-11).

**Общий каркас (3.0, перед первым провайдером):**

- `src/lib/providers/http.ts` — общий тонкий HTTP-хелпер: таймаут, ретраи с backoff на 429/5xx, маппинг ошибок в `ProviderResult` (`auth_error`, `rate_limited`, `unreachable`, `provider_error`), без утечки секретов в логи. (architect специфицирует в 1.3; backend-dev реализует.)
- **Новые AC (PRD v3.1 §3.11), шаблон на провайдера P:**
  - AC-REAL-P-001: с валидным ключом P раздел показывает реальные данные аккаунта (домены/записи или серверы).
  - AC-REAL-P-002: мутация (создание DNS-записи / power-action) применяется в P и подтверждается повторным чтением.
  - AC-REAL-P-003: невалидный/отозванный ключ → per-provider error-индикатор, остальные провайдеры работают (N-1), приложение не падает.
  - AC-REAL-P-004: секрет ключа не появляется ни в одном API-ответе и не логируется (NFR-SEC-002).
- **Тестовая стратегия:** unit — контрактные тесты на mock HTTP-фикстурах (записанные реальные ответы API); интеграционный smoke с живым ключом — ручной чек-лист + опциональный `test:real:<provider>` прогон, исключённый из CI. Mock-режим остаётся дефолтом без ключей (AC-PROV-001/002 не регрессируют).

| #   | Задача | Провайдер / API | Роль | Acceptance |
| --- | ------ | --------------- | ---- | ---------- |
| 3.0 | HTTP-каркас + фикстурная инфраструктура | — | backend-dev | Юнит-тесты хелпера зелёные; ADR по ретраям принят |
| 3.1 | **Cloudflare DNS** — `listDomains` (zones), `listRecords`, `createRecord`, `updateRecord`, `deleteRecord` (API v4, Bearer token `CLOUDFLARE_API_TOKEN`) | Cloudflare | backend-dev → tester → code-reviewer | AC-REAL-CF-001..004; контрактные тесты; ручной smoke с реальным ключом задокументирован в test-plan |
| 3.2 | **Hetzner Cloud (servers)** — list servers, статусы, power on/off/reboot + поллинг до сходимости D-9 (30/30/60s) (`HCLOUD_TOKEN`) | Hetzner Cloud | backend-dev → tester → code-reviewer | AC-REAL-HC-001..004; AC-SRV-004..006 проходят против реального API в smoke |
| 3.3 | **Hetzner DNS** (`HETZNER_DNS_TOKEN`) | Hetzner DNS | backend-dev → tester → code-reviewer | AC-REAL-HD-001..004 |
| 3.4 | **GoDaddy DNS** (`GODADDY_API_KEY/SECRET`; внимание: у GoDaddy порог доступности API по числу доменов — проверить применимость на аккаунте пользователя, иначе задокументированно исключить) | GoDaddy | backend-dev → tester → code-reviewer | AC-REAL-GD-001..004 или задокументированное исключение решением пользователя |
| 3.5 | **Provider identity/mock manifest/reconciliation hardening.** Проверить стабильный `accountKey`/remote id каждого реального адаптера, rotation/mismatch/collision, provider-specific readback/reconcile; сохранить workspace-exclusive mock identity из canonical JSON и zero shared mutable state. | — | architect + backend-dev + tester | R3.x fixture/real evidence; JSON→SQL parity не регрессирует; foreign bindings zero-call; no provider I/O in DB tx |

**Exit gate Phase 3:** для каждого включённого провайдера AC-REAL-* PASS (контрактные тесты в CI, живой smoke задокументирован); стабильная account identity и reconciliation подтверждены; реальные ресурсы видимы/операбельны только через active-workspace binding; переключение mock↔real только через env (AC-PROV-002); демо пользователю (§8 P-RULE-3).

---

## 6. Phase 4 — Продуктовые доработки (выравнивание с прототипом и решениями Phase 0)

**Цель:** единый, завершённый пользовательский опыт. Закрывает остаток F-3, часть F-7. Объём уточняется таблицей дельт из задачи 1.2.

| #   | Задача | Роль | Acceptance |
| --- | ------ | ---- | ---------- |
| 4.1 | **Завершить локализацию и выравнивание по прототипу** для разделов, не покрытых коммитами выравнивания: Login, Domains, Mail, Logs, Alerts, Settings (+ Workspace-management), диалоги и тосты. Убрать двуязычие; словарь терминов — из `specs/ui.md`. | frontend-dev | UI-аудит: 0 англоязычных строк (кроме утверждённых терминов); скриншоты соответствуют прототипу; e2e Phase 2 остаются зелёными (селекторы обновляются синхронно tester'ом) |
| 4.2 | **Светлая тема — добить токены** по `specs/inspot-design/` во всех разделах (severity/status-цвета Logs/Alerts/Servers на светлом фоне, контраст WCAG AA). | frontend-dev | axe: 0 критических нарушений на всех разделах; design v2 соблюдён |
| 4.3 | **Messages compose — довести до спеки** (если Q-4=да): валидация, автор-оператор vs webhook-источник в отображении, error-состояния; PRD-новые AC из 1.1 покрыты тестами в 2.7. | backend-dev + frontend-dev | AC-MSG-009+ PASS |
| 4.4 | **Demo-seed** (если Q-12=да): `npm run db:seed:demo` — представительные данные для всех разделов; идемпотентен; не смешивается с продуктивом (отдельный флаг/workspace). | backend-dev | Свежая установка + demo-seed → ни одного пустого раздела; повторный запуск не дублирует |
| 4.5 | **Onboarding пустых состояний**: у каждого раздела пустое состояние с подсказкой следующего шага (для webhook-разделов — сниппет curl с плейсхолдером токена). | frontend-dev | e2e-проверка пустых состояний по разделам |
| 4.6 | **README + deploy-документация**: актуальный quick-start (docker compose, env-контракт, подключение реальных ключей, демо-seed). | technical-writer | Чистая машина: старт по README до рабочего логина без обращения к другим документам |

**Exit gate Phase 4:** UI-аудит по design v2 без критических находок; полный e2e-прогон зелёный; README-проверка пройдена.

---

## 7. Phase 5 — Верификация продукта целиком и приёмка

**Цель:** доказать готовность по критерию ценности, а не только по AC.

| #   | Задача | Роль | Acceptance |
| --- | ------ | ---- | ---------- |
| 5.1 | Полный регресс: unit + e2e + axe на чистой БД, CI-профиль | tester | Всё зелёное, свежие логи в отчёте |
| 5.2 | End-to-end сценарий оператора на **реальных** аккаунтах (по включённым провайдерам): логин → bookmarks → реальный домен → правка DNS-записи → реальный сервер → restart → webhook-ингест log/alert/mail/message с реальным токеном → просмотр в разделах → workspace-switch | tester (чек-лист) + пользователь | Подписанный чек-лист; расхождения → issues |
| 5.3 | **Финальное демо пользователю** и явная приёмка | coordinator + пользователь | Решение пользователя: accepted / список доработок |

**MVP DoD (пересмотренный, заменяет plan.md §10.2):** продукт готов, когда (a) все активные AC PRD v3.1 — PASS в test-plan.md v2; (b) AC-REAL-* PASS для провайдеров, включённых решением Q-11; (c) чек-лист 5.2 подписан; (d) демо 5.3 принято пользователем. Пункт (d) — обязательный: техническая зелёность без приёмки пользователем готовностью не считается.

---

## 8. Процессные правила (enforcement — закрывает F-6)

Нарушение любого правила — блокер для следующей фазы, снимается только явным решением пользователя, записанным в progress.md с датой закрытия долга.

- **P-RULE-1 (гейт слайса/фазы):** следующая фаза не стартует, пока exit gate текущей не пройден и не зафиксирован в progress.md со свежим командным выводом. «Задокументированная девиация» без даты закрытия долга не является прохождением гейта.
- **P-RULE-2 (OQ-гейт):** вопрос со сроком «before Phase/Slice N» без ответа пользователя блокирует старт N. Провизиональное решение не может молча стать постоянным.
- **P-RULE-3 (демо-чекпоинт):** после каждой фазы — короткое демо пользователю на работающем приложении. Фидбек фиксируется как решения (progress.md) и правки документов до продолжения работ.
- **P-RULE-4 (выдуманные требования):** требование, не трассируемое к idea.md, specs/* или Q-ID/Decision, не попадает в PRD. Doc-review проверяет трассировку источника, а не только внутреннюю консистентность.
- **P-RULE-5 (живая документация):** изменение кода, затрагивающее требования/дизайн/архитектуру, сопровождается правкой соответствующего документа в том же изменении. Артефакты `specs/` — нормативные входы design.md; их обновление тоже проходит через P-RULE-3.

---

## 9. Трассировка findings → фазы

| Finding | Закрывается |
| ------- | ----------- |
| F-1 (провайдеры-заглушки) | Phase 3 (+1.1 §3.11, +1.3 архитектура real providers) |
| F-2 (тестовый долг) | Phase 2 |
| F-3 (дизайн/язык разошлись) | Phase 0 (Q-1..Q-3) → Phase 1 (1.1, 1.2) → Phase 4 (4.1, 4.2) |
| F-4 (OQ не отвечены; Messages вне спеки) | Phase 0 → 1.1 → 2.7 / 4.3 |
| F-5 (docs ↔ код рассинхрон) | Phase 1 (1.3, 1.4, 1.5) + P-RULE-5 |
| F-6 (гейты не работали) | §8 P-RULE-1..3; Phase 5 (приёмка) |
| F-7 (CI/seed/изоляция/точечные дыры) | 2.0, 2.8, 3.5, 4.4, 4.5 |

## 10. Порядок, зависимости, риски

```
Phase 0 (решения пользователя)                      [гейт: ответы Q-1..Q-13 — DONE]
   └─→ Phase 1 (PRD v3.1 → design v2 ∥ architecture v1.4 → sync)  [гейт: Q13-DOC review PASS]
          └─→ Phase 2 (2.0 → 2.1a-e → 2.2 → … → 2.7 → 2.8)       [гейт: active AC PASS, WS 11/11, CI зелёный]
                 ├─→ Phase 3 (3.0 → 3.1 → 3.2 → 3.3 → 3.4)        [по мере ключей; гейт: AC-REAL PASS + демо]
                 └─→ Phase 4 (4.1 ∥ 4.2 → 4.3..4.6)               [гейт: UI-аудит + e2e зелёные]
                        └─→ Phase 5 (регресс → real-сценарий → приёмка)
```

- Phase 3 и Phase 4 независимы и могут идти параллельно после Phase 2; обе до Phase 5.
- 4.1 (локализация) меняет копирайт → e2e-селекторы: tester обновляет тесты в той же итерации (иначе Phase 2 результат регрессирует). Смягчение: в 2.x селекторы строить на `data-testid`/ролях, а не на текстах, где возможно.
- Риск: ключ провайдера ещё не добавлен (Q-11) → zero-network mock semantics не меняются и не считаются runtime PASS; соответствующие R3.x live smoke/AC-REAL и финальная real-provider acceptance остаются PENDING до появления credentials/account evidence.
- Риск: объём дельты 1.2 больше ожидаемого → Phase 4 дробится на под-слайсы по разделам, каждый со своим мини-гейтом (P-RULE-1).

## 11. Изменения других документов, порождаемые этим планом

- `docs/prd.md` → v3.1 (задача 1.1); `docs/design.md` → v2 (1.2); `docs/architecture.md` → v1.4 (1.3); `docs/progress.md` — Task table + Decisions (1.4, далее по ходу); `docs/test-plan.md` → v2, покрытие всех слайсов (Phase 2).
- `docs/plan.md` не переписывается: остаётся историческим документом исходной разработки; его процессные нормы (§2, §10.1, ADR-ссылки) действуют здесь по ссылке.
