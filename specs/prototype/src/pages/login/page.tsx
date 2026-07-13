import { useState, useEffect, useRef, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

const LOGOUT_FLAG_KEY = "inspot_logged_out";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isAuthenticated, isLoading, error, login, clearError } = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [logoutNotice, setLogoutNotice] = useState(false);

  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(LOGOUT_FLAG_KEY) === "1") {
        localStorage.removeItem(LOGOUT_FLAG_KEY);
        setLogoutNotice(true);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      const next = searchParams.get("next");
      navigate(next || "/bookmarks", { replace: true });
    }
  }, [isAuthenticated, navigate, searchParams]);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    login(username.trim(), password);
  };

  useEffect(() => {
    if (error) {
      usernameRef.current?.focus();
    }
  }, [error]);

  const isFormValid = username.trim().length > 0 && password.length > 0;

  return (
    <div className="min-h-screen flex items-center justify-center bg-background-50 px-4">
      <div className="w-full max-w-sm animate-scale-in">
        <div className="text-center mb-8">
          <h1 className="font-heading text-2xl font-bold text-foreground-900">
            Inspot
          </h1>
          <p className="mt-1 text-sm text-foreground-500">Панель управления</p>
        </div>

        {logoutNotice && (
          <div
            className="mb-6 flex items-center gap-2 rounded-lg bg-accent-100/80 px-4 py-3 text-sm text-accent-800 animate-fade-in"
            role="status"
          >
            <i className="ri-check-line w-5 h-5 flex items-center justify-center shrink-0"></i>
            <span>Вы вышли из системы</span>
          </div>
        )}

        {error && (
          <div
            className="mb-6 flex items-center gap-2 rounded-lg bg-primary-100/70 px-4 py-3 text-sm text-primary-800 animate-fade-in"
            role="alert"
          >
            <i className="ri-error-warning-line w-5 h-5 flex items-center justify-center shrink-0"></i>
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-foreground-700 mb-1.5"
            >
              Имя пользователя
            </label>
            <input
              ref={usernameRef}
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                if (error) clearError();
              }}
              disabled={isLoading}
              className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
              placeholder="admin"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-foreground-700 mb-1.5"
            >
              Пароль
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) clearError();
                }}
                disabled={isLoading}
                className="w-full rounded-lg border border-background-300 bg-background-50 px-3.5 py-2.5 pr-10 text-sm text-foreground-900 placeholder:text-foreground-300 outline-none transition-colors focus:border-primary-400 focus:ring-1 focus:ring-primary-400 disabled:opacity-50"
                placeholder="········"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLoading}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-600 transition-colors cursor-pointer disabled:opacity-50"
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                <i
                  className={`${showPassword ? "ri-eye-off-line" : "ri-eye-line"} text-base`}
                ></i>
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={!isFormValid || isLoading}
            className="w-full rounded-lg bg-primary-500 px-4 py-2.5 text-sm font-semibold text-background-50 transition-colors hover:bg-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <i className="ri-loader-4-line animate-spin text-base"></i>
                Вход...
              </span>
            ) : (
              "Войти"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
