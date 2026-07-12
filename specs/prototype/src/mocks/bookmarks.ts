export interface Bookmark {
  id: string;
  name: string;
  url: string;
  icon?: string;
  description?: string;
  categoryId: string;
}

export interface Category {
  id: string;
  name: string;
}

export const initialCategories: Category[] = [
  { id: 'cat-monitoring', name: 'Мониторинг' },
  { id: 'cat-docs', name: 'Документация' },
  { id: 'cat-tools', name: 'Инструменты' },
  { id: 'cat-resources', name: 'Ресурсы' },
];

export const initialBookmarks: Bookmark[] = [
  { id: 'bm-1', name: 'Grafana', url: 'https://grafana.com', description: 'Дашборды и визуализация метрик', categoryId: 'cat-monitoring' },
  { id: 'bm-2', name: 'Prometheus', url: 'https://prometheus.io', description: 'Сбор и хранение метрик', categoryId: 'cat-monitoring' },
  { id: 'bm-3', name: 'Uptime Kuma', url: 'https://github.com/louislam/uptime-kuma', description: 'Мониторинг доступности сервисов', categoryId: 'cat-monitoring' },
  { id: 'bm-4', name: 'Cloudflare Docs', url: 'https://developers.cloudflare.com', description: 'Официальная документация Cloudflare', categoryId: 'cat-docs' },
  { id: 'bm-5', name: 'Hetzner Docs', url: 'https://docs.hetzner.com', description: 'Документация Hetzner Cloud', categoryId: 'cat-docs' },
  { id: 'bm-6', name: 'Docker Hub', url: 'https://hub.docker.com', description: 'Реестр контейнеров', categoryId: 'cat-tools' },
  { id: 'bm-7', name: 'Postman', url: 'https://postman.com', description: 'Тестирование API', categoryId: 'cat-tools' },
  { id: 'bm-8', name: 'crontab.guru', url: 'https://crontab.guru', description: 'Редактор cron-выражений', categoryId: 'cat-tools' },
  { id: 'bm-9', name: 'DigitalOcean Community', url: 'https://digitalocean.com/community', description: 'Туториалы по серверной инфраструктуре', categoryId: 'cat-resources' },
  { id: 'bm-10', name: 'DevDocs', url: 'https://devdocs.io', description: 'Единая документация по API', categoryId: 'cat-resources' },
];