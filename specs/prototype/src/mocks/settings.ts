export interface UserProfile {
  name: string;
  username: string;
  email: string;
  role: string;
  avatarInitials: string;
  bio: string;
  phone: string;
  timezone: string;
  company: string;
  position: string;
  joinedAt: string;
  lastActive: string;
}

export interface NotificationPrefs {
  emailAlerts: boolean;
  emailDigest: boolean;
  emailMarketing: boolean;
  pushAlerts: boolean;
  pushCritical: boolean;
  smsAlerts: boolean;
  smsCritical: boolean;
  inAppSound: boolean;
  inAppBanner: boolean;
  slackAlerts: boolean;
  telegramAlerts: boolean;
  discordAlerts: boolean;
}

export type ThemeMode = "system" | "light" | "dark";

export interface AppearanceSettings {
  themeMode: ThemeMode;
  compactMode: boolean;
  showTimestamps: boolean;
  autoRefresh: boolean;
  autoRefreshInterval: number;
  sidebarCollapsed: boolean;
  monospaceFonts: boolean;
}

export const mockProfile: UserProfile = {
  name: "Алексей Волков",
  username: "admin",
  email: "admin@inspot.ru",
  role: "Супер-администратор",
  avatarInitials: "A",
  bio: "Старший DevOps-инженер. Управляю инфраструктурой Inspot — серверы Hetzner, DNS Cloudflare, мониторинг и автоматизация.",
  phone: "+7 (999) 123-45-67",
  timezone: "Europe/Moscow",
  company: "Inspot",
  position: "Senior DevOps Engineer",
  joinedAt: "2024-03-15T09:00:00Z",
  lastActive: new Date().toISOString(),
};

export const mockNotificationPrefs: NotificationPrefs = {
  emailAlerts: true,
  emailDigest: true,
  emailMarketing: false,
  pushAlerts: true,
  pushCritical: true,
  smsAlerts: false,
  smsCritical: true,
  inAppSound: true,
  inAppBanner: true,
  slackAlerts: true,
  telegramAlerts: false,
  discordAlerts: false,
};

export const notificationLabels: Record<
  keyof NotificationPrefs,
  { group: string; label: string; description: string }
> = {
  emailAlerts: {
    group: "email",
    label: "Оповещения по email",
    description: "Получать все системные оповещения на почту",
  },
  emailDigest: {
    group: "email",
    label: "Ежедневный дайджест",
    description: "Сводка событий за день в одном письме",
  },
  emailMarketing: {
    group: "email",
    label: "Маркетинговые рассылки",
    description: "Новости продукта, обновления и специальные предложения",
  },
  pushAlerts: {
    group: "push",
    label: "Push-уведомления",
    description: "Мгновенные уведомления в браузере",
  },
  pushCritical: {
    group: "push",
    label: "Критические push",
    description: "Только критические оповещения через push",
  },
  smsAlerts: {
    group: "sms",
    label: "SMS-оповещения",
    description: "Все оповещения через SMS",
  },
  smsCritical: {
    group: "sms",
    label: "Критические SMS",
    description: "Только критические оповещения через SMS",
  },
  inAppSound: {
    group: "inApp",
    label: "Звук в приложении",
    description: "Звуковое оповещение при новых алертах",
  },
  inAppBanner: {
    group: "inApp",
    label: "Баннеры в приложении",
    description: "Всплывающие баннеры при новых событиях",
  },
  slackAlerts: {
    group: "integrations",
    label: "Slack",
    description: "Отправлять оповещения в канал Slack",
  },
  telegramAlerts: {
    group: "integrations",
    label: "Telegram",
    description: "Отправлять оповещения в Telegram-бота",
  },
  discordAlerts: {
    group: "integrations",
    label: "Discord",
    description: "Отправлять оповещения в Discord-канал",
  },
};

export const mockAppearance: AppearanceSettings = {
  themeMode: "system",
  compactMode: false,
  showTimestamps: true,
  autoRefresh: true,
  autoRefreshInterval: 30,
  sidebarCollapsed: false,
  monospaceFonts: false,
};

export const notificationGroups = [
  {
    key: "email",
    label: "Email",
    icon: "ri-mail-line",
    color: "text-foreground-600",
  },
  {
    key: "push",
    label: "Push",
    icon: "ri-notification-3-line",
    color: "text-foreground-600",
  },
  {
    key: "sms",
    label: "SMS",
    icon: "ri-smartphone-line",
    color: "text-foreground-600",
  },
  {
    key: "inApp",
    label: "В приложении",
    icon: "ri-computer-line",
    color: "text-foreground-600",
  },
  {
    key: "integrations",
    label: "Интеграции",
    icon: "ri-plug-line",
    color: "text-foreground-600",
  },
];
