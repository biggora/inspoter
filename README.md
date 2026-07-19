# Inspoter

Inspoter — self-hosted панель оператора для управления личной инфраструктурой: закладки, домены и DNS-записи, VPS-серверы, почта, сообщения, логи и оповещения в одном приложении на Next.js + PostgreSQL.

Панель поддерживает **workspaces** (рабочие пространства) — один деплой может обслуживать несколько небольших команд или проектов. Интеграции с провайдерами (Cloudflare, Hetzner, GoDaddy) подключаются через интерфейс: ключи API добавляются в разделе настроек «Провайдеры» и хранятся в БД в зашифрованном виде. Без подключённых провайдеров разделы доменов и серверов пусты.

## Стек

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS v4** + **shadcn/ui**
- **Prisma 7** + **PostgreSQL 16**
- **Vitest** (unit) + **Playwright** (e2e)

## Быстрый старт

Предварительные требования: **Docker**, **Node.js 24+**, **pnpm** (версия закреплена в `package.json` → `packageManager`, устанавливается автоматически через Corepack: `corepack enable`).

```bash
# 1. Клонировать репозиторий и перейти в директорию
git clone <repo-url> inspoter
cd inspoter

# 2. Скопировать env-контракт и заполнить обязательные значения
cp .env.example .env
# отредактировать .env: как минимум DATABASE_URL, OPERATOR_USERNAME, OPERATOR_PASSWORD

# 3. Поднять PostgreSQL
docker compose up -d db

# 4. Установить зависимости, прогнать миграции, засеять оператора
pnpm install
pnpm db:migrate
pnpm db:seed

# 5. Собрать и запустить приложение
pnpm build
pnpm start
```

Открыть [http://localhost:3800](http://localhost:3800) и авторизоваться под `OPERATOR_USERNAME` / `OPERATOR_PASSWORD`, указанными в `.env`.

> Для локальной разработки с hot-reload вместо шагов 5 используйте `pnpm dev` — сервер поднимется на [http://localhost:3800](http://localhost:3800).

### Полностью через Docker

`docker-compose.yml` также описывает сервис `app`, собираемый из `Dockerfile` (миграции применяются автоматически при старте контейнера, порт проброшен на `3800`):

```bash
docker compose up -d --build
```

После первого поднятия оператора всё равно нужно засеять вручную (контейнер не запускает `db:seed` сам):

```bash
docker compose exec app pnpm db:seed
```

## Переменные окружения

Полный и всегда актуальный контракт — в [`.env.example`](.env.example). Основные переменные:

| Переменная                  | Обязательна           | Описание                                                                                                                                                                                                                                           |
| --------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`              | да                    | Строка подключения к PostgreSQL. Локально при использовании `docker compose up -d db` — `postgresql://postgres:postgres@localhost:3832/inspot?schema=public` (порт `3832` — хостовый маппинг compose, внутри compose-сети используется `db:5432`). |
| `OPERATOR_USERNAME`         | да                    | Логин единственного env-seeded оператора.                                                                                                                                                                                                          |
| `OPERATOR_PASSWORD_HASH`    | одно из двух          | Заранее посчитанный scrypt-хеш пароля (`salt:hash`), используется как есть. Приоритетнее `OPERATOR_PASSWORD`, если заданы оба.                                                                                                                     |
| `OPERATOR_PASSWORD`         | одно из двух          | Пароль в открытом виде (только для разработки) — хешируется в памяти при старте.                                                                                                                                                                   |
| `LIST_PAGE_SIZE`            | нет (default `50`)    | Размер страницы для keyset-пагинации в списках (Mail/Logs/Alerts/Messages).                                                                                                                                                                        |
| `WEBHOOK_RATE_LIMIT`        | нет (default `120`)   | Лимит запросов на токен webhook-приёма за окно `WEBHOOK_RATE_WINDOW_MS`.                                                                                                                                                                           |
| `WEBHOOK_RATE_WINDOW_MS`    | нет (default `60000`) | Размер окна rate-limit в миллисекундах.                                                                                                                                                                                                            |
| `WEBHOOK_MAX_BODY_BYTES`    | нет (default `65536`) | Максимальный размер тела webhook-запроса в байтах.                                                                                                                                                                                                 |
| `CREDENTIAL_ENCRYPTION_KEY` | для провайдеров       | 64-символьный hex-ключ (32 байта) для шифрования ключей провайдеров в БД. Обязателен, чтобы добавлять провайдеров в настройках.                                                                                                                    |

## Демо-данные

Чтобы наполнить все разделы (закладки, домены, серверы, почта, сообщения, логи, оповещения) репрезентативными демо-данными:

```bash
pnpm db:seed:demo
```

## Подключение провайдеров

Провайдеры (Cloudflare, Hetzner DNS, Hetzner Cloud, GoDaddy) подключаются исключительно через интерфейс: раздел **Настройки → Провайдеры** (`/settings/providers`). Ключи API шифруются (AES-256-GCM, ключ — `CREDENTIAL_ENCRYPTION_KEY`) и хранятся в БД для текущего workspace. Переменные окружения для ключей провайдеров не используются; без подключённых провайдеров разделы «Домены» и «Серверы» показывают пустое состояние с подсказкой.

## Разработка

```bash
pnpm dev              # dev-сервер с Turbopack, http://localhost:3800
pnpm lint             # ESLint
pnpm typecheck        # tsc --noEmit
pnpm format           # Prettier

pnpm test:unit        # unit/integration тесты (Vitest)
pnpm test:e2e         # e2e тесты (Playwright)
pnpm test:ci          # полный прогон (unit + e2e), профиль CI
```

E2E- и CI-тесты используют отдельную тестовую БД, поднимаемую через `docker-compose.test.yml` — контракт переменных окружения для неё описан в [`.env.test.example`](.env.test.example).
