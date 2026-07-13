// Servers screen — grid of server cards with power actions + confirm modal.
const { Card, IconTile, Badge, Button, Modal, Toast, ProgressBar } =
  window.InspotDesignSystem_abeb6a;

function ServerCard({ s, onAction }) {
  const running = s.status === "running";
  const row = (label, value) => (
    <div
      style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}
    >
      <span style={{ color: "oklch(var(--foreground-500))" }}>{label}</span>
      <span
        style={{
          color: "oklch(var(--foreground-800))",
          fontWeight: 500,
          fontFamily: label === "IP" ? "var(--font-mono)" : "inherit",
        }}
      >
        {value}
      </span>
    </div>
  );
  return (
    <Card padding="none" hover>
      <div
        style={{
          padding: "14px 16px",
          borderBottom: "1px solid oklch(var(--background-100))",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
          }}
        >
          <IconTile icon="ri-server-line" tone="secondary" size="lg" />
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: "var(--font-heading)",
                fontSize: 14,
                fontWeight: 600,
                color: "oklch(var(--foreground-900))",
              }}
            >
              {s.name}
            </div>
            <div
              style={{
                fontSize: 12,
                color: "oklch(var(--foreground-500))",
                fontFamily: "var(--font-mono)",
              }}
            >
              {s.ip}
            </div>
          </div>
        </div>
        {running ? (
          <Badge tone="accent" dot>
            Running
          </Badge>
        ) : (
          <Badge tone="secondary" dot>
            Stopped
          </Badge>
        )}
      </div>
      <div
        style={{
          padding: "12px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        {row("CPU", s.cpu)}
        {row("RAM", s.ram)}
        {row("Disk", s.disk)}
        {row("OS", s.os)}
        {row("Location", s.location)}
      </div>
      <div
        style={{
          padding: "12px 16px",
          borderTop: "1px solid oklch(var(--background-100))",
          display: "flex",
          gap: 8,
        }}
      >
        {running ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon="ri-stop-circle-line"
              onClick={() => onAction(s, "stop")}
            >
              Stop
            </Button>
            <Button
              variant="secondary"
              size="sm"
              icon="ri-restart-line"
              onClick={() => onAction(s, "restart")}
            >
              Restart
            </Button>
          </>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            icon="ri-play-circle-line"
            onClick={() => onAction(s, "start")}
          >
            Start
          </Button>
        )}
      </div>
    </Card>
  );
}

function ServersScreen() {
  const D = window.INSPOT_DATA;
  const [pending, setPending] = React.useState(null); // {server, action}
  const [toast, setToast] = React.useState(null);
  React.useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const ACT = { start: "запущен", stop: "остановлен", restart: "перезагружен" };
  const confirm = () => {
    setToast(`Сервер «${pending.server.name}» ${ACT[pending.action]}.`);
    setPending(null);
  };

  return (
    <div style={{ padding: 24 }}>
      {toast && <Toast variant="success">{toast}</Toast>}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <p
          style={{
            fontSize: 12,
            color: "oklch(var(--foreground-500))",
            margin: 0,
          }}
        >
          {D.servers.length} серверов · Hetzner
        </p>
        <Button variant="ghost" size="sm" icon="ri-refresh-line">
          Обновить
        </Button>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 16,
        }}
      >
        {D.servers.map((s) => (
          <ServerCard
            key={s.id}
            s={s}
            onAction={(server, action) => setPending({ server, action })}
          />
        ))}
      </div>

      <Modal
        open={!!pending}
        onClose={() => setPending(null)}
        title={
          pending
            ? {
                start: "Запустить сервер",
                stop: "Остановить сервер",
                restart: "Перезагрузить сервер",
              }[pending.action]
            : ""
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setPending(null)}>
              Отмена
            </Button>
            <Button variant="primary" onClick={confirm}>
              Подтвердить
            </Button>
          </>
        }
      >
        {pending &&
          `Сервер «${pending.server.name}» будет ${{ start: "запущен", stop: "остановлен", restart: "перезагружен" }[pending.action]}. Возможна кратковременная недоступность сервисов.`}
      </Modal>
    </div>
  );
}

window.ServersScreen = ServersScreen;
