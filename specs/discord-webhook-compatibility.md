# Спецификация: совместимость вебхуков Inspoter с Discord

## 1. Назначение и границы

Документ фиксирует нормативный контракт, при котором вебхуки Inspoter совместимы со спецификациями Discord в обе стороны:

- **Ingress** — Inspoter принимает тело запроса в формате [Discord Execute Webhook](https://docs.discord.com/developers/resources/webhook), то есть любой отправитель, уже умеющий писать в Discord-канал, пишет в канал Inspoter сменой одного URL.
- **Egress** — исходящие вебхуки Inspoter умеют доставлять события в Discord-канал (`DISCORD_EXECUTE`) и в приёмник, написанный под [Discord Webhook Events](https://docs.discord.com/developers/events/webhook-events) (`DISCORD_EVENTS`, подпись Ed25519).

### Что документ не меняет

Существующие контракты остаются рабочими без изменений и без дедлайна отключения:

| Поверхность                                          | Статус                                         |
| ---------------------------------------------------- | ---------------------------------------------- |
| `POST /api/webhooks/{type}` (log/alert/mail/message) | без изменений                                  |
| `POST /api/webhooks/channels/{webhookId}/{token}`    | без изменений                                  |
| Исходящий формат `INSPOT` (HMAC-SHA256)              | без изменений, остаётся значением по умолчанию |

### Место в иерархии источников

Документ подчинён `docs/prd.md` (границы и решения) и `docs/architecture.md` (реализуемые границы), см. [specs/README.md](./README.md). При конфликте выигрывает PRD. Машиночитаемая форма контракта ingress — [specs/openapi.json](./openapi.json).

---

## 2. Ingress: Execute Webhook

### 2.1 Маршруты

| Метод  | Путь                                               | Назначение                                    |
| ------ | -------------------------------------------------- | --------------------------------------------- |
| `POST` | `/api/discord/webhooks/{webhookId}/{token}`        | Execute Webhook                               |
| `GET`  | `/api/discord/webhooks/{webhookId}/{token}`        | Get Webhook with Token                        |
| `POST` | `/api/discord/webhooks/{webhookId}/{token}/slack`  | Slack-совместимая форма тела                  |
| `POST` | `/api/discord/webhooks/{webhookId}/{token}/github` | **не поддерживается** → `404` с телом Discord |

`webhookId` и `token` — те же значения, что выдаёт диалог создания канального вебхука: `webhookId` — идентификатор строки `WebhookToken`, `token` — секрет, показываемый один раз. Одна и та же пара работает и на `/api/webhooks/channels/{webhookId}/{token}`, и на Discord-маршруте; менять или перевыпускать существующие вебхуки не требуется.

Токен — часть URL, поэтому обратный прокси **обязан** вырезать полный путь `/api/discord/webhooks/*` из access- и error-логов ровно так же, как `/api/webhooks/channels/*` (`docs/architecture.md` §3.6).

### 2.2 Query-параметры

| Параметр          | Тип       | По умолчанию | Поведение                                                   |
| ----------------- | --------- | ------------ | ----------------------------------------------------------- |
| `wait`            | boolean   | `false`      | `false` → `204 No Content`; `true` → `200` с Message object |
| `thread_id`       | snowflake | —            | Принимается, игнорируется: у каналов Inspoter нет тредов    |
| `with_components` | boolean   | `false`      | Принимается, игнорируется: компоненты не рендерятся         |

Булевы значения читаются по правилам Discord: `true`/`1` — истина, всё прочее — ложь.

### 2.3 Тело запроса

Поддерживаются `Content-Type: application/json` и `multipart/form-data`. В multipart тело сообщения берётся из части `payload_json`; части `files[n]` / `file` принимаются, но не сохраняются (см. §8).

| Поле               | Тип             | Лимит | Поведение                                                           |
| ------------------ | --------------- | ----- | ------------------------------------------------------------------- |
| `content`          | string          | 2000  | Текст сообщения → `Message.content`                                 |
| `username`         | string          | 80    | Имя отправителя → `Message.author`; при отсутствии — имя вебхука    |
| `avatar_url`       | string (URL)    | 2048  | → `Message.avatarUrl`, показывается в таймлайне                     |
| `tts`              | boolean         | —     | → `Message.tts`, хранится, не воспроизводится                       |
| `embeds`           | array\<Embed\>  | 10    | → `Message.embeds`, рендерятся карточками                           |
| `allowed_mentions` | object          | —     | Валидируется, не влияет на запись: Inspoter не рассылает упоминания |
| `flags`            | integer         | —     | → `Message.flags`; распознаётся `SUPPRESS_EMBEDS` (`1 << 2`)        |
| `attachments`      | array           | 10    | Валидируется, не сохраняется                                        |
| `components`       | array           | 40    | Валидируется, не сохраняется                                        |
| `thread_name`      | string          | 100   | Валидируется, игнорируется                                          |
| `applied_tags`     | array\<string\> | 5     | Валидируется, игнорируется                                          |
| `poll`             | object          | —     | Валидируется, игнорируется                                          |
| `payload_json`     | string          | —     | Только multipart: JSON-строка со всеми полями выше                  |

**Обязательность.** Запрос должен содержать непустым хотя бы одно из `content`, `embeds`, `components`, `poll` или файловую часть. Иначе — `400` с кодом `50006`.

Неизвестные поля игнорируются (Discord ведёт себя так же), в отличие от строгого `channelWebhookPayloadSchema` старого маршрута.

При `flags & SUPPRESS_EMBEDS` embeds не сохраняются, но запрос остаётся валидным, если непуст `content`.

### 2.4 Порядок конвейера

Тот же fail-closed порядок, что и у остальных ingress-конвейеров (`docs/architecture.md` §3.2):

```
размер тела → разбор (JSON | multipart) → аутентификация → rate limit
  → валидация Zod → идемпотентность → запись Message → ответ
```

Размер тела ограничен `WEBHOOK_MAX_BODY_BYTES` (по умолчанию 65 536) и проверяется и по `Content-Length`, и по фактически прочитанному потоку.

### 2.5 Коды ответов

| Код   | Когда                                       | Тело                         |
| ----- | ------------------------------------------- | ---------------------------- |
| `200` | успех при `?wait=true`                      | Message object (§3.4)        |
| `204` | успех при `wait=false`                      | пусто                        |
| `400` | тело не разобралось или не прошло валидацию | Discord error (§4)           |
| `401` | вебхук не найден, токен неверен или отозван | Discord error                |
| `404` | неподдерживаемый суффикс (`/github`)        | Discord error                |
| `413` | тело больше лимита                          | Discord error                |
| `429` | превышен rate limit                         | Discord rate-limit body (§5) |

Все ответы несут `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff` — как и существующий канальный маршрут.

### 2.6 Идемпотентность (расширение поверх Discord)

Discord не описывает `Idempotency-Key`; Inspoter поддерживает его как расширение. Заголовок — 1…128 печатных ASCII-символов. При повторе с тем же ключом сообщение не создаётся второй раз: при `?wait=true` возвращается ранее созданное сообщение с `200`, при `wait=false` — `204`. Ключ уникален в пределах вебхука (`@@unique([tokenId, key])`).

### 2.7 Slack-совместимый суффикс

`POST …/slack` принимает `{ text, username, icon_url, attachments[] }`. `text` → `content`; каждый `attachment` (`title`, `title_link`, `text`, `color`, `fields[]`, `footer`, `ts`) отображается в Embed. Как и у Discord, `channel`, `icon_emoji`, `mrkdwn`, `mrkdwn_in` не поддерживаются и игнорируются. По умолчанию `wait=true` (поведение Discord), поэтому успех — `200` с Message object.

---

## 3. Объекты

### 3.1 Embed

| Поле          | Тип     | Лимит      | Примечание                                   |
| ------------- | ------- | ---------- | -------------------------------------------- |
| `title`       | string  | 256        |                                              |
| `type`        | string  | —          | `rich` по умолчанию                          |
| `description` | string  | 4096       |                                              |
| `url`         | string  | 2048       | заголовок становится ссылкой                 |
| `timestamp`   | ISO8601 | —          |                                              |
| `color`       | integer | 0…0xFFFFFF | цвет левой полосы                            |
| `footer`      | object  | —          | `text` ≤2048, `icon_url`                     |
| `image`       | object  | —          | `url`, `height`, `width`                     |
| `thumbnail`   | object  | —          | как `image`                                  |
| `video`       | object  | —          | принимается, не рендерится                   |
| `provider`    | object  | —          | `name`, `url`                                |
| `author`      | object  | —          | `name` ≤256, `url`, `icon_url`               |
| `fields`      | array   | 25         | `name` ≤256, `value` ≤1024, `inline` boolean |

**Суммарный лимит.** Сумма длин `title`, `description`, `footer.text`, `author.name`, а также `name` и `value` всех полей по всем embed'ам не должна превышать **6000** символов. Превышение → `400`, код `50035`, путь `embeds`.

### 3.2 Allowed Mentions

`{ parse: ["roles" | "users" | "everyone"], roles: string[≤100], users: string[≤100], replied_user: boolean }`. Валидируется по форме Discord; на запись не влияет — Inspoter не рассылает уведомления по упоминаниям.

### 3.3 Snowflake-суррогаты

Идентификаторы Inspoter — cuid, идентификаторы Discord — числовые снежинки. Клиенты, разбирающие `id` как число, ломались бы на cuid, поэтому в исходящих JSON-ответах Discord-маршрутов идентификаторы отдаются как **суррогатные снежинки**: 64-битное десятичное число, в старших 42 битах — миллисекунды от эпохи Discord (2015-01-01T00:00:00Z), в младших 22 битах — стабильный хеш cuid.

Свойства: детерминированность (один cuid → всегда одна снежинка), сохранение порядка по времени создания, **необратимость** — по снежинке нельзя получить cuid, и в запросах она не принимается. Внутренние API дашборда продолжают работать с cuid.

### 3.4 Message object

Ответ при `?wait=true`:

```json
{
  "id": "1234567890123456789",
  "type": 0,
  "channel_id": "1234567890123456780",
  "webhook_id": "1234567890123456781",
  "author": {
    "id": "1234567890123456781",
    "username": "Continuous Integration",
    "avatar": null,
    "discriminator": "0000",
    "bot": true
  },
  "content": "Build 842 completed successfully.",
  "timestamp": "2026-08-02T10:15:00.000Z",
  "edited_timestamp": null,
  "tts": false,
  "mention_everyone": false,
  "mentions": [],
  "mention_roles": [],
  "attachments": [],
  "embeds": [],
  "pinned": false,
  "flags": 0
}
```

Поля, которых у Inspoter нет (`avatar`, `edited_timestamp`), отдаются как `null`; списки, которые не поддерживаются, — пустыми массивами. Такая форма разбирается штатными Discord-клиентами.

### 3.5 Webhook object

Ответ `GET /api/discord/webhooks/{webhookId}/{token}`:

```json
{
  "id": "1234567890123456781",
  "type": 1,
  "name": "Continuous Integration",
  "avatar": null,
  "channel_id": "1234567890123456780",
  "guild_id": null,
  "application_id": null,
  "token": "…",
  "url": "https://dashboard.example.com/api/discord/webhooks/…"
}
```

`type: 1` — Incoming Webhook. `guild_id`/`application_id` — `null`: у Inspoter нет гильдий и приложений. `token` возвращается только тому, кто уже знает его (он в пути), поэтому раскрытия не происходит; ответ помечен `Cache-Control: no-store`.

---

## 4. Ошибки

Тело ошибки — форма Discord:

```json
{
  "message": "Invalid Form Body",
  "code": 50035,
  "errors": {
    "embeds": {
      "0": {
        "title": {
          "_errors": [
            {
              "code": "BASE_TYPE_MAX_LENGTH",
              "message": "Must be 256 or fewer in length."
            }
          ]
        }
      }
    }
  }
}
```

| HTTP  | `code` | `message`                      | Причина                                                   |
| ----- | ------ | ------------------------------ | --------------------------------------------------------- |
| `400` | 50035  | `Invalid Form Body`            | Ошибка валидации; дерево `errors` по путям полей          |
| `400` | 50006  | `Cannot send an empty message` | Нет ни `content`, ни `embeds`, ни `components`, ни `poll` |
| `400` | 0      | `400: Bad Request`             | Тело не является валидным JSON / multipart                |
| `401` | 0      | `401: Unauthorized`            | Вебхук не найден, токен неверен или отозван               |
| `404` | 10015  | `Unknown Webhook`              | Неподдерживаемый суффикс маршрута                         |
| `413` | 40005  | `Request entity too large`     | Тело больше `WEBHOOK_MAX_BODY_BYTES`                      |
| `429` | —      | `You are being rate limited.`  | См. §5                                                    |

**Неразличимость.** Несуществующий `webhookId` и неверный `token` дают одинаковый `401`. Discord в этом месте различает `404`/`401`; Inspoter намеренно не различает, чтобы перебор не подтверждал существование вебхука. Расхождение зафиксировано в §8.

Коды `BASE_TYPE_REQUIRED`, `BASE_TYPE_MAX_LENGTH`, `BASE_TYPE_MIN_LENGTH`, `NUMBER_TYPE_MAX`, `BASE_TYPE_CHOICES`, `LIST_TYPE_MAX_LENGTH` выводятся из issue-дерева Zod.

---

## 5. Rate limits

Ограничение — существующее пооконное на вебхук: `WEBHOOK_RATE_LIMIT` запросов за `WEBHOOK_RATE_WINDOW_MS` (по умолчанию 120/60 с), ключ — идентификатор вебхука.

Заголовки на **каждом** ответе Discord-маршрута:

| Заголовок                 | Значение                                           |
| ------------------------- | -------------------------------------------------- |
| `X-RateLimit-Limit`       | `WEBHOOK_RATE_LIMIT`                               |
| `X-RateLimit-Remaining`   | остаток в текущем окне                             |
| `X-RateLimit-Reset`       | Unix-время сброса окна, секунды с плавающей точкой |
| `X-RateLimit-Reset-After` | секунд до сброса, с плавающей точкой               |
| `X-RateLimit-Bucket`      | стабильный хеш вебхука — один вебхук, один бакет   |

Дополнительно на `429`: `Retry-After` (секунды), `X-RateLimit-Scope: user`, `X-RateLimit-Global: false`. Тело:

```json
{
  "message": "You are being rate limited.",
  "retry_after": 12.34,
  "global": false,
  "code": 0
}
```

Ограничитель внутрипроцессный (ADR-006): счётчики не разделяются между репликами и сбрасываются при перезапуске.

---

## 6. Egress: `DISCORD_EXECUTE`

Формат исходящего вебхука, при котором событие Inspoter доставляется прямо в Discord-канал (или в любой приёмник, реализующий Execute Webhook).

**Запрос:** `POST <url>`, `Content-Type: application/json`, `User-Agent: Inspot-Webhooks/1`. Тело:

```json
{
  "username": "Inspoter",
  "embeds": [
    {
      "title": "…",
      "description": "…",
      "color": 15548997,
      "fields": [],
      "footer": { "text": "Inspoter" },
      "timestamp": "…"
    }
  ]
}
```

Подпись не отправляется: Discord её не проверяет, а заголовок с секретом на чужом хосте — лишняя утечка. Приёмник аутентифицирует отправителя самим секретным URL.

**Маппинг событий в embed:**

| Событие           | `title`          | `color`                                                                 | `fields`         |
| ----------------- | ---------------- | ----------------------------------------------------------------------- | ---------------- |
| `ALERT_CREATED`   | категория алерта | по severity: critical `0xED4245`, warning `0xFEE75C`, прочее `0x5865F2` | severity, source |
| `SERVICE_STATUS`  | имя сервиса      | up `0x57F287`, down `0xED4245`, degraded `0xFEE75C`                     | status, latency  |
| `MESSAGE_CREATED` | имя канала       | `0x5865F2`                                                              | author, origin   |
| `LOG_CREATED`     | источник лога    | по level: error `0xED4245`, warn `0xFEE75C`, прочее `0x4F545C`          | level            |
| `MAIL_RECEIVED`   | тема письма      | `0x5865F2`                                                              | from             |

`description` — текст события, усечённый до 4096 символов; каждое `field.value` — до 1024. Итоговое тело всегда укладывается в лимиты §3.1.

**Ответы:** `2xx` (Discord отвечает `204`) — доставлено. `429` — время следующей попытки берётся из `retry_after` тела ответа, а не из общей лестницы backoff. Прочие `4xx` — постоянная ошибка, повторов нет. `5xx` и сетевые ошибки — обычная лестница `30s → 2m → 10m → 1h → 6h`.

---

## 7. Egress: `DISCORD_EVENTS`

Формат, при котором Inspoter выступает отправителем в точности как Discord Webhook Events, а приёмник — это код, написанный под Discord.

**Конверт:**

```json
{
  "version": 1,
  "application_id": "1234567890123456781",
  "type": 1,
  "event": {
    "type": "ALERT_CREATED",
    "timestamp": "2026-08-02T10:15:00.000Z",
    "data": {}
  }
}
```

`type: 0` — PING (без узла `event`), `type: 1` — событие. `application_id` — суррогатная снежинка исходящего вебхука (§3.3). `event.type` — значение перечисления `OutgoingWebhookEvent`: совместим транспорт, словарь событий остаётся собственным (Discord-события вроде `APPLICATION_AUTHORIZED` у Inspoter не возникают).

**Подпись.** Заголовки `X-Signature-Ed25519` (hex) и `X-Signature-Timestamp` (Unix-секунды). Подписывается конкатенация `timestamp + rawBody` приватным ключом Ed25519 — та же схема, по которой валидирует приёмник Discord. Приватный ключ генерируется при создании вебхука и хранится AES-256-GCM-зашифрованным; публичный ключ (64 hex-символа) показывается оператору в настройках и настраивается на стороне приёмника.

**PING.** Конверт с `type: 0` отправляется при создании вебхука такого формата и по кнопке «Тест». Приёмник обязан вернуть `204`.

**Тайминги.** Таймаут ответа — 3 с (спецификация Discord), вместо общих `WEBHOOK_DELIVERY_TIMEOUT_MS`. Лестница повторов `1s → 5s → 30s → 2m → 5m` — суммарно укладывается в декларированные Discord 10 минут. Успехом считается любой `2xx`; канонический ответ — `204` без тела.

**Авто-отключение.** Счётчик `consecutiveFailures` растёт на каждой окончательно провалившейся доставке и обнуляется на успешной. По достижении `WEBHOOK_AUTO_DISABLE_AFTER` (по умолчанию 10) вебхук переводится в `isActive: false`; в списке настроек он помечен как отключённый автоматически и включается оператором вручную. Discord в этом месте шлёт письмо — Inspoter вместо этого пишет запись в журнал активности.

---

## 8. Расхождения и ограничения

| Тема                                               | Discord                                 | Inspoter                                                                             | Причина                                          |
| -------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ |
| Файловые вложения `files[n]`                       | сохраняются, отдаются как `attachments` | принимаются, не сохраняются; `attachments` в ответе пуст                             | у канальных сообщений нет хранилища вложений     |
| Треды (`thread_id`, `thread_name`, `applied_tags`) | создают/адресуют тред                   | принимаются, игнорируются                                                            | у каналов Inspoter нет тредов                    |
| `components`, `poll`                               | рендерятся                              | валидируются, игнорируются                                                           | интерактивных компонентов и опросов нет          |
| `allowed_mentions`                                 | управляет уведомлениями                 | валидируется, не влияет                                                              | Inspoter не рассылает уведомления по упоминаниям |
| `tts`                                              | зачитывается голосом                    | хранится, не воспроизводится                                                         | голосового слоя нет                              |
| Неизвестный вебхук                                 | `404 Unknown Webhook`                   | `401`                                                                                | не подтверждать существование вебхука перебором  |
| Идентификаторы                                     | настоящие снежинки                      | суррогатные, необратимые (§3.3)                                                      | внутренние идентификаторы — cuid                 |
| Редактирование/удаление сообщений                  | `PATCH`/`DELETE …/messages/{id}`        | не реализовано → `404`                                                               | вне объёма                                       |
| Rate limit                                         | глобальный + пер-роут, распределённый   | пооконный на вебхук, внутрипроцессный                                                | ADR-006, одно приложение-процесс                 |
| Словарь событий `DISCORD_EVENTS`                   | `APPLICATION_AUTHORIZED` и др.          | `ALERT_CREATED`, `SERVICE_STATUS`, `MESSAGE_CREATED`, `LOG_CREATED`, `MAIL_RECEIVED` | совместим транспорт, не предметная область       |

---

## 9. Матрица покрытия

Легенда: **supported** — влияет на результат; **stored** — сохраняется, но не влияет на рендер; **accepted** — валидируется и игнорируется; **rejected** — приводит к ошибке.

| Поле                                                          | Статус                                      |
| ------------------------------------------------------------- | ------------------------------------------- |
| `content`                                                     | supported                                   |
| `username`                                                    | supported                                   |
| `avatar_url`                                                  | supported                                   |
| `embeds[*]`                                                   | supported                                   |
| `flags`                                                       | supported (`SUPPRESS_EMBEDS`), иначе stored |
| `tts`                                                         | stored                                      |
| `payload_json`                                                | supported                                   |
| `allowed_mentions`                                            | accepted                                    |
| `attachments`, `files[n]`                                     | accepted                                    |
| `components`, `poll`                                          | accepted                                    |
| `thread_name`, `applied_tags`, `thread_id`, `with_components` | accepted                                    |
| `wait`                                                        | supported                                   |
| Тело без единого содержательного поля                         | rejected (`50006`)                          |
| Превышение любого лимита §2.3/§3.1                            | rejected (`50035`)                          |

---

## 10. Совместимость и эксплуатация

- Существующие канальные вебхуки работают на обоих маршрутах без перевыпуска.
- Существующие исходящие вебхуки остаются в формате `INSPOT`; смена формата — явное действие оператора, при переходе на `DISCORD_EVENTS` генерируется пара Ed25519 и показывается публичный ключ.
- Discord-URL и cURL-пример показываются в диалоге настроек канала рядом с нативными; URL остаётся секретом наравне с нативным.
- Обратный прокси обязан вырезать пути `/api/discord/webhooks/*` из логов.
- Новые переменные окружения: `WEBHOOK_AUTO_DISABLE_AFTER` (default 10).

---

## 11. Ссылки

- Discord — [Webhooks](https://docs.discord.com/developers/platform/webhooks), [Webhook Resource](https://docs.discord.com/developers/resources/webhook), [Message Resource](https://docs.discord.com/developers/resources/message), [Webhook Events](https://docs.discord.com/developers/events/webhook-events), [Rate Limits](https://docs.discord.com/developers/topics/rate-limits)
- Inspoter — [`docs/architecture.md`](../docs/architecture.md) §6, [`specs/openapi.json`](./openapi.json), [`specs/README.md`](./README.md)
