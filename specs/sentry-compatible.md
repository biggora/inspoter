# План совместимого с Sentry SDK приёма событий

> Статус: утверждённый план реализации. Код функции ещё не написан; документ не подтверждает готовность к production.

## 1. Решение и предпосылки

Inspoter принимает ошибки, сообщения и структурированные логи от официальных Sentry SDK и показывает их в существующем разделе «Логи». Граница арендатора остаётся прежней — `Workspace`. Внутри Workspace пользователь создаёт несколько универсальных `ObservabilityProject`: по одному на приложение, сервис или окружение, если такое разделение удобно команде.

`ObservabilityProject` не зависит от бренда входного протокола. Он владеет DSN, принятыми событиями, меткой и фильтром в «Логах»; позднее тот же стабильный идентификатор сможет владеть проектными дашбордами. Переименование проекта не меняет `ingestionProjectId` и DSN.

У проекта нет отдельного slug. Роутинг ingest использует стабильный непрозрачный `ingestionProjectId`, а UI показывает изменяемое `name`; третья идентичность не нужна.

### 1.1 Явные предпосылки

- MVP работает с современным endpoint `POST /api/{project_id}/envelope/`.
- Официальный публичный DSN-ключ идентифицирует канал приёма, но не считается секретом и не даёт права читать данные или управлять проектом.
- Один envelope содержит не более одного основного контейнера `event` или `log`; `client_report` может сопровождать его.
- Ответ `200` означает, что нормализованные данные уже записаны в PostgreSQL.
- Сервер хранит только ограниченный и очищенный канонический detail. Исходное тело запроса не сохраняется.
- Все значения envelope и event считаются недоверенными. Workspace и проект выводятся только из найденной учётной записи и проверенного path `project_id`.
- Текущие записи `LogEntry` остаются допустимыми без проекта: связь с `ObservabilityProject` nullable.

## 2. ADR: почему выбран этот дизайн

### 2.1 Проверенное текущее состояние

- `LogEntry` содержит только `workspaceId`, `level`, `source`, `message`, `timestamp` и `createdAt`; таблица уже индексирована для workspace-фильтров и keyset pagination (`prisma/schema.prisma:359-372`).
- `logsService.create` пишет строку, затем всегда публикует `LOG_CREATED` с полным `message` (`src/lib/services/logs.ts:67-86`). Новый ingest-путь не должен вызывать эту функцию.
- `logsService.list` ограничивает запрос `workspaceId`, связывает cursor с Workspace и сортирует по `(timestamp, id)` (`src/lib/services/logs.ts:89-131`).
- `GET /api/logs` получает Workspace из проверенной сессии и заголовка, а не из query (`src/app/api/logs/route.ts:7-34`; `src/lib/auth/dal.ts:118-152`).
- Клиентский DTO плоский (`src/components/logs/api.ts:11-29`), а таблица и раскрытая строка выводят `message` как React text (`src/components/logs/logs-view.tsx:295-345`).
- Текущий webhook pipeline уже показывает полезные приёмы: потоковый byte limit (`src/lib/webhooks/pipeline.ts:46-76`), hash-only credential (`src/lib/services/webhookTokens.ts:29-39`) и транзакционную защиту от конкурентного replay (`src/lib/webhooks/channelPipeline.ts:81-124`).

### 2.2 Рассмотренные варианты декомпозиции

**Вариант A — горизонтальные слои.** Сначала создать все модели, затем весь parser, затем API, затем UI. Такой порядок удобен владельцам отдельных слоёв, но долго не даёт исполнимого результата. Ошибка в DSN или framing обнаружится после нескольких крупных срезов.

**Вариант B — отдельная таблица событий и объединение двух источников в «Логах».** Структура чистая, но потребуется слияние `LogEntry` и событий с единым cursor, фильтрами и сортировкой. Это меняет проверенный список и повышает риск пропусков или дублей.

**Вариант C — вертикальные срезы и проекция в `LogEntry` (выбран).** Один ограниченный detail хранит структуру envelope; одна или несколько лёгких `LogEntry` дают существующему списку готовую проекцию. Каждая итерация проходит путь DSN → ingest → PostgreSQL → «Логи». Первый tracer bullet проверяет главную гипотезу до полной поддержки протокола.

## 3. Точная формулировка совместимости

Разрешённая формулировка:

> Inspoter поддерживает приём ошибок, `captureMessage` и структурированных логов от перечисленных и протестированных версий Sentry SDK через современный envelope endpoint.

Запрещено обещать полную совместимость с Sentry API или продуктом.

### 3.1 MVP

| Item type | Поведение |
| --- | --- |
| `event` | Принять исключение или `captureMessage`, нормализовать, очистить, записать один detail и один `LogEntry`. |
| `log` | Принять контейнер до 100 записей, записать один detail и по одной `LogEntry` на запись. |
| `client_report` | Проверить framing, не хранить как пользовательский лог, увеличить диагностический счётчик. |
| Любой иной тип | Вернуть `400` и `X-Sentry-Error`; ничего из envelope не записывать. |

### 3.2 Не входит в MVP

- полный Sentry API;
- устаревший `/api/{project_id}/store/`;
- OTLP;
- traces, transactions и spans;
- sessions и release health;
- replay, profiles и attachments;
- метрики;
- issue grouping и symbolication;
- sourcemap upload;
- алерты и автоматическое создание дашбордов.

Будущие дашборды смогут ссылаться на `ObservabilityProject.id`; план не добавляет их заранее.

## 4. Модель владения и DSN

Иерархия:

```text
Workspace
  └─ ObservabilityProject (0..N)
       ├─ ObservabilityCredential (1..N, ротация)
       ├─ SentryEnvelopeDetail (0..N)
       └─ LogEntry projection (0..N)
```

Для приложения, опубликованного в корне host, DSN имеет стандартную форму:

```text
https://PUBLIC_KEY@inspoter.example/opaque-project-id
```

SDK выводит endpoint:

```text
POST https://inspoter.example/api/opaque-project-id/envelope/
```

SDK сам добавляет `/api/{projectId}/envelope/`; поэтому DSN path не содержит `/api`. MVP поддерживает только публикацию приложения в корне host. Base-path deployment (`/inspoter` и аналогичные prefix) остаётся неподдержанным, пока отдельный end-to-end контракт не согласует DSN builder, Next.js base path и production proxy. Pinned Node/browser test обязан сравнить фактически отправленный root-host URL с ожидаемым посимвольно.

`ingestionProjectId` — ровно 32 криптографически случайных байта, закодированных как unpadded base64url. Результат всегда содержит ровно 43 символа и соответствует `^[A-Za-z0-9_-]{43}$`. Он не равен `Workspace.id`, slug, имени проекта или порядковому номеру. Переименование проекта его не меняет.

Один shared contract `src/lib/observability/ingestion-project-id.ts` экспортирует:

- `INGESTION_PROJECT_ID_PATTERN = /^[A-Za-z0-9_-]{43}$/`;
- `ingestionProjectIdSchema = z.string().regex(INGESTION_PROJECT_ID_PATTERN)`;
- `generateIngestionProjectId()`, использующий `crypto.randomBytes(32).toString("base64url")` и postcondition schema check;
- `isSentryEnvelopePath(pathname)`, который принимает только `/api/{valid-id}/envelope` и необязательный завершающий `/`.

DSN builder, route params, proxy matcher и tests импортируют этот модуль; локальные копии regex запрещены.

### 4.1 Аутентификация запроса

Поддерживаются стандартные источники:

- query: `sentry_version`, `sentry_key`, `sentry_client`;
- `X-Sentry-Auth`;
- DSN в заголовке envelope.

Если запрос передал несколько источников, все значения ключа и project ID должны совпасть. Envelope-header DSN может быть единственным источником, поэтому reader работает в две ограниченные стадии:

1. До чтения большого тела применить gateway limit и проверить `Content-Length`.
2. Потоково распаковать не более общего decompressed limit и прочитать только первую LF-terminated header line в отдельный буфер с лимитом 16 KiB.
3. Извлечь query auth, `X-Sentry-Auth` и DSN из первого header; потребовать совпадение всех переданных ключей и project ID.
4. Нормализовать публичный ключ, вычислить lookup hash и найти активный `ObservabilityCredential` со связанным проектом/Workspace.
5. Сравнить `params.projectId` с `ObservabilityProject.ingestionProjectId`; проверить `archivedAt`, operational kill switch `enabled`, срок действия credential и `revokedAt`.
6. Продолжить тем же bounded stream reader: разобрать оставшиеся item headers/payloads без повторной распаковки и записать envelope.

Тесты покрывают каждый источник отдельно, включая envelope-DSN-only, а также все попарные и тройные mismatch комбинации.

Поля `workspaceId`, `projectId`, `dsn` и любые теги внутри payload не выбирают authority. Несовпадение или неизвестный ключ даёт одинаковый `403` без раскрытия существования проекта.

### 4.2 Ротация и отзыв

- Генерировать 32 случайных байта и кодировать ключ в URL-safe форме.
- Хранить `publicKeyHash`, `publicKeyPrefix`, даты и статус; raw key вернуть только в созданном DSN.
- Разрешить два активных credential во время ротации; рекомендуемое окно — не более 24 часов.
- Отзыв действует на следующий lookup. Удалять строку не нужно: audit-сведения сохраняются без raw key.
- Создание проекта, ротация и отзыв credential доступны только OWNER Workspace через существующий owner gate.

### 4.3 Жизненный цикл, имена и management API

Роли зафиксированы: MEMBER и OWNER читают список проектов, исторические Logs и detail своего Workspace; только OWNER создаёт, переименовывает, архивирует, восстанавливает и удаляет проекты, а также ротирует и отзывает credentials. Все handlers сначала проверяют session и Workspace header. Они возвращают `401` без session, `403` для MEMBER на mutation и одинаковый `404` для отсутствующего или чужого project/credential. ID из path или body никогда не выбирает Workspace.

API сохраняет `name` после Unicode NFKC и trim, запрещает control characters и требует 1–80 Unicode code points. Регистр сохраняется для показа. В одном Workspace PostgreSQL functional unique index по `("workspaceId", lower("name"))` запрещает совпадения без учёта регистра среди активных и архивных проектов; `API`, `api` и ` Api ` конфликтуют с `409 PROJECT_NAME_CONFLICT`. После физического удаления имя можно использовать снова. Slug отсутствует в schema, DTO и routes.

Все management request bodies отклоняют неизвестные поля. Общий body limit — 16 KiB; `name` ограничен 80 символами, `allowedOrigins` — 20 уникальными origin по 2 048 символов, `pageSize` — диапазоном 1–100, cursor — 512 символами. Контракт routes:

| Метод и route | Доступ и payload | Успех | Ошибки состояния |
| --- | --- | --- | --- |
| `GET /api/observability/projects?state=all|active|archived&pageSize=...&cursor=...` | MEMBER/OWNER; default `state=all`, `pageSize=50` | `200` с bounded page, включая `archivedAt`, credential status и cascade counts | `400` для invalid query |
| `POST /api/observability/projects` | OWNER; `{name, allowedOrigins?}` | `201`; metadata и one-time DSN | `409 PROJECT_NAME_CONFLICT` |
| `PATCH /api/observability/projects/{id}` | OWNER; ровно `{name}` | `200` с обновлённым metadata | `409 PROJECT_NAME_CONFLICT` или `PROJECT_ARCHIVED` |
| `POST /api/observability/projects/{id}/archive` | OWNER; empty body | `200` с `archivedAt` | `409 PROJECT_ARCHIVED` при повторе |
| `POST /api/observability/projects/{id}/restore` | OWNER; empty body | `200` с `archivedAt=null` | `409 PROJECT_ACTIVE` при повторе |
| `DELETE /api/observability/projects/{id}` | OWNER; `{confirmName}` до 80 символов, точное case-sensitive совпадение с текущим `name` | `204` | `409 PROJECT_NAME_CONFIRMATION_MISMATCH` |
| `POST /api/observability/projects/{id}/credentials/rotate` | OWNER; `{overlapHours?: 0..24}`, default 24 | `201`; новый one-time DSN | `409 PROJECT_ARCHIVED` |
| `POST /api/observability/projects/{id}/credentials/{credentialId}/revoke` | OWNER; empty body; повтор идемпотентен | `204` | только общие `401/403/404` |

Архив — пользовательское обратимое состояние `archivedAt != NULL`. Ingest с корректным credential архивного проекта возвращает стабильный `410` и `X-Sentry-Error: Project archived`; Logs и detail остаются видимыми и фильтруемыми для MEMBER/OWNER. Архивный проект отклоняет rename, повторный archive и rotate с `409 PROJECT_ARCHIVED`, но разрешает restore, delete и credential revoke. Архивация не отзывает credentials, поэтому restore возобновляет ingest тем же DSN, если credential ещё активен.

`enabled=false` — отдельный operational kill switch без пользовательского management route. Он возвращает ingest `503`, не меняет `archivedAt`, не скрывает историю и не запрещает OWNER lifecycle operations. Если проект одновременно архивирован и выключен, route возвращает `410`. Restore не меняет `enabled`.

Delete необратим. Диалог показывает текущие числа credentials, details и project-linked `LogEntry`, явно называет эти cascade-удаления и legacy/null-project Logs, которые останутся. Кнопка активируется только после точного ввода текущего имени; API повторно проверяет `confirmName` внутри transaction перед cascade delete.

## 5. Точный план Prisma

Названия можно уточнить до миграции, но связи и ограничения обязательны.

### 5.1 `ObservabilityProject`

```prisma
model ObservabilityProject {
  id                 String   @id @default(cuid())
  workspaceId        String
  workspace          Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  ingestionProjectId String   @unique // 32 random bytes as unpadded base64url; exactly 43 chars
  name               String
  enabled            Boolean  @default(true)
  archivedAt         DateTime?
  allowedOrigins     String[] @default([])
  retentionDays      Int?
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  credentials ObservabilityCredential[]
  details     SentryEnvelopeDetail[]
  logs        LogEntry[]

  @@unique([id, workspaceId])
  @@index([workspaceId, createdAt, id])
  @@index([workspaceId, archivedAt, createdAt, id])
  @@index([workspaceId, enabled, archivedAt])
}
```

`name` служит изменяемой меткой UI; `ingestionProjectId` остаётся стабильным ключом для DSN и будущих dashboard relations. Archive меняет только `archivedAt`; operational kill switch меняет только `enabled`.

Prisma DSL не выражает нужные constraints, поэтому migration добавляет PostgreSQL `CHECK ("ingestionProjectId" ~ '^[A-Za-z0-9_-]{43}$')`, `CHECK (char_length("name") BETWEEN 1 AND 80 AND "name" = btrim("name"))` и unique index `ON "ObservabilityProject" ("workspaceId", lower("name"))`. Service применяет NFKC/trim и shared Zod schemas до insert; database constraints защищают import и ошибочные внутренние callers.

### 5.2 `ObservabilityCredential`

```prisma
model ObservabilityCredential {
  id            String   @id @default(cuid())
  workspaceId   String
  projectId     String
  project       ObservabilityProject @relation(fields: [projectId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  publicKeyHash String   @unique
  publicKeyPrefix String
  createdAt     DateTime @default(now())
  notBefore     DateTime @default(now())
  expiresAt     DateTime?
  revokedAt     DateTime?
  lastUsedAt    DateTime?

  @@unique([id, workspaceId])
  @@index([workspaceId, projectId, createdAt, id])
  @@index([projectId, revokedAt, expiresAt])
}
```

### 5.3 `SentryEnvelopeDetail`

```prisma
enum SentryItemType {
  EVENT
  LOG
}

model SentryEnvelopeDetail {
  id              String   @id @default(cuid())
  workspaceId     String
  workspace       Workspace @relation(fields: [workspaceId], references: [id], onDelete: Cascade)
  projectId       String
  project         ObservabilityProject @relation(fields: [projectId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
  itemType        SentryItemType
  sourceEventId   String?
  sdkName         String?
  sdkVersion      String?
  sentAt          DateTime?
  occurredAt      DateTime?
  receivedAt      DateTime @default(now())
  expiresAt       DateTime?
  sanitizedDetail Json
  detailBytes     Int
  logs            LogEntry[]

  @@unique([id, workspaceId])
  @@unique([projectId, sourceEventId])
  @@index([workspaceId, receivedAt, id])
  @@index([workspaceId, projectId, receivedAt, id])
  @@index([expiresAt, id])
}
```

Detail не хранит свободный `credentialId`: для tenant integrity он не нужен, а credential уже имеет `lastUsedAt`. Отзыв credential не меняет владение ранее принятых событий.

Nullable `sourceEventId` сохраняет несколько log batches без event ID: PostgreSQL допускает несколько `NULL` в unique index. Для `event` ID нормализуется в 32 lowercase hex.

### 5.4 Изменения `LogEntry`

Добавить:

```prisma
enum LogOrigin {
  LEGACY
  GENERIC_WEBHOOK
  SENTRY_EVENT
  SENTRY_LOG
}

origin          LogOrigin @default(LEGACY)
projectId       String?
project         ObservabilityProject? @relation(fields: [projectId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
sentryDetailId  String?
sentryDetail    SentryEnvelopeDetail? @relation(fields: [sentryDetailId, workspaceId], references: [id, workspaceId], onDelete: Cascade)
sentryRecordIndex Int?

@@unique([id, workspaceId])
@@unique([sentryDetailId, sentryRecordIndex])
@@index([workspaceId, projectId, timestamp, id])
@@index([workspaceId, origin, timestamp, id])
```

Старые строки получают `origin=LEGACY`, `projectId=NULL`, `sentryDetailId=NULL`. Миграция не переписывает сообщения и не создаёт фиктивный проект.

## 6. Файлы и ответственность

| Файл | Ответственность |
| --- | --- |
| `src/app/api/[projectId]/envelope/route.ts` | Тонкий публичный POST/OPTIONS handler, status/headers, вызов сервиса. |
| `src/lib/observability/ingestion-project-id.ts` | Единственный generator/Zod/regex/path contract для 43-char project ID. |
| `src/proxy.ts` | Импортирует shared `isSentryEnvelopePath`; sessionless-исключение действует только для POST/OPTIONS с валидным project ID. Остальные API сохраняют текущий auth proxy. |
| `src/lib/sentry/auth.ts` | Query/header/envelope auth parsing, согласование источников, credential lookup. |
| `src/lib/sentry/envelope.ts` | Потоковое распаковывание и byte-oriented framing. |
| `src/lib/sentry/normalize.ts` | Zod-схемы и нормализация `event`, `log`, `client_report`. |
| `src/lib/sentry/redaction.ts` | Рекурсивная очистка до любого persistence/logging. |
| `src/lib/services/observability-projects.ts` | Owner-scoped CRUD, DSN creation, rotation, revoke, kill switch. |
| `src/lib/services/sentry-ingestion.ts` | Quota, dedupe и одна Prisma transaction для detail + projections. |
| `src/app/api/observability/projects/route.ts` | MEMBER/OWNER list и OWNER create. |
| `src/app/api/observability/projects/[id]/route.ts` | OWNER rename/delete с name confirmation. |
| `src/app/api/observability/projects/[id]/archive/route.ts` и `restore/route.ts` | OWNER archive/restore. |
| `src/app/api/observability/projects/[id]/credentials/**` | OWNER rotate/revoke; revoke разрешён для archived project. |
| `src/app/api/logs/[id]/detail/route.ts` | Workspace-scoped lazy detail. |
| `src/lib/services/logs.ts` | Сохранить list contract; добавить project filter, page cap и detail lookup. |
| `src/components/logs/api.ts` | `projectId`, `projectName`, `origin`, `hasDetail`, `fetchLogDetail`. |
| `src/components/logs/logs-view.tsx` | Project filter и lazy detail без изменения cursor UX. |
| `src/components/logs/log-detail.tsx` | Доступный text-only вывод exception frames/context или log attributes. |
| `src/app/[locale]/(dashboard)/settings/observability/page.tsx` | Management page для MEMBER read и OWNER actions. |
| `src/components/settings/observability-projects-api.ts` | Typed DTO и вызовы точных management routes. |
| `src/components/settings/observability-projects-view.tsx` | Active/archived sections, role-aware actions и credential status. |
| `src/components/settings/observability-project-dialog.tsx` | Bounded create/rename form на существующем `Dialog`. |
| `src/components/settings/observability-credential-dialog.tsx` | Rotate/revoke и one-time DSN display. |
| `src/components/settings/delete-observability-project-dialog.tsx` | Cascade warning и exact-name confirmation на `AlertDialog`. |

Не добавлять business logic в route handlers и не использовать `any`, `@ts-ignore`, `@ts-expect-error`, широкие casts или ослабление конфигурации.

## 7. Envelope parser и HTTP contract

### 7.1 Framing

Parser работает с байтами:

```text
envelope-header-json + LF
item-header-json + LF
item-payload
```

- `length` означает количество байт, а не символов.
- С `length` payload может содержать LF; без `length` он заканчивается на LF или EOF.
- Последний LF необязателен.
- Неизвестные header attributes допускаются, но не сохраняются автоматически.
- Truncated payload, лишний основной item или несогласованный `item_count` дают `400` до записи.

### 7.2 Content type и compression

Допустить совместимые SDK варианты: `application/x-sentry-envelope`, отсутствие Content-Type, `text/plain`, `multipart/form-data`, `application/x-www-form-urlencoded`. Остальные типы дают `415`.

Поддержать `identity`, `gzip`, `deflate`, `br`, `zstd` только через потоковую распаковку с отдельным лимитом результата. Каждое кодирование получает fixture и runtime-тест Node 24; неподдержанное кодирование даёт `415`, не fallback.

### 7.3 Лимиты MVP

| Ресурс | Лимит по умолчанию |
| --- | ---: |
| Wire body | 1 MiB |
| Decompressed envelope | 2 MiB |
| Items в envelope | 10 |
| Основных `event`/`log` items | 1 |
| Event payload | 1 MiB |
| Записей в `log` container | 100 |
| Sanitized detail | 64 KiB |
| JSON depth | 8 |
| Общее число ключей | 1 000 |
| Tags | 50 |
| Breadcrumbs | 100 |
| Stack frames | 100 |
| Обычная строка | 4 KiB |
| Display message | 16 KiB |
| Project name | 80 символов |

Лимиты задаются валидируемыми env-переменными с безопасными default и верхними границами. Proxy ставит равный или меньший wire limit.

### 7.4 Ответы

| Состояние | Ответ |
| --- | --- |
| Принятый `event` | `200 application/json`, `{"id":"<event_id>"}` |
| Принятый `log` | `200 application/json`, `{}` |
| Replay известного event | `200` с прежним ID, без новой строки |
| Malformed/unsupported | `400` + короткий `X-Sentry-Error` |
| Invalid/mismatched auth | `403` |
| Архивный проект с valid credential | `410` + `X-Sentry-Error: Project archived` |
| Operational project/global kill switch | `503` |
| Oversize | `413` |
| Unsupported media/encoding | `415` |
| Quota | `429`, `Retry-After`, `X-Sentry-Rate-Limits` |
| Временная DB-недоступность | `503`, без ложного `200` |

Ответ не повторяет payload, DSN, ключ, stack trace или внутреннюю ошибку Prisma.

## 8. Redaction и privacy

Redaction выполняется после структурной проверки, но до database write, application log, metric label, outgoing hook и backup serialization.

По умолчанию удалить:

- `authorization`, `cookie`, `set-cookie`, `password`, `passwd`, `secret`, `token`, `api_key`, session identifiers;
- request body, form data, local variables и query values;
- email, username/name и raw IP пользователя;
- неизвестные глубокие context/extra ветви.

Оставить в ограниченном виде exception type/value, filenames, функции, line/column, message, level, logger, release, environment, tags, безопасные breadcrumbs, trace ID и типизированные log attributes. Серверная политика имеет приоритет над SDK `send_default_pii`.

Контрольные символы C0 нормализуются; LF/TAB допускаются только в ограниченных text fields. UI выводит данные через React interpolation, никогда через `dangerouslySetInnerHTML`.

## 9. Atomicity, dedupe и fan-out

`sentry-ingestion.ts` сначала разбирает и очищает весь envelope, затем выполняет одну transaction:

1. Проверяет/создаёт dedupe record через unique `(projectId, sourceEventId)` для `event`.
2. Создаёт один `SentryEnvelopeDetail`.
3. Создаёт одну summary `LogEntry` для `event` или N rows для `log`.
4. Обновляет `lastUsedAt` вне критического результата или в той же transaction без влияния на acknowledgement.

Новый сервис напрямую создаёт проекции и **не вызывает** `logsService.create`. Он не вызывает `emitWebhookEvent`, не создаёт `LOG_CREATED` и не создаёт `WebhookDelivery`.

Для log batches без стабильного event ID точная семантическая дедупликация невозможна. MVP принимает их at-least-once; OQ-04 решает, нужен ли короткий transport fingerprint без риска удалить легитимные одинаковые логи.

## 10. Retention, deletion и backup

Текущее binding-решение Q-10 запрещает automatic retention (`docs/prd.md:829-840`). В обязательной ветке MVP management API не принимает `retentionDays`, все новые/imported rows имеют `retentionDays=NULL` и `expiresAt=NULL`, приложение не регистрирует scheduler, а scheduled auto-delete count остаётся нулём. Clock-advance и restart tests доказывают ноль автоматических удалений. Expiry purge SLO в этой ветке имеет статус **N/A**.

Только новое binding-решение с конкретным Q-ID может открыть отдельную TTL-ветку. До его появления запрещено реализовывать или запускать scheduler. После такого решения план обновляют: API получает bounded `retentionDays`, `expiresAt = receivedAt + retentionDays`, scheduler удаляет только ненулевые `expiresAt` по `(expiresAt,id)` пакетами по 500, cascade удаляет связанные `LogEntry`, а batch/race/restart tests и 24-hour purge SLO становятся обязательными. Payload timestamp никогда не определяет expiry.

- Удаление проекта каскадно удаляет credentials, details и его log projections, но не затрагивает legacy/null-project logs.
- Удаление Workspace сохраняет существующую каскадную модель.
- Backup `logs` экспортирует summary и очищенный detail только при явном включении logs. Raw body не существует.
- Backup исключает credential hashes. Import в одной transaction генерирует новые `ObservabilityProject.id` и `ingestionProjectId`, remap-ит detail/log IDs и relations, оставляет все проекты `enabled=false` и требует новый DSN.
- Merge/replace import никогда не восстанавливает старый глобально уникальный ingest ID. Export/import получает тесты на remap, nullable legacy rows, размеры, forced collision и redaction canary.

## 11. Proxy, CORS, IP и rate limits

Repository не содержит проверенной production proxy-конфигурации. До production gateway должен:

- завершать TLS;
- ограничивать wire bytes, скорость чтения, concurrent connections и request timeout;
- удалять клиентские `X-Forwarded-*`, затем добавлять один доверенный client IP;
- не писать query `sentry_key`, auth headers или DSN в access logs/telemetry;
- передавать Content-Encoding без неограниченной скрытой распаковки;
- ограничивать CPU/memory/PIDs app container.

Public key остаётся публичным идентификатором. CORS allowlist снижает browser abuse, но не заменяет auth: небраузерный клиент может подделать `Origin`.

- Пустой `allowedOrigins` означает unrestricted browser ingestion: POST отвечает `Access-Control-Allow-Origin: *`; `Access-Control-Allow-Credentials` отсутствует.
- Непустой allowlist отражает только точное совпадение scheme/host/port и добавляет `Vary: Origin`; запрещённый Origin получает `403` без allow-origin header.
- Запрос без `Origin` считается server SDK request и допускается независимо от browser allowlist.
- OPTIONS отвечает `204`, `Access-Control-Allow-Methods: POST, OPTIONS`, `Access-Control-Allow-Headers: Content-Type, X-Sentry-Auth, Content-Encoding`, `Access-Control-Max-Age: 600` и тем же allow-origin решением.

Pinned cross-origin browser tests подтверждают POST/OPTIONS headers, query auth без неожиданного preflight и header auth с ожидаемым preflight.

Глобальные `ingestionProjectId` и `publicKeyHash` создаются с максимум пятью попытками. Каждая попытка project ID вызывает только shared `generateIngestionProjectId()`; строка проверяется общей schema до insert. Сервис повторяет генерацию только при Prisma `P2002` на соответствующем unique constraint; любая другая ошибка сразу пробрасывается. После пяти коллизий операция завершается generic `503`, увеличивает bounded collision metric и не возвращает частично созданный проект/credential.

Начальные квоты:

- до credential lookup: 60 requests/min и 10 MiB/min на доверенный IP, burst 20;
- после lookup: 120 requests/min и 64 MiB/min на project;
- на Workspace: 10 000 принятых событий или 512 MiB в сутки.

Нужны shared counters до multi-replica rollout. Текущий in-process limiter сбрасывается при рестарте и годится только для ограниченного single-instance canary.

## 12. Изменения раздела «Логи»

### 12.1 List API

Сохранить текущие level/source/query/sort/cursor semantics. Добавить необязательный `projectId` и ограничить `pageSize` диапазоном 1–100: сейчас route принимает любое положительное конечное число (`src/app/api/logs/route.ts:19-27`), а service передаёт его в Prisma `take` (`src/lib/services/logs.ts:93-126`).

List DTO добавляет только:

- `projectId: string | null`;
- `projectName: string | null`;
- `origin`;
- `hasDetail`.

`sanitizedDetail` в list response не входит. Cursor остаётся привязан к Workspace; project filter входит в client filter key, но не даёт authority.

### 12.2 Lazy detail

`GET /api/logs/{id}/detail` сначала вызывает `requireAuthWithWorkspaceHeader`, затем ищет `LogEntry` по `id + workspaceId` и следует только по composite relation. Чужой и отсутствующий ID возвращают одинаковый `404`.

Раскрытие Sentry row лениво загружает exception frames/context или конкретную запись log batch по `sentryRecordIndex`. Legacy row сохраняет нынешнее раскрытие message.

### 12.3 UI, accessibility и i18n

- Добавить project filter в существующий `FilterBar`.
- Показывать active и archived проекты в filter; архивный badge не скрывает исторические строки.
- Показать project badge/label без изменения текущих level/source/message колонок.
- Сохранить кнопку с `aria-expanded` и `aria-controls`; во время lazy load использовать `aria-busy` и доступный loading text.
- После ошибки оставить строку раскрытой и дать кнопку повторить запрос.
- Не переносить фокус при раскрытии; keyboard activation работает через существующий `Button`.
- Все labels, ошибки и empty states добавить в `src/messages/en/logs.json` и `src/messages/ru/logs.json`; внешние protocol errors остаются стабильными английскими machine messages.

## 13. Вертикальные срезы

Каждый срез начинается только после PASS предыдущего. При FAIL команда откатывает срез или выключает feature flag; она не объявляет DONE без свежих evidence-файлов.

### Slice 0 — контракт, fixtures и migration safety

**Вход:** OQ-02 и OQ-03 закрыты; роли уже зафиксированы как MEMBER read/OWNER mutate; Q-10 фиксирует TTL-disabled ветку; disposable PostgreSQL доступен.

**Задачи:**

- добавить enums/models/FKs/indexes и nullable поля `LogEntry`;
- добавить `Workspace.observabilityProjects` и необходимые обратные relations;
- добавить `archivedAt`, name constraints и case-insensitive workspace index; оставить `retentionDays/expiresAt=NULL` и scheduler незарегистрированным по Q-10;
- для новых записей существующего typed webhook пути явно ставить `origin=GENERIC_WEBHOOK`, сохранив исторические строки как `LEGACY`;
- создать protocol fixtures: valid event, log batch, client report, malformed, unsupported, oversize;
- зафиксировать env schema и global kill switch `SENTRY_INGEST_ENABLED=false` по умолчанию.

**Тесты:** `prisma validate`, migration deploy на пустую и baseline DB, rollback rehearsal через восстановление disposable snapshot, composite-FK negatives, NFKC/trim/case-conflict names, nullable retention, disabled scheduler registration, `observabilityProjects` relation, исторический `LEGACY` и новый `GENERIC_WEBHOOK`.

**DoD:** миграция применима; старые Logs tests проходят; feature выключена; только nullable/default-safe изменения влияют на существующие строки.

**Rollback:** выключенный код не читает новые таблицы; rollback — вернуть предыдущий образ и восстановить snapshot до миграции, если downgrade SQL заранее доказан небезопасным.

**Evidence:** SHA, migration SQL, stdout/stderr/exit code, schema diff, PostgreSQL version, UTC timestamps.

### Slice 1 — tracer bullet `captureMessage`

**Вход:** Slice 0 PASS; pin точной версии `@sentry/node` без `^`/`~`.

**Задачи:**

- owner создаёт один `ObservabilityProject` и получает DSN;
- реализовать query auth, identity envelope parser только для проверенного `event` fixture;
- добавить shared project-ID contract; route валидирует params до credential lookup, а `src/proxy.ts` использует shared `isSentryEnvelopePath` для sessionless POST/OPTIONS exemption;
- реализовать bounded first-header stage для envelope-DSN-only auth;
- нормализовать и очистить `captureMessage`;
- одной transaction создать detail + project-linked `LogEntry`;
- показать summary в существующем list и detail через lazy endpoint;
- включить route только для тестового Workspace allowlist.

**Тесты:** 10 000 generated IDs всегда имеют длину 43, проходят shared schema и используют только base64url alphabet; invalid length/alphabet отклоняются route до credential lookup и не получают proxy exemption. Реальный pinned `@sentry/node` `captureMessage` + `flush` использует сгенерированный DSN, достигает envelope handler без session и посимвольно совпадает с root-host URL; base-path DSN не рекламируется и не входит в suite. Проверить query/header/envelope-only auth и mismatches; повтор event ID; foreign project/path/key; HTML/control chars; list/detail. Создать активную `LOG_CREATED` subscription, поставить spy на `emitWebhookEvent`, затем проверить `not.toHaveBeenCalled()` и delta `WebhookDelivery = 0`. Отдельно доказать, что `/api/logs` и management API без session по-прежнему требуют session authentication.

**DoD:** сообщение видно с project label; replay оставляет одну пару; чужой tenant получает `403/404`; database и outgoing queue не содержат raw secret/PII; при существующей matching subscription `emitWebhookEvent` не вызван и `WebhookDelivery` delta = 0.

**Rollback:** `SENTRY_INGEST_ENABLED=false`; удалить только tracer fixture data по известным project/detail IDs.

**Evidence:** pinned package/lockfile version, sanitized request metadata, row IDs/counts, screenshots list/detail, DB assertions, zero-delivery assertion.

### Slice 2 — полноценный `event`

**Вход:** tracer bullet PASS.

**Задачи:** exception message/stack/context/tags/breadcrumbs, header auth и envelope DSN, event ID normalization, generic errors, all limits, streaming compression.

**Тесты:** framing corpus, UTF-8 byte length, embedded LF, missing final LF, truncated item, dashed ID, gzip/deflate/br/zstd, decompression bomb, depth/key/string boundaries, concurrent replay.

**DoD:** все fixtures дают ожидаемый status; любой reject создаёт ноль rows; 100 concurrent replays дают одну пару; память и latency остаются в утверждённых пределах.

**Rollback:** project-level `enabled=false`; identity-only parser flag для диагностики, но не production fallback.

**Evidence:** fixture manifest, property/fuzz seed corpus, peak RSS, duration histogram, SQL counts.

### Slice 3 — structured `log` и `client_report`

**Вход:** event contract PASS; выбрана pinned SDK версия с logger API.

**Задачи:** проверить `item_count`/media type, нормализовать до 100 typed log records, создать N projections, безопасно игнорировать/count `client_report`.

**Тесты:** pinned Node logger info/error, boundary 1/100/101, invalid typed attributes, mixed event+log, client report отдельно/вместе, transaction rollback на невалидной записи N.

**DoD:** batch N даёт один detail и N project-linked logs; 101 и mixed unsupported дают `400` и ноль rows; client report не появляется в UI.

**Rollback:** category flag отключает `log`, сохраняя проверенный `event`.

**Evidence:** SDK envelope capture, row counts, response headers, diagnostic metric snapshot.

### Slice 4 — Logs UX и project management

**Вход:** backend list/detail contract стабилен.

**Задачи:** создать `settings/observability` page и именованные components из раздела 6; реализовать точные list/create/rename/archive/restore/delete/rotate/revoke routes; показать MEMBER read-only view и OWNER actions; добавить active/archived project filter/badge, lazy exception/log detail, page cap 100 и RU/EN strings.

**Тесты:** `tests/unit/api/observability-projects.test.ts`, `tests/unit/services/observability-projects.test.ts` и `tests/unit/ui/observability-projects-view.test.tsx` проверяют payload limits, trim/case conflict, all statuses, MEMBER read/OWNER mutations, foreign `404`, archive `410`, archived mutation matrix, kill-switch `503`, restore без enable, rotate overlap/revoke и exact-name cascade delete. `e2e/sentry-compatible.spec.ts` проверяет management flow, archived Logs filter, keyboard/focus/ARIA и Axe desktop/mobile.

**DoD:** все восемь routes соответствуют таблице 4.3; MEMBER читает, но не видит активных mutation controls; OWNER проходит полный lifecycle; archive сохраняет читаемые Logs; delete удаляет только названный cascade; project filter не пересекает Workspace; секретный материал не остаётся после закрытия one-time DSN dialog; обе локали полны.

**Rollback:** скрыть management и detail UI feature flags; flat list продолжает работать.

**Evidence:** targeted Vitest, Playwright/Axe reports, desktop/mobile screenshots, localization key check.

### Slice 5 — lifecycle, quotas и operations

**Вход:** функциональные срезы PASS; proxy owner определён; Q-10 остаётся binding-решением, если документ не ссылается на более новый конкретный Q-ID.

**Задачи:** по текущей Q-10 ветке не регистрировать scheduler и сохранять `retentionDays/expiresAt=NULL`; реализовать backup/import с ID remap и `enabled=false`, bounded P2002 regeneration, shared quota counters или доказанный single-instance gate, gateway rules, trusted IP, CORS POST/OPTIONS, metrics/alerts и project/workspace cleanup. TTL-задачи входят в срез только после обновления плана новым binding Q-ID.

**Тесты:** Q-10 branch доказывает `retentionDays/expiresAt=NULL`, отсутствие scheduler job/registration и zero auto deletion после clock advance/restart. Проверить exact-name project delete cascade и сохранение legacy/null-project Logs; merge/replace backup round-trip и canaries; forced `ingestionProjectId`/key-hash collisions; exact CORS headers и pinned cross-origin browser; invalid-key flood; 429 headers; restart/multi-instance behavior; DB outage 503; SDK backoff observation. Только будущая Q-ID ветка добавляет expiry batch/race/restart и 24-hour purge tests.

**DoD:** при Q-10 expiry SLO отмечен N/A, все expiry fields равны NULL, scheduler отсутствует и auto-delete count равен 0; при будущем Q-ID вместо этого обязателен PASS 24-hour purge SLO. В обеих ветках proxy redaction доказана реальными access logs, quota не обходится сменой credential внутри Workspace, а cleanup не оставляет orphan rows.

**Rollback:** global kill switch; gateway route deny; scheduler можно остановить без потери непросроченных данных.

**Evidence:** redacted access-log fixture, load report, DB/table/index size, backup scan, cleanup queries.

### Slice 6 — pinned SDK conformance и canary rollout

**Вход:** pre-canary gates 1–8 PASS; canary-dependent SLO/final-approval gates явно остаются BLOCKED и закрываются только свежими результатами этого среза.

**Задачи:** закрепить точные версии Node и browser SDK в отдельном fixture workspace; выполнить exception, captureMessage и logger flows; canary на одном Workspace; расширять allowlist ступенями.

**Тесты:** Node exception/message/log; реальный browser error/message/log через Playwright; query auth/CORS/CSP; flush; 400/403/413/429/503; rotation во время отправки.

**DoD:** compatibility matrix содержит точные SDK/package/runtime/browser versions и PASS для каждой рекламируемой функции. 24-часовой canary при Q-10 подтверждает NULL expiry, отсутствие scheduler и zero auto deletion; purge SLO остаётся N/A. Если план ссылается на новый TTL Q-ID, тот же canary также закрывает 24-hour purge SLO. Свежие evidence закрывают final production approval.

**Rollback:** снять Workspace allowlist или global flag; SDK продолжает локальный fail-safe согласно настройке приложения.

**Evidence:** lockfile, SDK debug logs без payload/DSN, network traces с redaction, UI assertions, 24-hour metrics export.

## 14. Исполнимая матрица проверок

Все команды запускаются из корня repository. Каждый шаг пишет UTC start/end, SHA, tool versions, stdout, stderr и exit code в отдельный файл под `artifacts/sentry-compatible/<UTC-run-id>/`. Exit code, отличный от нуля, запрещает DONE. `test:db:down` выполняется в `finally`, а результат cleanup сохраняется отдельно.

| Gate | Точная команда | Назначение и обязательный artifact |
| --- | --- | --- |
| Run metadata | `Get-Date -AsUTC -Format o`; `git rev-parse HEAD`; `node --version`; `pnpm --version` | `00-metadata.txt`; не включать env values. |
| Plan format | `pnpm exec prettier --check specs/sentry-compatible.md` | `01-plan-format.log`. |
| Prisma schema | `pnpm exec prisma validate` | `02-prisma-validate.log`. |
| Fast lint | `pnpm lint` | `03-lint.log`; baseline failure отмечается отдельно, не скрывается. |
| TypeScript | `pnpm typecheck` | `04-typecheck.log`. |
| Focused unit | `pnpm exec vitest run tests/unit/sentry tests/unit/api/sentry-envelope.test.ts tests/unit/api/observability-projects.test.ts tests/unit/ui/sentry-logs.test.tsx tests/unit/ui/observability-projects-view.test.tsx` | Parser/auth/redaction/routes/lifecycle/UI без внешней DB; `05-unit.log`. |
| DB guard | `pnpm run test:db:guard` | Доказать disposable target; `06-db-guard.log`. |
| DB start | `pnpm run test:db:up` | Поднять только test PostgreSQL; `07-db-up.log`. |
| DB prepare | `pnpm run test:db:prepare` | Подготовить schema/seed по repository contract; `08-db-prepare.log`. |
| Migration | `pnpm run test:db:migrate` | Отдельно доказать migration deploy; `09-db-migrate.log` и SQL/schema snapshot. |
| Focused DB | `pnpm exec vitest run tests/unit/services/sentry-ingestion.test.ts tests/unit/services/observability-projects.test.ts tests/unit/integration/sentry-workspace-isolation.test.ts tests/unit/services/backup-sentry.test.ts` | Atomicity, FK, replay, lifecycle cascade, retention branch, backup/remap; `10-db-focused.log`. |
| Pinned Node/browser smoke | `pnpm run test:sentry-sdk` | Новый script вызывает exact-version fixture без range; `11-sdk-smoke.log` и redacted network capture. |
| Focused Playwright | `pnpm exec playwright test e2e/sentry-compatible.spec.ts` | Browser DSN URL, CORS, Logs UI, Axe; `12-playwright.log`, report и screenshots. |
| Full CI | `pnpm test:ci` | Repository-wide regression; `13-test-ci.log`. |
| DB cleanup | `pnpm run test:db:down` | Всегда выполнить; `99-db-down.log`, проверка отсутствия owned containers/ports. |

Для нового `test:sentry-sdk` добавить script, который запускает `tests/fixtures/sentry-sdk/smoke.mjs`. Fixture `package.json` и lockfile закрепляют точные `@sentry/node` и `@sentry/browser` версии без `^`/`~`. Команда падает, если emitted URL, response semantics, persisted counts или zero-fan-out assertion не совпали.

## 15. Метрики и SLO

### 15.1 SLO

- 99,9% месячной доступности endpoint без учёта корректных `4xx/429`.
- p95 acknowledgement < 250 ms, p99 < 750 ms при допустимой нагрузке.
- 100% ответов `200` соответствуют committed detail/projection или подтверждённому replay.
- 0 cross-workspace/project rows.
- 0 попаданий redaction canary в storage/logs/metrics/backup/outgoing webhooks.
- Duplicate committed-event rate < 0,01% для событий с event ID.
- При действующем Q-10 expiry purge SLO имеет статус **N/A**; инвариант MVP — `retentionDays/expiresAt=NULL`, scheduler не зарегистрирован, auto-delete count = 0.
- Только новый binding Q-ID заменяет N/A на SLO: 99% просроченных details удалены в течение 24 часов.

### 15.2 Метрики

- requests/accepted/rejected по endpoint, item type и ограниченному reason enum;
- wire/decompressed/detail bytes histograms;
- parse/redaction/transaction latency;
- duplicate, client_report, rate-limit и unsupported counters;
- DB pool saturation, transaction errors и table/index bytes; при Q-10 — scheduler registration/auto-delete count = 0, при будущем TTL Q-ID — retention backlog;
- invalid credential ratio и gateway rejects;
- accepted events и bytes по quota state.

Не использовать event ID, message, source, URL, user, release, public key или raw project/workspace ID как metric labels. Для per-project диагностики использовать bounded database/admin view, а не высококардинальные time-series labels.

## 16. Риски и открытые вопросы

| ID | Вопрос/риск | Решение до какого среза |
| --- | --- | --- |
| OQ-02 | Какие exact версии `@sentry/node` и `@sentry/browser` рекламируются | До Slice 1; версии фиксируются после установки без range. |
| OQ-03 | Production proxy и владелец его конфигурации | До Slice 0; без владельца production BLOCKED. |
| OQ-04 | Dedupe log batches без event ID | До Slice 3; default at-least-once. |
| OQ-05 | Нужен ли project filter в URL для shareable view | До Slice 4; default client state, без изменения authority. |
| OQ-06 | Должен ли backup включать sanitized detail по умолчанию | До Slice 5; рекомендуемый default — включать только при выбранной секции Logs. |
| OQ-07 | Single instance или shared limiter | До Slice 5; multi-replica запрещён без shared counters. |
| OQ-08 | CSP `connect-src` документация для browser SDK | До Slice 6. |

Авторизация и retention больше не открытые вопросы: MEMBER читает, OWNER управляет; Q-10 запрещает TTL до нового binding Q-ID. Главные риски: публичный DSN допускает forged events; payload содержит PII/секреты; compression/parser создают DoS-поверхность; detail увеличивает backup/storage; неверные ответы SDK могут скрыть потерю; project deletion массово удаляет данные. Квоты, redaction, ограниченный parser, owner audit, reversible archive, operational kill switch и stop gates снижают эти риски.

## 17. Production stop gates

Статус production — **BLOCKED**. Gates разделены, чтобы canary не зависел от собственного результата.

### 17.1 Pre-canary admission

Перед Slice 6 gates 1–8 должны иметь свежий PASS:

1. **Schema gate:** composite tenant FKs, cascade, unique replay и migration rehearsal.
2. **Protocol gate:** pinned SDK envelope fixtures, framing/compression/limit corpus.
3. **Authority gate:** credential → project → Workspace; MEMBER read и OWNER lifecycle/credential mutations доказаны; payload никогда не выбирает tenant.
4. **Privacy gate:** canary отсутствует во всех storage и observability sinks.
5. **Fan-out gate:** каждый ingest test доказывает zero `LOG_CREATED`/`WebhookDelivery`.
6. **Abuse gate:** gateway pre-auth и shared/project/workspace quotas выдерживают invalid-key flood.
7. **Lifecycle gate:** archive/restore, exact-name project/workspace delete и backup/import доказаны. При Q-10 gate требует NULL expiry, отсутствующий scheduler и zero auto deletion; только новый binding Q-ID заменяет эти criteria на expiry batch/race и PASS 24-hour purge SLO.
8. **UI/rollback gate:** legacy Logs, project filter, lazy detail, RU/EN, keyboard и Axe PASS; global/project/category kill switches и gateway deny проверены.

### 17.2 Final production approval

На входе в Slice 6 эти gates остаются BLOCKED:

9. **Canary/SLO gate:** load и завершённый 24-hour canary укладываются в latency/error/storage бюджеты; Q-10 canary доказывает disabled-retention invariants, а будущая TTL-ветка также доказывает purge SLO.
10. **Final compatibility gate:** опубликованная matrix содержит только точные SDK/runtime/browser версии, прошедшие canary, privacy и rollback checks.

Только свежие artifacts Slice 6 переводят gates 9–10 в PASS и снимают общий production BLOCKED.

## 18. Исполнимый чек-лист

- [ ] Закрыть OQ-02 и OQ-03; применить зафиксированные MEMBER read/OWNER mutate и Q-10 TTL-disabled contracts.
- [ ] Создать feature flags и оставить global ingest выключенным.
- [ ] Добавить Prisma models, composite relations, indexes и migration.
- [ ] Доказать migration/rollback на disposable PostgreSQL.
- [ ] Добавить hash-only credential lifecycle и one-time DSN.
- [ ] Реализовать no-slug project schema: NFKC/trim display name, case-insensitive Workspace uniqueness, `archivedAt` и отдельный operational `enabled`.
- [ ] Добавить единый 32-byte/unpadded-base64url project-ID module, Zod schema и PostgreSQL CHECK.
- [ ] Проверить bounded P2002 regeneration для ingest ID и key hash.
- [ ] Подключить shared path contract к route, root-host DSN builder и envelope POST/OPTIONS proxy exemption.
- [ ] Доказать, что invalid IDs не достигают lookup, а Logs/management остаются session-authenticated.
- [ ] Реализовать standard query/header/envelope auth agreement.
- [ ] Реализовать bounded first-header auth stage без двойной распаковки.
- [ ] Реализовать byte-oriented bounded parser и compression caps.
- [ ] Реализовать strict `event`/`log`/`client_report` matrix.
- [ ] Реализовать server-side redaction до persistence.
- [ ] Реализовать atomic detail + project-linked `LogEntry` projections.
- [ ] Доказать replay uniqueness и zero outgoing webhook delivery.
- [ ] Доказать zero fan-out при активной matching `LOG_CREATED` subscription и spy на emitter.
- [ ] Добавить project filter, page cap и workspace-scoped lazy detail.
- [ ] Реализовать восемь management routes, MEMBER read-only page и OWNER create/rename/archive/restore/delete/rotate/revoke controls.
- [ ] Доказать archive `410`, archived mutation matrix, restore без enable и exact-name cascade delete с сохранением legacy/null-project Logs.
- [ ] Добавить RU/EN, keyboard, focus, ARIA и Axe tests.
- [ ] По Q-10 доказать `retentionDays/expiresAt=NULL`, отсутствие scheduler и zero auto deletion; отметить expiry purge SLO N/A.
- [ ] Не включать TTL branch без нового binding Q-ID; если он появится, обновить план и доказать batch/race/restart плюс 24-hour purge SLO.
- [ ] Доказать cascade и backup/import policy; import remap-ит IDs и оставляет проекты `enabled=false`.
- [ ] Установить gateway limits, trusted IP и access-log redaction.
- [ ] Проверить exact CORS POST/OPTIONS semantics для empty/non-empty allowlist.
- [ ] Добавить bounded metrics, SLO dashboards и alerts.
- [ ] Pin exact Node/browser SDK fixture versions и выполнить conformance suite.
- [ ] Провести 24-hour single-Workspace canary; по Q-10 сохранить disabled-retention evidence, по будущему TTL Q-ID добавить purge evidence.
- [ ] Обновить compatibility matrix и пользовательскую документацию только по фактическим PASS.
- [ ] Снять production BLOCKED только после десяти stop gates.

## 19. Официальные протокольные ссылки

- [DSN и аутентификация](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/transport/authentication.mdx)
- [Envelope format](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/envelopes/index.mdx)
- [Envelope item types](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/envelopes/envelope-items.mdx)
- [Event payload](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/envelopes/event-payloads/index.mdx)
- [Structured logs protocol](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/telemetry/logs.mdx)
- [Transport responses](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/transport/index.mdx)
- [Rate limiting](https://develop.sentry.dev/sdk/rate-limiting/)
- [Transport compression](https://github.com/getsentry/sentry-docs/blob/master/develop-docs/sdk/foundations/transport/compression.mdx)
- [JavaScript SDK endpoint construction](https://github.com/getsentry/sentry-javascript/blob/develop/packages/core/src/api.ts)

Эти ссылки задают wire contract. Реальная совместимость определяется только pinned SDK tests и опубликованной compatibility matrix.
