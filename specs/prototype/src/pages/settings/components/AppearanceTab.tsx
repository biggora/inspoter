import { useState } from "react";
import type { AppearanceSettings, ThemeMode } from "@/mocks/settings";
import { useTheme } from "@/hooks/useTheme";

interface AppearanceTabProps {
  appearance: AppearanceSettings;
  onSave: (appearance: AppearanceSettings) => void;
  onNotify: (message: string, variant: "success" | "error") => void;
  disabled: boolean;
}

const themeOptions: {
  value: ThemeMode;
  label: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "system",
    label: "Системная",
    description: "Автоматически переключается в зависимости от настроек ОС",
    icon: "ri-contrast-2-line",
  },
  {
    value: "light",
    label: "Светлая",
    description: "Всегда светлая тема оформления",
    icon: "ri-sun-line",
  },
  {
    value: "dark",
    label: "Тёмная",
    description: "Всегда тёмная тема оформления",
    icon: "ri-moon-line",
  },
];

const refreshIntervals = [
  { value: 10, label: "10 секунд" },
  { value: 30, label: "30 секунд" },
  { value: 60, label: "1 минута" },
  { value: 120, label: "2 минуты" },
  { value: 300, label: "5 минут" },
];

export function AppearanceTab({
  appearance,
  onSave,
  onNotify,
  disabled,
}: AppearanceTabProps) {
  const { themeMode, setThemeMode } = useTheme();
  const [form, setForm] = useState<AppearanceSettings>({
    ...appearance,
    themeMode,
  });
  const [isDirty, setIsDirty] = useState(false);

  // Sync form themeMode when context changes externally (e.g. from topbar toggle)
  const [prevContextTheme, setPrevContextTheme] = useState(themeMode);
  if (themeMode !== prevContextTheme) {
    setPrevContextTheme(themeMode);
    setForm((prev) => ({ ...prev, themeMode }));
  }

  const handleThemeChange = (mode: ThemeMode) => {
    setThemeMode(mode);
    setForm((prev) => ({ ...prev, themeMode: mode }));
    setIsDirty(true);
  };

  const handleToggle = (field: keyof AppearanceSettings) => {
    setForm((prev) => ({ ...prev, [field]: !prev[field] }));
    setIsDirty(true);
  };

  const handleIntervalChange = (value: number) => {
    setForm((prev) => ({ ...prev, autoRefreshInterval: value }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(form);
    setIsDirty(false);
    onNotify("Настройки оформления сохранены", "success");
  };

  const handleCancel = () => {
    setForm({ ...appearance });
    setIsDirty(false);
  };

  return (
    <div className="animate-fade-in">
      <div className="max-w-2xl space-y-6">
        {/* Theme mode */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <h4 className="font-heading text-sm font-semibold text-foreground-900 mb-4">
            Тема оформления
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {themeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => handleThemeChange(opt.value)}
                disabled={disabled}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border text-center transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.themeMode === opt.value
                    ? "border-primary-300 bg-primary-50/50"
                    : "border-background-200 hover:border-background-300 hover:bg-background-100/50"
                }`}
              >
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    form.themeMode === opt.value
                      ? "bg-primary-100 text-primary-600"
                      : "bg-secondary-100 text-secondary-600"
                  }`}
                >
                  <i className={`${opt.icon} text-lg`}></i>
                </div>
                <span className="text-sm font-medium text-foreground-800">
                  {opt.label}
                </span>
                <span className="text-[10px] text-foreground-400 leading-tight">
                  {opt.description}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Toggles */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <h4 className="font-heading text-sm font-semibold text-foreground-900 mb-1">
            Интерфейс
          </h4>
          <div className="space-y-1 mt-3">
            <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-background-100/60 transition-colors">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-foreground-800">
                  Компактный режим
                </p>
                <p className="text-xs text-foreground-400 mt-0.5">
                  Уменьшенные отступы и размеры элементов
                </p>
              </div>
              <button
                onClick={() => handleToggle("compactMode")}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.compactMode ? "bg-accent-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={form.compactMode}
                aria-label="Компактный режим"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                    form.compactMode ? "translate-x-6" : "translate-x-1"
                  }`}
                ></span>
              </button>
            </div>

            <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-background-100/60 transition-colors">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-foreground-800">
                  Метки времени
                </p>
                <p className="text-xs text-foreground-400 mt-0.5">
                  Показывать относительное время (5 мин назад)
                </p>
              </div>
              <button
                onClick={() => handleToggle("showTimestamps")}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.showTimestamps ? "bg-accent-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={form.showTimestamps}
                aria-label="Метки времени"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                    form.showTimestamps ? "translate-x-6" : "translate-x-1"
                  }`}
                ></span>
              </button>
            </div>

            <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-background-100/60 transition-colors">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-foreground-800">
                  Моноширинные шрифты
                </p>
                <p className="text-xs text-foreground-400 mt-0.5">
                  Использовать моноширинный шрифт в логах и деталях
                </p>
              </div>
              <button
                onClick={() => handleToggle("monospaceFonts")}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.monospaceFonts ? "bg-accent-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={form.monospaceFonts}
                aria-label="Моноширинные шрифты"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                    form.monospaceFonts ? "translate-x-6" : "translate-x-1"
                  }`}
                ></span>
              </button>
            </div>

            <div className="flex items-center justify-between py-3 px-3 rounded-lg hover:bg-background-100/60 transition-colors">
              <div className="flex-1 min-w-0 mr-4">
                <p className="text-sm font-medium text-foreground-800">
                  Свёрнутый сайдбар
                </p>
                <p className="text-xs text-foreground-400 mt-0.5">
                  Сайдбар по умолчанию свёрнут
                </p>
              </div>
              <button
                onClick={() => handleToggle("sidebarCollapsed")}
                disabled={disabled}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  form.sidebarCollapsed ? "bg-accent-500" : "bg-background-300"
                }`}
                role="switch"
                aria-checked={form.sidebarCollapsed}
                aria-label="Свёрнутый сайдбар"
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                    form.sidebarCollapsed ? "translate-x-6" : "translate-x-1"
                  }`}
                ></span>
              </button>
            </div>
          </div>
        </div>

        {/* Auto-refresh */}
        <div className="rounded-xl border border-background-200 bg-background-50 p-5">
          <div className="flex items-center justify-between py-1">
            <div className="flex-1 min-w-0 mr-4">
              <h4 className="font-heading text-sm font-semibold text-foreground-900">
                Автообновление
              </h4>
              <p className="text-xs text-foreground-400 mt-0.5">
                Автоматически обновлять данные на страницах
              </p>
            </div>
            <button
              onClick={() => handleToggle("autoRefresh")}
              disabled={disabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                form.autoRefresh ? "bg-accent-500" : "bg-background-300"
              }`}
              role="switch"
              aria-checked={form.autoRefresh}
              aria-label="Автообновление"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-background-50 transition-transform duration-200 ${
                  form.autoRefresh ? "translate-x-6" : "translate-x-1"
                }`}
              ></span>
            </button>
          </div>

          {form.autoRefresh && (
            <div className="mt-4 pt-4 border-t border-background-100 animate-fade-in">
              <label className="block text-xs font-medium text-foreground-500 mb-2">
                Интервал обновления
              </label>
              <div className="flex flex-wrap gap-2">
                {refreshIntervals.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => handleIntervalChange(opt.value)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      form.autoRefreshInterval === opt.value
                        ? "bg-primary-500 text-background-50"
                        : "text-foreground-600 hover:text-foreground-900 hover:bg-background-100 border border-background-200"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

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
