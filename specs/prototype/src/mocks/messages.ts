export interface Channel {
  id: string;
  name: string;
  description: string;
  unreadCount: number;
}

export interface Category {
  id: string;
  name: string;
  channels: Channel[];
}

export interface Message {
  id: string;
  channelId: string;
  author: string;
  authorInitials: string;
  timestamp: string;
  content: string;
}

export const mockCategories: Category[] = [
  {
    id: "cat-general",
    name: "Общее",
    channels: [
      {
        id: "ch-01",
        name: "general",
        description: "Общие обсуждения и анонсы",
        unreadCount: 3,
      },
      {
        id: "ch-02",
        name: "random",
        description: "Всё что не по теме",
        unreadCount: 0,
      },
      {
        id: "ch-03",
        name: "updates",
        description: "Релизы, чейнжлоги и новости",
        unreadCount: 12,
      },
    ],
  },
  {
    id: "cat-engineering",
    name: "Инженерия",
    channels: [
      {
        id: "ch-04",
        name: "backend",
        description: "API, базы данных, микросервисы",
        unreadCount: 5,
      },
      {
        id: "ch-05",
        name: "frontend",
        description: "React, Tailwind, компоненты",
        unreadCount: 0,
      },
      {
        id: "ch-06",
        name: "devops",
        description: "CI/CD, контейнеры, инфраструктура",
        unreadCount: 8,
      },
      {
        id: "ch-07",
        name: "code-reviews",
        description: "Обсуждение PR и архитектурных решений",
        unreadCount: 1,
      },
    ],
  },
  {
    id: "cat-monitoring",
    name: "Мониторинг",
    channels: [
      {
        id: "ch-08",
        name: "alerts",
        description: "Критические уведомления и инциденты",
        unreadCount: 0,
      },
      {
        id: "ch-09",
        name: "server-status",
        description: "Состояние серверов и аптайм",
        unreadCount: 2,
      },
      {
        id: "ch-10",
        name: "security",
        description: "Уязвимости, патчи, инциденты безопасности",
        unreadCount: 4,
      },
    ],
  },
  {
    id: "cat-projects",
    name: "Проекты",
    channels: [
      {
        id: "ch-11",
        name: "dashboard-v2",
        description: "Новая версия дашборда Inspot",
        unreadCount: 7,
      },
      {
        id: "ch-12",
        name: "api-gateway",
        description: "Миграция на новый API Gateway",
        unreadCount: 0,
      },
      {
        id: "ch-13",
        name: "mobile-app",
        description: "Мобильное приложение Inspot",
        unreadCount: 3,
      },
    ],
  },
];

export const mockMessages: Message[] = [
  // ----- general -----
  {
    id: "m-001",
    channelId: "ch-01",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-12T09:30:00Z",
    content:
      "Всем доброе утро! Сегодня деплоим dashboard-v2 в прод, держим пальцы 🤞",
  },
  {
    id: "m-002",
    channelId: "ch-01",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T09:32:00Z",
    content: "Уже подготовил staging, все тесты зелёные",
  },
  {
    id: "m-003",
    channelId: "ch-01",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T09:35:00Z",
    content:
      "Нагрузочное тестирование прошло отлично, держит 5K RPS на 4 ядрах",
  },
  {
    id: "m-004",
    channelId: "ch-01",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T09:40:00Z",
    content:
      "Забавный факт: за последний месяц мы сэкономили €320 на Hetzner после оптимизации автоскейлинга. Плюс к этому Cloudflare закешировал 93% статики — считай бесплатный CDN.",
  },
  {
    id: "m-005",
    channelId: "ch-01",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-12T10:00:00Z",
    content:
      "Кстати, кто-нибудь смотрел новую фичу Cloudflare R2? Можно мигрировать часть статики с S3 и сэкономить на egress",
  },
  {
    id: "m-006",
    channelId: "ch-01",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-12T10:15:00Z",
    content:
      "Хорошая идея, давайте обсудим на стендапе. Добавила в повестку на завтра",
  },
  {
    id: "m-007",
    channelId: "ch-01",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T10:20:00Z",
    content:
      "Ещё предлагаю обсудить миграцию db-replica на NVMe-диски — текущие SSD уже на пределе по IOPS",
  },
  {
    id: "m-008",
    channelId: "ch-01",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T10:22:00Z",
    content:
      "Поддерживаю. По метрикам Grafana пиковая загрузка диска достигает 89%",
  },

  // ----- random -----
  {
    id: "m-009",
    channelId: "ch-02",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-11T16:45:00Z",
    content:
      "Кто-нибудь был на конференции KubeCon в этом году? Стоит ехать в следующем?",
  },
  {
    id: "m-010",
    channelId: "ch-02",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-11T17:00:00Z",
    content:
      "Да, доклады были огонь! Особенно про eBPF и observability. Вот ссылка на записи: https://kubecon.io/archive/2026",
  },
  {
    id: "m-011",
    channelId: "ch-02",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-11T17:30:00Z",
    content:
      "Кстати, наша компания может компенсировать билеты на конференции, уточните у HR",
  },

  // ----- updates -----
  {
    id: "m-012",
    channelId: "ch-03",
    author: "Inspot Bot",
    authorInitials: "IB",
    timestamp: "2026-07-12T08:00:00Z",
    content:
      "## Release v2.7.0\n\n### Новое\n- Добавлен раздел «Сообщения» с категориями и каналами\n- Реалтайм-уведомления о критических алертах\n- Экспорт логов в формате JSON\n\n### Исправления\n- Починен баг с дублированием DNS-записей при импорте\n- Поправлена тёмная тема в mail-клиенте\n- Улучшена производительность таблицы доменов (виртуализация строк)",
  },
  {
    id: "m-013",
    channelId: "ch-03",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T08:05:00Z",
    content: "Шикарный релиз! Ждала раздел сообщений",
  },
  {
    id: "m-014",
    channelId: "ch-03",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T08:10:00Z",
    content:
      "Кто закрывал тикет DNS-импорта? Отличная работа, баг был реально бесячим",
  },

  // ----- backend -----
  {
    id: "m-015",
    channelId: "ch-04",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T09:00:00Z",
    content:
      "Ребята, обновил `db-pool` до версии 3.2 — теперь connection pooling работает через PgBouncer в transaction mode. Пропускная способность выросла на 40%",
  },
  {
    id: "m-016",
    channelId: "ch-04",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T09:10:00Z",
    content: "Отлично! А как это повлияло на latency?",
  },
  {
    id: "m-017",
    channelId: "ch-04",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T09:12:00Z",
    content:
      "P50 снизилась с 45ms до 32ms, P95 с 180ms до 95ms. Плюс количество соединений к PostgreSQL упало с 800 до 120",
  },
  {
    id: "m-018",
    channelId: "ch-04",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T09:15:00Z",
    content:
      "Круто! Надо бы обновить дашборд мониторинга, добавить метрики пула",
  },
  {
    id: "m-019",
    channelId: "ch-04",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T09:20:00Z",
    content:
      "Да, создал тикет в Linear — https://linear.app/inspot/issue/ENG-421",
  },

  // ----- frontend -----
  {
    id: "m-020",
    channelId: "ch-05",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-11T14:00:00Z",
    content:
      "Перенесла все старые компоненты с CSS-модулей на Tailwind. Кодовая база стала на 30% чище",
  },
  {
    id: "m-021",
    channelId: "ch-05",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-11T14:10:00Z",
    content:
      "Заодно обновила все формы — теперь используют react-hook-form + zod валидацию. Писать формы стало реально приятно",
  },

  // ----- devops -----
  {
    id: "m-022",
    channelId: "ch-06",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T07:30:00Z",
    content:
      "⚠️ Ночью была деградация на cache-node — OOM killer убил Redis в 03:12. Автоматический рестарт отработал за 45 секунд.",
  },
  {
    id: "m-023",
    channelId: "ch-06",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T07:32:00Z",
    content:
      "Увеличил memory limit для Redis-инстанса с 4GB до 6GB и добавил алерт при использовании >80%. Сейчас мониторю.",
  },
  {
    id: "m-024",
    channelId: "ch-06",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T07:40:00Z",
    content: "Спасибо что быстро среагировал. Пользователи даже не заметили?",
  },
  {
    id: "m-025",
    channelId: "ch-06",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T07:42:00Z",
    content:
      "Да, Cloudflare отдавал закешированные ответы, так что для пользователей всё было прозрачно. Люблю наш стек ❤️",
  },
  {
    id: "m-026",
    channelId: "ch-06",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-12T07:50:00Z",
    content:
      "Добавим постмортем в базу знаний? Хороший кейс для онбординга новичков",
  },
  {
    id: "m-027",
    channelId: "ch-06",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T07:55:00Z",
    content: "Уже пишу, залью в Confluence через час",
  },

  // ----- code-reviews -----
  {
    id: "m-028",
    channelId: "ch-07",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-12T08:30:00Z",
    content:
      "Ребята, посмотрите пожалуйста PR #847 — https://github.com/inspot/dashboard/pull/847. Рефакторинг системы уведомлений, хочу смержить до конца дня",
  },
  {
    id: "m-029",
    channelId: "ch-07",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T08:45:00Z",
    content:
      "Посмотрел, оставил пару комментариев по архитектуре очереди. В целом — огонь",
  },

  // ----- alerts -----
  {
    id: "m-030",
    channelId: "ch-08",
    author: "Inspot Monitoring",
    authorInitials: "IM",
    timestamp: "2026-07-12T03:12:00Z",
    content: "🔴 CRITICAL: cache-node не отвечает. Статус: investigating.",
  },
  {
    id: "m-031",
    channelId: "ch-08",
    author: "Inspot Monitoring",
    authorInitials: "IM",
    timestamp: "2026-07-12T03:13:00Z",
    content:
      "🟢 RESOLVED: cache-node восстановлен. Причина: OOM, Redis перезапущен. Длительность: 45s.",
  },
  {
    id: "m-032",
    channelId: "ch-08",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-12T03:14:00Z",
    content: "Принял. Пишу постмортем.",
  },

  // ----- server-status -----
  {
    id: "m-033",
    channelId: "ch-09",
    author: "Inspot Monitoring",
    authorInitials: "IM",
    timestamp: "2026-07-12T06:00:00Z",
    content:
      "Ежедневный отчёт:\n\n| Сервер | CPU | RAM | Диск | Статус |\n|--------|-----|-----|------|--------|\n| web-prod-01 | 23% | 54% | 38% | ✅ |\n| web-prod-02 | 19% | 48% | 33% | ✅ |\n| db-primary | 42% | 76% | 62% | ✅ |\n| db-replica | 8% | 22% | 58% | ✅ |\n| cache-node | 15% | 85% | 45% | ⚠️ |",
  },

  // ----- security -----
  {
    id: "m-034",
    channelId: "ch-10",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-11T20:00:00Z",
    content:
      "Обновил WAF-правила на Cloudflare после вчерашней атаки. Добавил rate-limiting на /api/auth — теперь не более 10 запросов в минуту с IP",
  },
  {
    id: "m-035",
    channelId: "ch-10",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-11T20:05:00Z",
    content:
      "Также включил bot management на Pro-тарифе. До этого 18% трафика были ботами 😱",
  },
  {
    id: "m-036",
    channelId: "ch-10",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-11T20:30:00Z",
    content: "Спасибо! А как насчёт CSP-заголовков? Мы их обновляли?",
  },
  {
    id: "m-037",
    channelId: "ch-10",
    author: "Thomas Wagner",
    authorInitials: "TW",
    timestamp: "2026-07-11T20:45:00Z",
    content:
      "Да, обновил в прошлом релизе. Сейчас CSP в report-only режиме, через неделю переключим на enforce",
  },

  // ----- dashboard-v2 -----
  {
    id: "m-038",
    channelId: "ch-11",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-12T09:00:00Z",
    content:
      "Дизайн нового дашборда готов! Зацените: обновлённые виджеты мониторинга, графики в реальном времени, кастомизируемая сетка",
  },
  {
    id: "m-039",
    channelId: "ch-11",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-12T09:02:00Z",
    content:
      "Главная фича — drag-and-drop перестановка виджетов. Пользователи смогут собрать свой идеальный дашборд",
  },
  {
    id: "m-040",
    channelId: "ch-11",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-12T09:05:00Z",
    content: "Выглядит круто! А API для кастомных виджетов уже готово?",
  },
  {
    id: "m-041",
    channelId: "ch-11",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-12T09:10:00Z",
    content:
      "Да, документировал в OpenAPI — https://api.inspot.app/docs/v2/widgets",
  },
  {
    id: "m-042",
    channelId: "ch-11",
    author: "Sofia Ricci",
    authorInitials: "SR",
    timestamp: "2026-07-12T09:15:00Z",
    content:
      "Тестировала эндпоинты — всё работает. Добавила нагрузочные тесты, держат стабильно",
  },

  // ----- api-gateway -----
  {
    id: "m-043",
    channelId: "ch-12",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-10T11:00:00Z",
    content:
      "Миграция на новый API Gateway завершена на 80%. Осталось перевести эндпоинты доменов и почты",
  },
  {
    id: "m-044",
    channelId: "ch-12",
    author: "Marco Lehmann",
    authorInitials: "ML",
    timestamp: "2026-07-10T11:15:00Z",
    content:
      "Новый gateway на базе Envoy, latency сократилась на 35% по сравнению со старым Nginx",
  },

  // ----- mobile-app -----
  {
    id: "m-045",
    channelId: "ch-13",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-09T16:00:00Z",
    content:
      "Первая бета мобильного приложения готова! React Native + Expo, работает на iOS и Android",
  },
  {
    id: "m-046",
    channelId: "ch-13",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-09T16:10:00Z",
    content:
      "Пуш-уведомления для критических алертов уже работают. Тестировала на своём устройстве — приходит мгновенно",
  },
  {
    id: "m-047",
    channelId: "ch-13",
    author: "Anna Keller",
    authorInitials: "AK",
    timestamp: "2026-07-09T17:00:00Z",
    content: "Это потрясающе! Когда планируем публичный бета-тест?",
  },
  {
    id: "m-048",
    channelId: "ch-13",
    author: "Elena Vogel",
    authorInitials: "EV",
    timestamp: "2026-07-09T17:30:00Z",
    content:
      "Думаю через 2 недели. Нужно ещё допилить offline-режим и синхронизацию",
  },
];

export function getChannelMessages(channelId: string): Message[] {
  return mockMessages.filter((m) => m.channelId === channelId);
}

export function getChannelById(channelId: string): Channel | undefined {
  for (const cat of mockCategories) {
    const found = cat.channels.find((c) => c.id === channelId);
    if (found) return found;
  }
  return undefined;
}

export function getCategoryByChannelId(
  channelId: string,
): Category | undefined {
  for (const cat of mockCategories) {
    if (cat.channels.some((c) => c.id === channelId)) return cat;
  }
  return undefined;
}

export const teamMembers: Record<string, { color: string }> = {
  AK: { color: "oklch(0.55 0.18 20)" },
  ML: { color: "oklch(0.55 0.18 80)" },
  SR: { color: "oklch(0.55 0.18 140)" },
  TW: { color: "oklch(0.55 0.18 200)" },
  EV: { color: "oklch(0.55 0.18 260)" },
  IB: { color: "oklch(0.55 0.12 300)" },
  IM: { color: "oklch(0.55 0.15 320)" },
};
