// Inspot app shell: sidebar + topbar. Composes DS components.
const { IconButton, Dropdown, DropdownItem, DropdownSep, DropdownLabel } =
  window.InspotDesignSystem_abeb6a;
const D = window.INSPOT_DATA;

const TITLES = {
  dashboard: "Дашборд",
  servers: "Серверы",
  domains: "Домены",
  monitoring: "Мониторинг",
  backups: "Бэкапы",
  mail: "Почта",
  logs: "Логи",
  alerts: "Оповещения",
  settings: "Настройки",
};

function Shell({
  current,
  onNavigate,
  dark,
  onToggleTheme,
  onLogout,
  children,
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const w = collapsed ? 64 : 256;
  const unackCount = D.alerts.filter((a) => !a.ack).length;

  const navItem = (item) => {
    const active = current === item.path;
    return (
      <button
        key={item.path}
        onClick={() => onNavigate(item.path)}
        title={item.label}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          width: "100%",
          border: "none",
          cursor: "pointer",
          justifyContent: collapsed ? "center" : "flex-start",
          padding: collapsed ? "10px 8px" : "10px 12px",
          borderRadius: "var(--radius-lg)",
          fontFamily: "var(--font-body)",
          fontSize: 14,
          fontWeight: 500,
          whiteSpace: "nowrap",
          background: active ? "oklch(var(--primary-100))" : "transparent",
          color: active
            ? "oklch(var(--primary-700))"
            : "oklch(var(--foreground-600))",
          transition: "background-color .2s, color .2s",
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.background = "oklch(var(--background-100))";
            e.currentTarget.style.color = "oklch(var(--foreground-900))";
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "oklch(var(--foreground-600))";
          }
        }}
      >
        <i className={item.icon} style={{ fontSize: 18, display: "flex" }}></i>
        {!collapsed && <span>{item.label}</span>}
        {!collapsed && item.path === "alerts" && unackCount > 0 && (
          <span
            style={{
              marginLeft: "auto",
              fontSize: 10,
              fontWeight: 600,
              padding: "1px 7px",
              borderRadius: 9999,
              background: "oklch(var(--primary-500))",
              color: "oklch(var(--background-50))",
            }}
          >
            {unackCount}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      style={{
        minHeight: "100%",
        display: "flex",
        background: "oklch(var(--background-50))",
      }}
    >
      {/* Sidebar */}
      <aside
        style={{
          width: w,
          flexShrink: 0,
          borderRight: "1px solid oklch(var(--background-200))",
          display: "flex",
          flexDirection: "column",
          transition: "width .2s",
          position: "sticky",
          top: 0,
          height: "100vh",
        }}
      >
        <div
          style={{
            height: 56,
            display: "flex",
            alignItems: "center",
            justifyContent: collapsed ? "center" : "flex-start",
            padding: collapsed ? 0 : "0 16px",
            borderBottom: "1px solid oklch(var(--background-200))",
          }}
        >
          {collapsed ? (
            <span
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-md)",
                background: "oklch(var(--primary-100))",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 700,
                color: "oklch(var(--primary-700))",
              }}
            >
              In
            </span>
          ) : (
            <span
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 18,
                fontWeight: 700,
                color: "oklch(var(--foreground-900))",
                letterSpacing: "-0.01em",
              }}
            >
              Inspot
            </span>
          )}
        </div>
        <nav
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 12,
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          {D.nav.map(navItem)}
        </nav>
        <div
          style={{
            padding: 12,
            borderTop: "1px solid oklch(var(--background-200))",
          }}
        >
          {navItem({
            path: "settings",
            label: "Настройки",
            icon: "ri-settings-4-line",
          })}
        </div>
      </aside>

      {/* Main */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <header
          style={{
            height: 56,
            flexShrink: 0,
            borderBottom: "1px solid oklch(var(--background-200))",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 16px",
            position: "sticky",
            top: 0,
            background: "oklch(var(--background-50))",
            zIndex: 20,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <IconButton
              icon={collapsed ? "ri-menu-unfold-line" : "ri-menu-fold-line"}
              aria-label="Свернуть"
              onClick={() => setCollapsed((c) => !c)}
            />
            <h2
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 16,
                fontWeight: 600,
                color: "oklch(var(--foreground-900))",
                margin: 0,
              }}
            >
              {TITLES[current]}
            </h2>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <IconButton
              icon={dark ? "ri-sun-line" : "ri-moon-line"}
              aria-label="Тема"
              onClick={onToggleTheme}
            />
            <Dropdown
              align="right"
              trigger={
                <button
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "6px 10px",
                    borderRadius: "var(--radius-lg)",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "oklch(var(--foreground-700))",
                  }}
                >
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 9999,
                      background: "oklch(var(--primary-100))",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 600,
                      color: "oklch(var(--primary-700))",
                    }}
                  >
                    A
                  </span>
                  <span style={{ fontWeight: 500 }}>admin</span>
                  <i
                    className="ri-arrow-down-s-line"
                    style={{ color: "oklch(var(--foreground-400))" }}
                  ></i>
                </button>
              }
            >
              <DropdownLabel>admin · Оператор</DropdownLabel>
              <DropdownItem
                icon="ri-user-line"
                onClick={() => onNavigate("settings")}
              >
                Профиль
              </DropdownItem>
              <DropdownItem
                icon="ri-settings-4-line"
                onClick={() => onNavigate("settings")}
              >
                Настройки
              </DropdownItem>
              <DropdownSep />
              <DropdownItem
                icon="ri-logout-box-r-line"
                danger
                onClick={onLogout}
              >
                Выйти
              </DropdownItem>
            </Dropdown>
          </div>
        </header>
        <main style={{ flex: 1, overflowY: "auto" }}>{children}</main>
      </div>
    </div>
  );
}

window.Shell = Shell;
