# Аудит исходного кода Inspoter

Дата аудита: 2026-08-25  
Ревизия: `6734af874ea16c35091a186e9099da8344299f96` (`bump version 0.5.0`)

## 1. Итог

Вердикт: **BLOCK** для production-релиза и обновления существующих
инсталляций до устранения дефектов P1.

Подтверждено 12 дефектов:

| Приоритет        | Количество |
| ---------------- | ---------: |
| P0 — критический |          0 |
| P1 — высокий     |          5 |
| P2 — средний     |          4 |
| P3 — низкий      |          3 |

Наиболее опасные проблемы:

1. миграция безвозвратно удаляет действующие токены агентов метрик;
2. публичный Discord ingress буферизует multipart-тело до аутентификации;
3. участник workspace может заставить сервер обращаться к произвольным
   внутренним адресам через интеграции;
4. публичный локальный вход не ограничивает частоту попыток;
5. IMAP-синхронизация загружает и накапливает сообщения без лимита размера и
   количества.

Подтверждённые дефекты ниже отделены от предупреждений зависимостей, для
которых уязвимый путь из пользовательского ввода не доказан.

## 2. Область и методика

Проверены исходники приложения, API-маршруты, Prisma-схема и миграции,
аутентификация и авторизация, загрузка файлов, webhook-потоки, почта, метрики,
провайдеры, LLM-интеграции, контейнеризация, CI и production-зависимости.

Основные классы проверки:

- разграничение доступа между пользователями и workspace;
- обход аутентификации, brute force и управление сессиями;
- SSRF, XSS, инъекции и небезопасная обработка внешних данных;
- DoS через размер тела, память, CPU и неограниченные коллекции;
- целостность данных, конкурентные операции и миграции;
- хранение секретов, криптография и конфигурация поставки;
- достижимость известных уязвимостей зависимостей.

Аудит является анализом конкретного снимка репозитория. Он не заменяет
пентест развёрнутого экземпляра, проверку reverse proxy, production-секретов,
сетевых ACL и фактической конфигурации окружения.

## 3. Статус проверок

| Статус        | Проверка                         | Результат                                                    |
| ------------- | -------------------------------- | ------------------------------------------------------------ |
| PASS          | `pnpm install --frozen-lockfile` | lockfile воспроизводим                                       |
| PASS          | `pnpm typecheck`                 | ошибок TypeScript нет                                        |
| PASS          | `pnpm lint`                      | ESLint, native controls и base language прошли               |
| PASS          | `pnpm test:unit`                 | 123 файла, 1694 теста                                        |
| PASS          | `pnpm test:integration`          | 53 файла, 806 тестов                                         |
| PASS          | `pnpm build`                     | production-сборка прошла с синтетическими build-only env     |
| PASS          | поиск типовых секретов           | приватные ключи и типовые API-токены не найдены              |
| PASS          | инвентаризация API guard'ов      | не найден маршрут без ожидаемого auth/public guard           |
| BASELINE_FAIL | `pnpm audit --prod --json`       | 3 high advisory в транзитивных зависимостях                  |
| BLOCKED       | `pnpm test:e2e`                  | Docker исчерпал predefined address pools                     |
| UNVERIFIED    | production runtime               | reverse proxy, egress ACL, CSP и реальные env не проверялись |

Первый запуск сборки без env ожидаемо остановился из-за отсутствия
`DATABASE_URL` и `OPERATOR_USERNAME`. Повтор с теми же фиктивными build-only
значениями, которые используются в Docker build, прошёл. Production-данные и
production-конфигурация не изменялись.

## 4. Подтверждённые дефекты

### AUD-001 — P1 — Миграция удаляет действующие токены агентов метрик

**Компонент:** Prisma migrations, server metrics authentication  
**Класс:** потеря данных, отказ функциональности при обновлении

Миграция `20260721120000_add_local_servers_and_metrics` создаёт таблицу
`ServerAgentToken` с хешами, префиксами, состоянием отзыва и метаданными
использования (`prisma/migrations/20260721120000_add_local_servers_and_metrics/migration.sql:49`).
Следующая миграция удаляет таблицу и enum без переноса данных
(`prisma/migrations/20260724100000_universal_api_tokens/migration.sql:1`).
Текущий metrics ingress принимает только `WebhookToken`
(`src/lib/services/serverMetrics.ts:61`). Docker запускает `prisma migrate
deploy` перед приложением (`Dockerfile:43`).

**Сценарий:** существующая инсталляция уже выдала агентам токены старого типа,
затем обновляется через штатный Docker entrypoint. Миграция удаляет все хеши,
и ранее выданные секреты больше невозможно проверить. Агенты прекращают
отправлять метрики. Исходные секреты из хешей восстановить нельзя.

**Рекомендация:** если миграция ещё не публиковалась, до `DROP TABLE` перенести
совместимые активные записи в `WebhookToken`, сохранив workspace, имя, prefix,
отзыв и usage metadata. Если миграция уже применялась, остановить rollout,
восстановить БД из резервной копии либо провести явную ротацию и повторную
регистрацию агентов. Добавить migration-тест обновления заполненной старой БД.

### AUD-002 — P1 — Публичный Discord ingress буферизует тело до аутентификации

**Компонент:** Discord webhook ingress  
**Класс:** unauthenticated memory exhaustion

Для multipart-запроса код доверяет необязательному `Content-Length`, после
чего вызывает `request.formData()` (`src/lib/webhooks/discordPipeline.ts:81`).
Фактический streaming-limit, используемый для JSON, к multipart не применяется
(`src/lib/webhooks/discordPipeline.ts:112`). Парсинг выполняется до проверки
токена и rate limit (`src/lib/webhooks/discordPipeline.ts:199`). Маршрут
намеренно публичен (`src/proxy.ts:87`).

**Сценарий:** анонимный клиент отправляет chunked multipart-запрос без
`Content-Length` либо с ложным малым значением на случайный URL ingress.
Framework должен сначала буферизовать/распарсить тело, и только затем приложение
отклонит неверный токен. Параллельные большие запросы способны исчерпать память
процесса.

**Рекомендация:** проверять path token до дорогостоящего парсинга и применять
streaming multipart parser с лимитом по реально прочитанным байтам. Настроить
жёсткий body limit на reverse proxy как дополнительный барьер. Добавить тесты
chunked-запроса без `Content-Length` и с неверным токеном.

### AUD-003 — P1 — Участник workspace получает SSRF через интеграции

**Компонент:** outgoing webhooks, provider credentials, LLM providers  
**Класс:** SSRF, обход сетевой границы

Outgoing webhook принимает любой HTTPS URL после синтаксического разбора
(`src/lib/validation/outgoingWebhooks.ts:26`) и выполняет `fetch` без проверки
DNS/IP и политики redirect (`src/lib/services/outgoingWebhooks.ts:582`). Создать
его может любой участник workspace (`src/app/api/outgoing-webhooks/route.ts:19`).

Тот же уровень доступа разрешён для provider credentials
(`src/lib/services/credentials.ts:32`). OpenAI-compatible credential принимает
произвольный `baseUrl` (`src/lib/validation/credentials.ts:67`), который затем
используется в server-side запросах (`src/lib/llm/openai.ts:121`). cPanel
нормализует произвольный hostname в URL
(`src/lib/providers/hosting/cpanel.ts:3`), а общий HTTP-клиент отправляет запрос
(`src/lib/providers/http.ts:74`).

**Сценарий:** пользователь с ролью MEMBER задаёт loopback, link-local,
RFC1918/ULA, metadata endpoint либо публичный HTTPS URL, который перенаправляет
на внутренний HTTP-адрес. Стандартный `fetch` следует redirect. Сервер становится
сетевым посредником для разведки и вызова внутренних сервисов; некоторые
интеграции также возвращают тело ответа в приложение.

**Рекомендация:** ограничить управление сетевыми интеграциями ролью OWNER и
ввести единую egress-политику. Канонизировать URL, разрешать только нужные
схемы, резолвить DNS и запрещать loopback, link-local, private, ULA и metadata
адреса, если владелец явно не включил аудитируемый private-destination режим.
Проверять фактический адрес соединения и каждый redirect либо использовать
`redirect: "manual"`. Добавить egress firewall и тесты IPv4/IPv6, DNS rebinding,
encoded address и redirect chain.

### AUD-004 — P1 — Локальный вход не защищён от перебора и CPU DoS

**Компонент:** local authentication  
**Класс:** brute force, resource exhaustion

Login action для каждой публичной попытки выполняет поиск пользователя и
scrypt-проверку без rate limit, backoff или временной блокировки
(`src/app/[locale]/login/actions.ts:37`). Пароль оператора из env допускает
минимальную длину 1 (`src/lib/config/env.ts:180`), а пароль создаваемого участника
— 6 символов (`src/lib/validation/workspaces.ts:38`). Dummy hash скрывает
существование username, но делает каждую неуспешную попытку намеренно дорогой.

**Сценарий:** удалённый клиент параллельно перебирает пароль либо посылает
большое число случайных username. Это одновременно повышает шанс захвата слабой
учётной записи и расходует CPU на scrypt.

**Рекомендация:** добавить распределённый лимит по IP и нормализованному
username, экспоненциальную задержку и оповещение о всплесках. Избегать
неограниченной постоянной блокировки, которой можно злоупотребить для DoS.
Для новых локальных паролей требовать не менее 12 символов и отклонять часто
используемые пароли. В OIDC-only режиме предусмотреть отключение local login.

### AUD-005 — P1 — IMAP sync загружает неограниченный объём писем в память

**Компонент:** mail synchronization  
**Класс:** memory/DB exhaustion от внешнего отправителя

Incremental sync запрашивает диапазон `${afterUid + 1}:*` с `source: true` и
добавляет все результаты в один массив
(`src/lib/mail/imap-smtp.ts:347`). Затем `simpleParser` разбирает полный RFC822
source и сохраняет полные text/HTML bodies (`src/lib/mail/imap-smtp.ts:383`).
Сервис после завершения remote fetch последовательно пишет тела в БД
(`src/lib/services/mail-sync.ts:128`). Ленивая обработка вложений не помогает:
полный source уже скачан и разобран.

**Сценарий:** внешний отправитель доставляет много писем либо письмо с большим
HTML/text body в пределах лимита почтового сервера. Следующий sync одновременно
держит сырые сообщения и разобранные тела, что может завершить процесс по OOM и
неограниченно раздувать БД.

**Рекомендация:** обрабатывать UID фиксированными страницами, сначала читать
`RFC822.SIZE`/`BODYSTRUCTURE`, ограничивать сырой и декодированный размер,
стримить и сохранять по одному сообщению или малому batch. Oversized-письма
помещать в карантин либо сохранять только metadata и понятный placeholder.
Добавить тесты большого body и длинного диапазона UID.

### AUD-006 — P2 — Лимиты multipart upload срабатывают после буферизации

**Компонент:** backup import, contact import/photo, draft attachments  
**Класс:** authenticated memory exhaustion

Несколько маршрутов сначала проверяют необязательный `Content-Length`, затем
вызывают `request.formData()` и только после этого проверяют размер файла:

- `src/app/api/backup/import/route.ts:24`;
- `src/app/api/contacts/import/route.ts:20`;
- `src/app/api/v1/contacts/import/route.ts:25`;
- `src/app/api/contacts/[id]/photo/route.ts:61`;
- `src/app/api/v1/contacts/[id]/photo/route.ts:52`;
- `src/app/api/mail/drafts/[id]/attachments/route.ts:25`.

Chunked-запрос или отсутствие header обходит ранний фильтр, а `formData()` и
последующий `arrayBuffer()` уже расходуют память до проверки. Требуется
аутентифицированный MEMBER или API token; backup import доступен OWNER, поэтому
приоритет ниже публичного ingress.

**Рекомендация:** вынести загрузки в общий streaming multipart helper с жёстким
бюджетом фактически прочитанных байтов и ограничениями на число частей. Body
limit reverse proxy оставить как defense in depth.

### AUD-007 — P2 — Просмотр HTML-письма автоматически раскрывает факт открытия

**Компонент:** mail UI  
**Класс:** privacy leak через passive content

HTML очищается DOMPurify, но конфигурация запрещает формы и inline styles, а не
`img`, `video`, `audio`, `source`, poster и другие пассивные URL
(`src/components/mail/mail-body.tsx:20`). Очищенный HTML напрямую вставляется в
DOM (`src/components/mail/mail-body.tsx:53`). Диагностическая проверка текущей
конфигурации сохранила `<img src="https://attacker.example/open?id=42">`.
Отдельной политики изображений/CSP в `next.config.ts` нет
(`next.config.ts:4`).

**Сценарий:** отправитель вставляет уникальный tracking pixel. При открытии
письма браузер оператора обращается к внешнему серверу и раскрывает время
прочтения, IP/сетевую точку выхода, User-Agent и потенциально origin через
referrer. Cookies приложения на чужой origin не отправляются.

**Рекомендация:** по умолчанию блокировать все удалённые passive resources и
показывать явное действие «загрузить внешние изображения». Альтернатива —
same-origin privacy proxy без forwarding cookies и с `Referrer-Policy:
no-referrer`.

### AUD-008 — P2 — Параллельное удаление оставляет оператора без workspace

**Компонент:** workspace lifecycle  
**Класс:** race condition, нарушение бизнес-инварианта

Перед удалением workspace сервис отдельно считает другие memberships, а затем
в другой операции удаляет workspace (`src/lib/services/workspaces.ts:267`).
Проверка и удаление не защищены общей транзакцией или lock.

**Сценарий:** у владельца ровно два workspace. Два параллельных запроса удаления
видят по одному «другому» membership и оба проходят guard. В результате
удаляются оба workspace. Страница no-workspace предлагает только logout
(`src/app/[locale]/no-workspace/page.tsx:10`), а создание через API само требует
workspace auth (`src/app/api/workspaces/route.ts:21`), поэтому локальный оператор
может потребовать помощи другого владельца или прямого ремонта БД.

**Рекомендация:** внутри одной транзакции брать operator-scoped advisory lock,
повторно считать memberships и удалять запись под тем же lock. В проекте уже
есть аналогичный приём в `ensureDefaultWorkspace`
(`src/lib/services/workspaces.ts:170`). Добавить конкурентный regression test.

### AUD-009 — P2 — Get-or-create категорий и каналов сообщений создаёт дубли

**Компонент:** messages API  
**Класс:** race condition, нарушение idempotency

Создание категории и канала выполняется как `findFirst`, затем `create`; в коде
прямо отмечено, что конкурентные запросы могут создать дубль
(`src/lib/services/messages.ts:144`). Prisma-схема не содержит уникального
нормализованного ключа (`prisma/schema.prisma:429`). При этом OpenAPI описывает
операции как idempotent (`specs/openapi.json:5550`, `specs/openapi.json:5699`).

**Сценарий:** два агента одновременно создают одинаковое имя. Оба не находят
запись и вставляют дубликаты, которые затем отображаются как разные узлы и
делают последующие операции неоднозначными.

**Рекомендация:** добавить `normalizedName` и уникальные ограничения
`(workspaceId, normalizedName)` и
`(workspaceId, messageCategoryId, normalizedName)`. Миграция должна сначала
детерминированно объединить существующие дубли. Использовать upsert либо ловить
`P2002` и читать победившую запись. Добавить конкурентный тест.

### AUD-010 — P3 — Параллельное создание одинаковых workspace возвращает 500

**Компонент:** workspace creation  
**Класс:** race condition, ошибочная обработка конфликта

Slug выбирается через последовательность `findUnique`, после чего создание
происходит отдельно (`src/lib/services/workspaces.ts:95`,
`src/lib/services/workspaces.ts:149`). В схеме slug глобально уникален
(`prisma/schema.prisma:75`).

**Сценарий:** два одновременных запроса с одинаковым названием выбирают один
slug. Один успешно создаётся, второй получает необработанный `P2002`, который
превращается в 500 вместо следующего suffix или контролируемого 409.

**Рекомендация:** выполнять create-attempt loop: на конфликте slug увеличить
suffix и повторить ограниченное число раз, либо сериализовать генерацию lock.
Проверить `Promise.all` regression test.

### AUD-011 — P3 — Истёкшие сессии не удаляются

**Компонент:** session lifecycle  
**Класс:** неограниченный рост данных

Каждый вход добавляет новую строку Session. При истечении `getCurrentUser`
только возвращает `null`, а logout удаляет лишь текущую сессию
(`src/lib/auth/session.ts:30`). В схеме есть индекс по `expiresAt`, но механизма
очистки нет (`prisma/schema.prisma:61`).

**Сценарий:** в долгоживущей инсталляции повторные входы постоянно увеличивают
таблицу и индексы, ухудшая обслуживание и резервное копирование.

**Рекомендация:** при обнаружении expiry удалять текущую запись и добавить
периодическую пакетную очистку `expiresAt < now()`. Покрыть тестом сохранение
активной и удаление истёкшей сессии.

### AUD-012 — P3 — In-memory rate limit maps не освобождают старые ключи

**Компонент:** webhook, mail-send и LLM rate limiting  
**Класс:** постепенная утечка памяти

Fixed-window maps перезаписывают истёкшее значение только при повторном запросе
того же ключа, но никогда не удаляют ключ, который больше не используется:

- `src/lib/webhooks/ratelimit.ts:23`;
- `src/lib/services/mail-actions.ts:51`;
- `src/lib/services/llm.ts:27`.

Удалённые workspace и ротированные токены остаются в памяти до рестарта. При
долгой работе и большом churn коллекции растут без верхней границы.

**Рекомендация:** периодически удалять expired entries и задать hard cap/LRU.
Проверить очистку фальшивыми таймерами. Реализацию server-metrics limiter,
которая уже выполняет eviction и ограничение размера, можно использовать как
локальный образец.

## 5. Риски зависимостей, не засчитанные как подтверждённые дефекты

### RISK-001 — BASELINE_FAIL — Три high advisory в production dependency tree

`pnpm audit --prod --json` сообщил:

| Пакет                | Путь                                            | Advisory                                     |
| -------------------- | ----------------------------------------------- | -------------------------------------------- |
| `immutable@3.8.3`    | `swagger-ui-react`                              | `GHSA-v56q-mh7h-f735`, `GHSA-xvcm-6775-5m9r` |
| `deepmerge-ts@7.1.5` | `@prisma/config`, `mailparser` → `html-to-text` | `GHSA-ggr8-5vv4-36mx`                        |

По текущему исходному коду Swagger получает статическую спецификацию, а
проверенные mail/config paths не доказали передачу атакующим рекурсивного графа
или управляющих структур, необходимых advisory. Поэтому это **UNVERIFIED
exposure**, а не подтверждённый эксплойт приложения.

Тем не менее dependency baseline красный. Следует обновить прямые зависимости
или применить безопасный lockfile override после проверки совместимости, затем
повторить unit, integration, build и `pnpm audit --prod`.

## 6. Положительные наблюдения

- Session secrets генерируются криптографически случайными; cookie использует
  `HttpOnly` и `SameSite`.
- OIDC flow использует state, nonce и PKCE.
- API/webhook secrets хранятся как SHA-256 hashes высокоэнтропийных токенов.
- Provider/mail credentials шифруются AES-256-GCM.
- Compound foreign keys поддерживают tenant isolation в ключевых моделях.
- Проверенные production raw SQL вызовы используют tagged Prisma templates, а
  не строковую конкатенацию.
- HTML-письма проходят DOMPurify; найденный дефект касается пассивных внешних
  ресурсов, а не подтверждённого script XSS.
- Backup decompression имеет ограничение распакованного объёма.
- Runtime Docker-образ запускается непривилегированным пользователем, а
  production compose не публикует порт PostgreSQL.
- GitHub Actions закреплены по commit SHA.
- Общий API response helper выставляет private/no-store caching policy.

## 7. Рекомендуемый порядок исправления

1. Остановить опасное upgrade-поведение и исправить перенос metrics tokens.
2. Закрыть unauthenticated Discord body exhaustion и добавить login throttling.
3. Ввести единую egress/SSRF-политику и owner-only управление интеграциями.
4. Ограничить IMAP sync и все multipart upload по фактическим байтам.
5. Исправить workspace/message races и блокировку remote mail content.
6. Добавить session/rate-map cleanup, обновить зависимости и восстановить E2E
   после очистки Docker address pools.

После исправлений обязательны повторные `typecheck`, `lint`, unit, integration,
production build, dependency audit и полный E2E прогон в изолированном тестовом
окружении.

## 8. Remediation appendix (2026-08-25)

| ID         | Статус        | Исправление |
| ---------- | ------------- | ----------- |
| `AUD-001`  | REMEDIATED    | Перед `migrate deploy` выполняется транзакционный idempotent preflight, переносящий legacy agent tokens без изменения опубликованной migration history. |
| `AUD-002`  | REMEDIATED    | Discord multipart читается потоково с фактическим byte/part/file limit; token и rate limit проверяются до чтения тела. |
| `AUD-003`  | REJECTED      | Private/LAN integrations и управление operational integrations участниками являются зафиксированными возможностями self-hosted продукта; trust boundary, RBAC и egress намеренно не изменены. |
| `AUD-004`  | REMEDIATED    | Local login использует атомарные PostgreSQL buckets по SHA-256 IP/username keys, trusted-proxy opt-in и политику новых паролей. |
| `AUD-005`  | REMEDIATED    | IMAP sync получает сообщения страницами, ограничивает raw/decoded body и сохраняет oversized mail как metadata-only. |
| `AUD-006`  | REMEDIATED    | Backup, contacts/photo и draft attachment uploads переведены с `request.formData()` на общий streaming multipart reader. |
| `AUD-007`  | REMEDIATED    | Внешние passive resources писем блокируются до явного действия пользователя и загружаются без referrer/autoplay. |
| `AUD-008`  | REMEDIATED    | Workspace create/delete сериализованы advisory lock по operator ID; delete-предикаты проверяются внутри транзакции. |
| `AUD-009`  | REMEDIATED    | Categories/channels получили normalized unique keys, canonical merge migration и race-safe get-or-create. |
| `AUD-010`  | REMEDIATED    | Slug создаётся bounded retry loop; повторяется только подтверждённый `Workspace.slug` conflict. |
| `AUD-011`  | REMEDIATED    | Expired session удаляется при чтении; создание новой session очищает истёкшие строки по индексированному полю. |
| `AUD-012`  | REMEDIATED    | Webhook/mail/LLM используют общий fixed-window limiter с sweep и hard cap 10 000 keys в независимых pools. |
| `RISK-001` | REMEDIATED    | Swagger UI, mailparser и Prisma обновлены; Prisma-only `deepmerge-ts` override ограничен версией 8.0.2. `pnpm audit --prod` возвращает 0 high/critical. |

Опубликованная `20260724100000_universal_api_tokens` не редактировалась. Новые
изменения схемы оформлены отдельной additive remediation migration.
