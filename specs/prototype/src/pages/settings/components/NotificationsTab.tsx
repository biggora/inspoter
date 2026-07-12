import { useState } from 'react';
import type { NotificationPrefs } from '@/mocks/settings';
import { notificationLabels, notificationGroups } from '@/mocks/settings';

interface NotificationsTabProps {
  prefs: NotificationPrefs;
  onSave: (prefs: NotificationPrefs) => void;
  onNotify: (message: string, variant: 'success' | 'error') => void;
  disabled: boolean;
}

export function NotificationsTab({ prefs, onSave, onNotify, disabled }: NotificationsTabProps) {
  const [form, setForm] = useState<NotificationPrefs>({ ...prefs });
  const [isDirty, setIsDirty] = useState(false);

  const handleToggle = (key: keyof NotificationPrefs) => {
    setForm((prev) => ({ ...prev, [key]: !prev[key] }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(form);
    setIsDirty(false);
    onNotify('Настройки уведомлений сохранены', 'success');
  };

  const handleCancel = () => {
    setForm({ ...prefs });
    setIsDirty(false);
  };

  const groupedPrefs = notificationGroups.map((group) => {
    const keys = (Object.keys(notificationLabels) as (keyof NotificationPrefs)[]).filter(
      (k) => notificationLabels[k].group === group.key
    );
    return { ...group, keys };
  });

  return (
    <div className="animate-fade-in">
      <div className="max-w-2xl space-y-6">
        {groupedPrefs.map((group) => (
          <div key={group.key} className="rounded-xl border border-background-200 bg-background-50 p-5">
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center">
                <i className={`${group.icon} text-sm text-secondary-600`}></i>
              </div>
              <h4 className="font-heading text-sm font-semibold text-foreground-900">{group.label}</h4>
            </div>

            <div className="space-y-1">
              {group.keys.map((key) => {
                const info = notificationLabels[key];
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-background-100/60 transition-colors"
                  >
                    <div className="flex-1 min-w-0 mr-4">
                      <p className="text-sm font-medium text-foreground-800">{info.label}</p>
                      <p className="text-xs text-foreground-400 mt-0.5">{info.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggle(key)}
                      disabled={disabled}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                        form[key] ? 'bg-accent-500' : 'bg-background-300'
                      }`}
                      role="switch"
                      aria-checked={form[key]}
                      aria-label={info.label}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                          form[key] ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      ></span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {/* Actions */}
        {isDirty && (
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={disabled}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="ri-check-line w-4 h-4 flex items-center justify-center"></i>
              Сохранить изменения
            </button>
            <button
              onClick={handleCancel}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium text-foreground-600 hover:text-foreground-900 hover:bg-background-100 transition-colors cursor-pointer whitespace-nowrap"
            >
              Отмена
            </button>
          </div>
        )}
      </div>
    </div>
  );
}