// Login screen + placeholder for screens not included in this kit.
const { Input, Button, EmptyState } = window.InspotDesignSystem_abeb6a;

function LoginScreen({ onLogin }) {
  const [user, setUser] = React.useState("admin");
  const [pw, setPw] = React.useState("demo1234");
  const [show, setShow] = React.useState(false);
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "oklch(var(--background-50))",
        padding: 16,
      }}
    >
      <div style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1
            style={{
              fontFamily: "var(--font-heading)",
              fontSize: 26,
              fontWeight: 700,
              color: "oklch(var(--foreground-900))",
              margin: 0,
            }}
          >
            Inspot
          </h1>
          <p
            style={{
              fontSize: 14,
              color: "oklch(var(--foreground-500))",
              margin: "4px 0 0",
            }}
          >
            Панель управления
          </p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onLogin();
          }}
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <Input
            label="Имя пользователя"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="admin"
          />
          <Input
            label="Пароль"
            type={show ? "text" : "password"}
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            trailingIcon={show ? "ri-eye-off-line" : "ri-eye-line"}
            onTrailingClick={() => setShow(!show)}
          />
          <Button variant="primary" size="lg" block type="submit">
            Войти
          </Button>
        </form>
      </div>
    </div>
  );
}

function PlaceholderScreen({ title }) {
  return (
    <div
      style={{
        minHeight: "calc(100vh - 56px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
    >
      <EmptyState
        icon="ri-layout-grid-line"
        tone="secondary"
        title={title}
        description="Экран не включён в этот UI-kit. Дашборд, Серверы, Логи и Настройки — полностью интерактивны."
      />
    </div>
  );
}

window.LoginScreen = LoginScreen;
window.PlaceholderScreen = PlaceholderScreen;
