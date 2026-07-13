// Settings screen — tabbed (underline), appearance controls.
const { SegmentedControl, Card, Switch, Button, Input, Toast, IconTile } =
  window.InspotDesignSystem_abeb6a;

function SettingsScreen({ dark, onToggleTheme }) {
  const [tab, setTab] = React.useState("appearance");
  const [compact, setCompact] = React.useState(false);
  const [timestamps, setTimestamps] = React.useState(true);
  const [mono, setMono] = React.useState(true);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [interval, setIntervalV] = React.useState("30");
  const [toast, setToast] = React.useState(false);
  React.useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(false), 2500);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const tabs = [
    { value: "profile", label: "Профиль", icon: "ri-user-line" },
    {
      value: "notifications",
      label: "Уведомления",
      icon: "ri-notification-3-line",
    },
    { value: "appearance", label: "Оформление", icon: "ri-palette-line" },
    { value: "security", label: "Безопасность", icon: "ri-shield-check-line" },
  ];

  const themeCard = (val, label, desc, icon) => {
    const active = (val === "dark") === dark && val !== "system";
    return (
      <button
        onClick={() => {
          if ((val === "dark") !== dark) onToggleTheme();
        }}
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          padding: 16,
          borderRadius: "var(--radius-xl)",
          cursor: "pointer",
          textAlign: "center",
          border: `1px solid oklch(var(--${active ? "primary-300" : "background-200"}))`,
          background: active ? "oklch(var(--primary-50) / .5)" : "transparent",
        }}
      >
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 18,
            background: `oklch(var(--${active ? "primary-100" : "secondary-100"}))`,
            color: `oklch(var(--${active ? "primary-600" : "secondary-600"}))`,
          }}
        >
          <i className={icon}></i>
        </span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "oklch(var(--foreground-800))",
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 10,
            color: "oklch(var(--foreground-400))",
            lineHeight: 1.3,
          }}
        >
          {desc}
        </span>
      </button>
    );
  };

  const intervals = [
    { value: "10", label: "10 секунд" },
    { value: "30", label: "30 секунд" },
    { value: "60", label: "1 минута" },
    { value: "300", label: "5 минут" },
  ];

  return (
    <div style={{ padding: 24 }}>
      {toast && <Toast variant="success">Настройки оформления сохранены</Toast>}
      <div style={{ marginBottom: 28 }}>
        <SegmentedControl
          variant="underline"
          value={tab}
          onChange={setTab}
          options={tabs}
        />
      </div>

      {tab === "appearance" && (
        <div
          style={{
            maxWidth: 640,
            display: "flex",
            flexDirection: "column",
            gap: 20,
          }}
        >
          <Card padding="md">
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 600,
                color: "oklch(var(--foreground-900))",
                margin: "0 0 16px",
              }}
            >
              Тема оформления
            </h4>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr)",
                gap: 12,
              }}
            >
              {themeCard(
                "system",
                "Системная",
                "По настройкам ОС",
                "ri-contrast-2-line",
              )}
              {themeCard(
                "light",
                "Светлая",
                "Всегда светлая тема",
                "ri-sun-line",
              )}
              {themeCard(
                "dark",
                "Тёмная",
                "Всегда тёмная тема",
                "ri-moon-line",
              )}
            </div>
          </Card>

          <Card padding="md">
            <h4
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 600,
                color: "oklch(var(--foreground-900))",
                margin: "0 0 12px",
              }}
            >
              Интерфейс
            </h4>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {[
                [
                  "Компактный режим",
                  "Уменьшенные отступы и размеры",
                  compact,
                  setCompact,
                ],
                [
                  "Метки времени",
                  "Показывать относительное время",
                  timestamps,
                  setTimestamps,
                ],
                [
                  "Моноширинные шрифты",
                  "Мон-шрифт в логах и деталях",
                  mono,
                  setMono,
                ],
              ].map(([t, d, v, set]) => (
                <div
                  key={t}
                  style={{
                    padding: "10px 12px",
                    borderRadius: "var(--radius-lg)",
                  }}
                >
                  <Switch
                    label={t}
                    description={d}
                    checked={v}
                    onChange={set}
                  />
                </div>
              ))}
            </div>
          </Card>

          <Card padding="md">
            <Switch
              label="Автообновление"
              description="Автоматически обновлять данные на страницах"
              checked={autoRefresh}
              onChange={setAutoRefresh}
            />
            {autoRefresh && (
              <div
                style={{
                  marginTop: 16,
                  paddingTop: 16,
                  borderTop: "1px solid oklch(var(--background-100))",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: "oklch(var(--foreground-500))",
                    marginBottom: 10,
                  }}
                >
                  Интервал обновления
                </div>
                <SegmentedControl
                  variant="pill"
                  value={interval}
                  onChange={setIntervalV}
                  options={intervals}
                />
              </div>
            )}
          </Card>

          <div>
            <Button
              variant="primary"
              icon="ri-check-line"
              onClick={() => setToast(true)}
            >
              Сохранить изменения
            </Button>
          </div>
        </div>
      )}

      {tab === "profile" && (
        <div
          style={{
            maxWidth: 520,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <Card padding="md">
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                marginBottom: 20,
              }}
            >
              <span
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 9999,
                  background: "oklch(var(--primary-100))",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 700,
                  color: "oklch(var(--primary-700))",
                  fontFamily: "var(--font-heading)",
                }}
              >
                A
              </span>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 600,
                    color: "oklch(var(--foreground-900))",
                  }}
                >
                  admin
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: "oklch(var(--foreground-500))",
                  }}
                >
                  Оператор · admin@inspot.app
                </div>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <Input label="Имя пользователя" defaultValue="admin" />
              <Input label="Email" defaultValue="admin@inspot.app" />
            </div>
          </Card>
          <div>
            <Button
              variant="primary"
              icon="ri-check-line"
              onClick={() => setToast(true)}
            >
              Сохранить
            </Button>
          </div>
        </div>
      )}

      {(tab === "notifications" || tab === "security") && (
        <div style={{ maxWidth: 520 }}>
          <Card padding="md">
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <Switch
                label={
                  tab === "security"
                    ? "Двухфакторная аутентификация"
                    : "Email-уведомления"
                }
                description={
                  tab === "security"
                    ? "Требовать код при входе"
                    : "Присылать оповещения на почту"
                }
                checked
                onChange={() => {}}
              />
              <Switch
                label={
                  tab === "security"
                    ? "Сессии на всех устройствах"
                    : "Критические оповещения"
                }
                description={
                  tab === "security"
                    ? "Выходить со всех сессий при смене пароля"
                    : "Мгновенные push при сбоях"
                }
                checked={false}
                onChange={() => {}}
              />
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

window.SettingsScreen = SettingsScreen;
