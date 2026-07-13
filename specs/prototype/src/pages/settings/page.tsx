import { useState, useEffect, useCallback } from "react";
import {
  mockProfile,
  mockNotificationPrefs,
  mockAppearance,
} from "@/mocks/settings";
import type {
  UserProfile,
  NotificationPrefs,
  AppearanceSettings,
} from "@/mocks/settings";
import { ProfileTab } from "@/pages/settings/components/ProfileTab";
import { NotificationsTab } from "@/pages/settings/components/NotificationsTab";
import { AppearanceTab } from "@/pages/settings/components/AppearanceTab";
import { SecurityTab } from "@/pages/settings/components/SecurityTab";

type SettingsTab = "profile" | "notifications" | "appearance" | "security";
type PageState = "loading" | "error" | "ready";

const tabs: { key: SettingsTab; label: string; icon: string }[] = [
  { key: "profile", label: "Профиль", icon: "ri-user-line" },
  {
    key: "notifications",
    label: "Уведомления",
    icon: "ri-notification-3-line",
  },
  { key: "appearance", label: "Оформление", icon: "ri-palette-line" },
  { key: "security", label: "Безопасность", icon: "ri-shield-check-line" },
];

export default function SettingsPage() {
  const [pageState, setPageState] = useState<PageState>("loading");
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [profile, setProfile] = useState<UserProfile>(mockProfile);
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(
    mockNotificationPrefs,
  );
  const [appearance, setAppearance] =
    useState<AppearanceSettings>(mockAppearance);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<{
    message: string;
    variant: "success" | "error";
  } | null>(null);

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const showNotify = useCallback(
    (message: string, variant: "success" | "error") => {
      setNotification({ message, variant });
    },
    [],
  );

  const loadSettings = useCallback(() => {
    setPageState("loading");
    setTimeout(() => {
      setProfile({ ...mockProfile });
      setNotifPrefs({ ...mockNotificationPrefs });
      setAppearance({ ...mockAppearance });
      setPageState("ready");
    }, 500);
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const handleProfileSave = useCallback(
    (updated: UserProfile) => {
      setSaving(true);
      setTimeout(() => {
        setProfile(updated);
        setSaving(false);
        showNotify("Профиль успешно обновлён", "success");
      }, 400);
    },
    [showNotify],
  );

  const handleNotifSave = useCallback((updated: NotificationPrefs) => {
    setSaving(true);
    setTimeout(() => {
      setNotifPrefs(updated);
      setSaving(false);
    }, 300);
  }, []);

  const handleAppearanceSave = useCallback((updated: AppearanceSettings) => {
    setSaving(true);
    setTimeout(() => {
      setAppearance(updated);
      setSaving(false);
    }, 300);
  }, []);

  if (pageState === "loading") {
    return (
      <div className="p-6">
        {/* Tab bar skeleton */}
        <div className="flex items-center gap-1 mb-8">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="animate-skeleton h-9 w-32 rounded-lg"></div>
          ))}
        </div>
        {/* Content skeleton */}
        <div className="max-w-2xl space-y-4">
          <div className="animate-skeleton h-24 rounded-xl"></div>
          <div className="animate-skeleton h-12 rounded-lg"></div>
          <div className="animate-skeleton h-12 rounded-lg"></div>
          <div className="grid grid-cols-2 gap-4">
            <div className="animate-skeleton h-12 rounded-lg"></div>
            <div className="animate-skeleton h-12 rounded-lg"></div>
          </div>
          <div className="animate-skeleton h-20 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (pageState === "error") {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-3.5rem)] p-6">
        <div className="text-center max-w-sm animate-scale-in">
          <div className="w-16 h-16 mx-auto mb-5 rounded-2xl bg-primary-100 flex items-center justify-center">
            <i className="ri-settings-4-line text-2xl text-primary-600"></i>
          </div>
          <h3 className="font-heading text-lg font-semibold text-foreground-900 mb-2">
            Не удалось загрузить настройки
          </h3>
          <p className="text-sm text-foreground-500 mb-6">
            Проверьте подключение и попробуйте снова.
          </p>
          <button
            onClick={loadSettings}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-refresh-line w-5 h-5 flex items-center justify-center"></i>
            Повторить
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Notification toast */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium animate-slide-in-right ${
            notification.variant === "success"
              ? "bg-accent-100/80 text-accent-800"
              : "bg-primary-100/70 text-primary-800"
          }`}
          role="status"
          aria-live="polite"
        >
          <i
            className={`${
              notification.variant === "success"
                ? "ri-check-line"
                : "ri-error-warning-line"
            } w-5 h-5 flex items-center justify-center`}
          ></i>
          {notification.message}
        </div>
      )}

      {/* Tab bar */}
      <div className="flex items-center gap-1 mb-8 border-b border-background-200 pb-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 -mb-[1px] text-sm font-medium transition-colors cursor-pointer whitespace-nowrap border-b-2 rounded-t-lg ${
              activeTab === tab.key
                ? "border-primary-500 text-primary-700 bg-primary-50/30"
                : "border-transparent text-foreground-500 hover:text-foreground-700 hover:bg-background-100/50"
            }`}
          >
            <i
              className={`${tab.icon} w-4 h-4 flex items-center justify-center`}
            ></i>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Saving overlay indicator */}
      {saving && (
        <div className="fixed top-16 right-6 z-40 flex items-center gap-2 rounded-lg px-3 py-2 bg-background-100 border border-background-200 text-xs text-foreground-500 animate-fade-in">
          <div className="w-3.5 h-3.5 border-2 border-primary-400 border-t-transparent rounded-full animate-spin"></div>
          Сохранение...
        </div>
      )}

      {/* Tab content */}
      <div key={activeTab} className="animate-fade-in">
        {activeTab === "profile" && (
          <ProfileTab
            profile={profile}
            onSave={handleProfileSave}
            onNotify={showNotify}
            disabled={saving}
          />
        )}
        {activeTab === "notifications" && (
          <NotificationsTab
            prefs={notifPrefs}
            onSave={handleNotifSave}
            onNotify={showNotify}
            disabled={saving}
          />
        )}
        {activeTab === "appearance" && (
          <AppearanceTab
            appearance={appearance}
            onSave={handleAppearanceSave}
            onNotify={showNotify}
            disabled={saving}
          />
        )}
        {activeTab === "security" && (
          <SecurityTab onNotify={showNotify} disabled={saving} />
        )}
      </div>
    </div>
  );
}
