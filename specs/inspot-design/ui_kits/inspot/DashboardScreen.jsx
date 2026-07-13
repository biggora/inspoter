// Dashboard screen.
const { StatCard, Card, IconTile, Badge, ProgressBar, Button } =
  window.InspotDesignSystem_abeb6a;

function WidgetLink({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        border: "none",
        background: "transparent",
        cursor: "pointer",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        fontWeight: 500,
        color: "oklch(var(--foreground-400))",
        whiteSpace: "nowrap",
      }}
      onMouseEnter={(e) =>
        (e.currentTarget.style.color = "oklch(var(--foreground-700))")
      }
      onMouseLeave={(e) =>
        (e.currentTarget.style.color = "oklch(var(--foreground-400))")
      }
    >
      {label}
      <i className="ri-arrow-right-line"></i>
    </button>
  );
}

function DashboardScreen({ onNavigate }) {
  const D = window.INSPOT_DATA;
  const online = D.servers.filter((s) => s.status === "running").length;
  const th = {
    textAlign: "left",
    padding: "10px 0",
    fontSize: 11,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    color: "oklch(var(--foreground-400))",
    borderBottom: "1px solid oklch(var(--background-100))",
  };
  const td = {
    padding: "12px 0",
    borderBottom: "1px solid oklch(var(--background-100))",
    fontSize: 13,
  };

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <div>
          <h2
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 20,
              fontWeight: 700,
              color: "oklch(var(--foreground-950))",
              margin: 0,
            }}
          >
            Дашборд
          </h2>
          <p
            style={{
              fontSize: 12,
              color: "oklch(var(--foreground-400))",
              margin: "4px 0 0",
            }}
          >
            Обзорное состояние всей инфраструктуры Inspot
          </p>
        </div>
        <Button variant="ghost" size="sm" icon="ri-refresh-line">
          Обновить
        </Button>
      </div>

      {/* Stat row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: 16,
          marginBottom: 24,
        }}
      >
        <StatCard
          icon="ri-server-line"
          label="Серверы"
          value={online}
          sub={D.servers.length}
          subtitle="в сети"
          tone="accent"
          onClick={() => onNavigate("servers")}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "oklch(var(--accent-600))",
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 9999,
                background: "oklch(var(--accent-500))",
              }}
            ></span>
            {online} online
          </span>
        </StatCard>
        <StatCard
          icon="ri-global-line"
          label="Домены"
          value={3}
          sub={4}
          subtitle="активны"
          tone="primary"
          onClick={() => onNavigate("domains")}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              fontSize: 11,
              color: "oklch(var(--amber-700))",
              fontWeight: 500,
            }}
          >
            <i className="ri-timer-line"></i>1 истекает
          </span>
        </StatCard>
        <StatCard
          icon="ri-alert-line"
          label="Оповещения"
          value={4}
          subtitle="не подтверждены"
          tone="amber"
          onClick={() => onNavigate("alerts")}
        >
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              fontSize: 11,
              color: "oklch(var(--red-600))",
              fontWeight: 500,
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: 9999,
                background: "oklch(var(--red-500))",
              }}
            ></span>
            2 крит.
          </span>
        </StatCard>
        <StatCard
          icon="ri-mail-line"
          label="Почта"
          value={2}
          sub={4}
          subtitle="не прочитано"
          tone="secondary"
          onClick={() => onNavigate("mail")}
        >
          <ProgressBar value={50} tone="secondary" />
        </StatCard>
      </div>

      {/* 2-col widgets */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <Card
          title="Состояние серверов"
          icon={<IconTile icon="ri-server-line" tone="secondary" size="sm" />}
          action={
            <WidgetLink
              label="Все серверы"
              onClick={() => onNavigate("servers")}
            />
          }
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={th}>Сервер</th>
                <th style={th}>Статус</th>
                <th style={{ ...th, textAlign: "right" }}>CPU</th>
                <th style={{ ...th, textAlign: "right" }}>RAM</th>
              </tr>
            </thead>
            <tbody>
              {D.servers.slice(0, 5).map((s) => (
                <tr key={s.id}>
                  <td style={td}>
                    <div
                      style={{
                        fontWeight: 500,
                        color: "oklch(var(--foreground-900))",
                      }}
                    >
                      {s.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "oklch(var(--foreground-400))",
                      }}
                    >
                      {s.location}
                    </div>
                  </td>
                  <td style={td}>
                    {s.status === "running" ? (
                      <Badge tone="accent" size="sm" dot>
                        Онлайн
                      </Badge>
                    ) : (
                      <Badge tone="secondary" size="sm" dot>
                        Остановлен
                      </Badge>
                    )}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontWeight: 500,
                      color: "oklch(var(--foreground-700))",
                    }}
                  >
                    {s.status === "running" ? s.cpuPct + "%" : "—"}
                  </td>
                  <td
                    style={{
                      ...td,
                      textAlign: "right",
                      fontWeight: 500,
                      color: "oklch(var(--foreground-700))",
                    }}
                  >
                    {s.status === "running" ? s.ramPct + "%" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        <Card
          title="Последние оповещения"
          icon={<IconTile icon="ri-alert-line" tone="secondary" size="sm" />}
          action={
            <WidgetLink
              label="Все оповещения"
              onClick={() => onNavigate("alerts")}
            />
          }
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {D.alerts.map((a) => {
              const sev =
                a.severity === "critical"
                  ? { tone: "red", icon: "ri-close-circle-fill" }
                  : { tone: "amber", icon: "ri-alert-fill" };
              return (
                <div
                  key={a.id}
                  onClick={() => onNavigate("alerts")}
                  style={{
                    display: "flex",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-lg)",
                    cursor: "pointer",
                    background: "oklch(var(--background-100) / .6)",
                    borderLeft: `3px solid oklch(var(--${sev.tone === "red" ? "primary" : "amber"}-500))`,
                  }}
                >
                  <IconTile icon={sev.icon} tone={sev.tone} size="sm" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "oklch(var(--foreground-900))",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {a.title}
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 2,
                        fontSize: 10,
                        color: "oklch(var(--foreground-500))",
                      }}
                    >
                      <span>{a.source}</span>
                      <span style={{ color: "oklch(var(--foreground-400))" }}>
                        {a.ago}
                      </span>
                      <span
                        style={{
                          color: `oklch(var(--${sev.tone === "red" ? "primary" : "amber"}-700))`,
                          fontWeight: 500,
                        }}
                      >
                        Не подтверждено
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Domains widget */}
      <div style={{ marginTop: 20 }}>
        <Card
          title="Состояние доменов"
          icon={<IconTile icon="ri-global-line" tone="secondary" size="sm" />}
          action={
            <WidgetLink
              label="Все домены"
              onClick={() => onNavigate("domains")}
            />
          }
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}
          >
            {D.domains.map((d) => {
              const cfg =
                d.health === "good"
                  ? { tone: "accent" }
                  : d.health === "warning"
                    ? { tone: "amber" }
                    : { tone: "red" };
              return (
                <div
                  key={d.id}
                  onClick={() => onNavigate("domains")}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    padding: "10px 12px",
                    borderRadius: "var(--radius-lg)",
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "oklch(var(--background-100) / .5)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = "transparent")
                  }
                >
                  <IconTile icon="ri-global-line" tone="secondary" size="sm" />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "oklch(var(--foreground-900))",
                      }}
                    >
                      {d.name}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        color: "oklch(var(--foreground-400))",
                      }}
                    >
                      {d.provider} · {d.registrar}
                    </div>
                  </div>
                  <Badge tone={cfg.tone} size="sm" dot>
                    {d.label}
                  </Badge>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

window.DashboardScreen = DashboardScreen;
