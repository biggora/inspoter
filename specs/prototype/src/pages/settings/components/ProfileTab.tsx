import { useState } from 'react';
import type { UserProfile } from '@/mocks/settings';

interface ProfileTabProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  onNotify: (message: string, variant: 'success' | 'error') => void;
  disabled: boolean;
}

export function ProfileTab({ profile, onSave, onNotify, disabled }: ProfileTabProps) {
  const [form, setForm] = useState<UserProfile>({ ...profile });
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (field: keyof UserProfile, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    const cleanEmail = form.email.trim();
    if (!cleanEmail.includes('@')) {
      onNotify('Введите корректный email', 'error');
      return;
    }
    onSave(form);
    setIsDirty(false);
  };

  const handleCancel = () => {
    setForm({ ...profile });
    setIsDirty(false);
  };

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-background-200 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors';
  const labelClass = 'block text-xs font-medium text-foreground-500 mb-1.5';

  return (
    <div className="animate-fade-in">
      <div className="max-w-2xl">
        {/* Avatar section */}
        <div className="flex items-center gap-5 mb-8 p-5 rounded-xl border border-background-200 bg-background-50">
          <div className="w-20 h-20 rounded-full bg-primary-100 flex items-center justify-center shrink-0">
            <span className="text-2xl font-heading font-bold text-primary-700">{form.avatarInitials}</span>
          </div>
          <div>
            <h4 className="font-heading text-base font-semibold text-foreground-900">{form.name}</h4>
            <p className="text-sm text-foreground-500">{form.role}</p>
            <p className="text-xs text-foreground-400 mt-1">{form.company} &middot; {form.position}</p>
          </div>
        </div>

        {/* Form fields */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="profile-name">Имя</label>
              <input id="profile-name" type="text" value={form.name} onChange={(e) => handleChange('name', e.target.value)} className={inputClass} placeholder="Ваше имя" />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-username">Логин</label>
              <input id="profile-username" type="text" value={form.username} onChange={(e) => handleChange('username', e.target.value)} className={inputClass} placeholder="Логин" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="profile-email">Email</label>
              <input id="profile-email" type="email" value={form.email} onChange={(e) => handleChange('email', e.target.value)} className={inputClass} placeholder="email@example.com" />
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-phone">Телефон</label>
              <input id="profile-phone" type="text" value={form.phone} onChange={(e) => handleChange('phone', e.target.value)} className={inputClass} placeholder="+7 (999) 123-45-67" />
            </div>
          </div>

          <div>
            <label className={labelClass} htmlFor="profile-bio">О себе</label>
            <textarea id="profile-bio" value={form.bio} onChange={(e) => handleChange('bio', e.target.value)} rows={3} className={`${inputClass} resize-none`} placeholder="Краткая информация о себе" maxLength={500}></textarea>
            <p className="text-[10px] text-foreground-400 mt-1 text-right">{form.bio.length}/500</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className={labelClass} htmlFor="profile-timezone">Часовой пояс</label>
              <select id="profile-timezone" value={form.timezone} onChange={(e) => handleChange('timezone', e.target.value)} className={inputClass}>
                <option value="Europe/Moscow">Europe/Moscow (GMT+3)</option>
                <option value="Europe/Kaliningrad">Europe/Kaliningrad (GMT+2)</option>
                <option value="Europe/Samara">Europe/Samara (GMT+4)</option>
                <option value="Asia/Yekaterinburg">Asia/Yekaterinburg (GMT+5)</option>
                <option value="Asia/Novosibirsk">Asia/Novosibirsk (GMT+7)</option>
                <option value="Europe/London">Europe/London (GMT+0)</option>
              </select>
            </div>
            <div>
              <label className={labelClass} htmlFor="profile-position">Должность</label>
              <input id="profile-position" type="text" value={form.position} onChange={(e) => handleChange('position', e.target.value)} className={inputClass} placeholder="Должность" />
            </div>
          </div>
        </div>

        {/* Info */}
        <div className="mt-5 flex items-center gap-4 text-xs text-foreground-400">
          <span>В команде с {new Date(form.joinedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}</span>
          <span>&middot;</span>
          <span>Активен: {new Date(form.lastActive).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        </div>

        {/* Actions */}
        {isDirty && (
          <div className="flex items-center gap-3 mt-6 pt-5 border-t border-background-200">
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