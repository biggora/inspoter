const pageInfo: Record<string, { title: string; hint: string }> = {
  '/domains': { title: 'Домены', hint: 'Управление доменами от Cloudflare, Hetzner и GoDaddy, просмотр и редактирование DNS-записей.' },
  '/servers': { title: 'Серверы', hint: 'Контроль состояния Hetzner VPS, запуск, остановка и перезагрузка серверов.' },
  '/mail': { title: 'Почта', hint: 'Просмотр входящих писем, поиск и фильтрация по отправителю.' },
  '/messages': { title: 'Сообщения', hint: 'Входящие сообщения по категориям и каналам, управление категориями.' },
  '/logs': { title: 'Логи', hint: 'Поиск и фильтрация технических событий по уровню и источнику.' },
  '/alerts': { title: 'Оповещения', hint: 'Просмотр и сортировка оповещений по категориям и критичности.' },
  '/settings': { title: 'Настройки', hint: 'Создание и отзыв webhook-токенов для внешних интеграций.' },
};

interface PlaceholderPageProps {
  path: string;
}

export default function PlaceholderPage({ path }: PlaceholderPageProps) {
  const info = pageInfo[path] || { title: path, hint: 'Этот раздел находится в разработке.' };

  return (
    <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
      <div className="text-center max-w-md animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-secondary-100 flex items-center justify-center">
          <i className="ri-tools-line text-2xl text-secondary-600"></i>
        </div>
        <h3 className="font-heading text-xl font-semibold text-foreground-900 mb-2">
          {info.title} — скоро
        </h3>
        <p className="text-sm text-foreground-500 leading-relaxed">{info.hint}</p>
      </div>
    </div>
  );
}