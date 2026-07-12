import { useState } from 'react';

interface SecurityTabProps {
  onNotify: (message: string, variant: 'success' | 'error') => void;
  disabled: boolean;
}

interface PasswordForm {
  current: string;
  newPassword: string;
  confirm: string;
}

export function SecurityTab({ onNotify, disabled }: SecurityTabProps) {
  const [passwordForm, setPasswordForm] = useState<PasswordForm>({ current: '', newPassword: '', confirm: '' });
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [sessionCount] = useState(2);
  const [sessions] = useState([
    { id: '1', device: 'Chrome на macOS', ip: '192.168.1.1', location: 'Москва, Россия', lastActive: new Date().toISOString(), current: true },
    { id: '2', device: 'Safari на iPhone', ip: '10.0.0.45', location: 'Москва, Россия', lastActive: new Date(Date.now() - 3600000).toISOString(), current: false },
  ]);

  const handlePasswordChange = (field: keyof PasswordForm, value: string) => {
    setPasswordForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleChangePassword = () => {
    if (!passwordForm.current) {
      onNotify('Введите текущий пароль', 'error');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      onNotify('Новый пароль должен содержать минимум 8 символов', 'error');
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirm) {
      onNotify('Пароли не совпадают', 'error');
      return;
    }
    onNotify('Пароль успешно изменён', 'success');
    setPasswordForm({ current: '', newPassword: '', confirm: '' });
    setShowCurrent(false);
    setShowNew(false);
    setShowConfirm(false);
  };

  const inputClass = 'w-full px-3 py-2.5 rounded-lg border border-background-200 bg-background-50 text-sm text-foreground-900 placeholder:text-foreground-400 focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300 transition-colors pr-10';
  const labelClass = 'block text-xs font-medium text-foreground-500 mb-1.5';

  return (
    <div className="animate-fade-in">
      <div className="max-w-2xl space-y-6">
        {/* Change password */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center">
              <i className="ri-lock-line text-sm text-secondary-600"></i>
            </div>
            <h4 className="font-heading text-sm font-semibold text-foreground-900">Смена пароля</h4>
          </div>

          <div className="space-y-4">
            <div>
              <label className={labelClass} htmlFor="sec-current">Текущий пароль</label>
              <div className="relative">
                <input
                  id="sec-current"
                  type={showCurrent ? 'text' : 'password'}
                  value={passwordForm.current}
                  onChange={(e) => handlePasswordChange('current', e.target.value)}
                  className={inputClass}
                  placeholder="Введите текущий пароль"
                />
                <button
                  onClick={() => setShowCurrent(!showCurrent)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                  aria-label={showCurrent ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  <i className={`${showCurrent ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`}></i>
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="sec-new">Новый пароль</label>
              <div className="relative">
                <input
                  id="sec-new"
                  type={showNew ? 'text' : 'password'}
                  value={passwordForm.newPassword}
                  onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                  className={inputClass}
                  placeholder="Минимум 8 символов"
                />
                <button
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                  aria-label={showNew ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  <i className={`${showNew ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`}></i>
                </button>
              </div>
            </div>

            <div>
              <label className={labelClass} htmlFor="sec-confirm">Подтвердите новый пароль</label>
              <div className="relative">
                <input
                  id="sec-confirm"
                  type={showConfirm ? 'text' : 'password'}
                  value={passwordForm.confirm}
                  onChange={(e) => handlePasswordChange('confirm', e.target.value)}
                  className={inputClass}
                  placeholder="Повторите новый пароль"
                />
                <button
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer"
                  aria-label={showConfirm ? 'Скрыть пароль' : 'Показать пароль'}
                >
                  <i className={`${showConfirm ? 'ri-eye-off-line' : 'ri-eye-line'} text-sm`}></i>
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={handleChangePassword}
            disabled={disabled || !passwordForm.current || !passwordForm.newPassword || !passwordForm.confirm}
            className="mt-4 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-500 text-sm font-semibold text-background-50 hover:bg-primary-600 transition-colors cursor-pointer whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <i className="ri-key-2-line w-4 h-4 flex items-center justify-center"></i>
            Сменить пароль
          </button>
        </div>

        {/* Sessions */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="flex items-center gap-2.5 mb-4">
            <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center">
              <i className="ri-device-line text-sm text-secondary-600"></i>
            </div>
            <div>
              <h4 className="font-heading text-sm font-semibold text-foreground-900">Активные сессии</h4>
              <p className="text-xs text-foreground-400">{sessionCount} активных сессий</p>
            </div>
          </div>

          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                className="flex items-center justify-between py-3 px-3 rounded-lg border border-background-100 bg-background-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center shrink-0">
                    <i className={`${session.current ? 'ri-macbook-line' : 'ri-smartphone-line'} text-sm text-secondary-600`}></i>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground-800">{session.device}</p>
                      {session.current && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent-100 text-[10px] font-semibold text-accent-700 whitespace-nowrap">
                          Текущий
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-foreground-400 mt-0.5">
                      {session.ip} &middot; {session.location} &middot; {new Date(session.lastActive).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            disabled={disabled}
            className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-foreground-500 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer whitespace-nowrap"
          >
            <i className="ri-logout-box-r-line w-4 h-4 flex items-center justify-center"></i>
            Завершить другие сессии
          </button>
        </div>

        {/* 2FA placeholder */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-secondary-100 flex items-center justify-center">
                <i className="ri-shield-keyhole-line text-sm text-secondary-600"></i>
              </div>
              <div>
                <h4 className="font-heading text-sm font-semibold text-foreground-900">Двухфакторная аутентификация</h4>
                <p className="text-xs text-foreground-400">Дополнительная защита аккаунта через приложение-аутентификатор</p>
              </div>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 text-[10px] font-semibold text-amber-700 whitespace-nowrap">
              <i className="ri-time-line w-3 h-3 flex items-center justify-center"></i>
              Скоро
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}