import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { MOCK_CREDENTIALS, AUTH_STORAGE_KEY } from '@/mocks/auth';

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

function getStoredAuth(): boolean {
  try {
    return localStorage.getItem(AUTH_STORAGE_KEY) === 'authenticated';
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(getStoredAuth);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const login = useCallback(async (username: string, password: string) => {
    setIsLoading(true);
    setError(null);

    await new Promise((resolve) => setTimeout(resolve, 800));

    if (username === MOCK_CREDENTIALS.username && password === MOCK_CREDENTIALS.password) {
      try {
        localStorage.setItem(AUTH_STORAGE_KEY, 'authenticated');
      } catch {
        // ignore storage errors
      }
      setIsAuthenticated(true);
    } else {
      setError('Неверное имя пользователя или пароль.');
    }

    setIsLoading(false);
  }, []);

  const logout = useCallback(() => {
    try {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
    setIsAuthenticated(false);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, error, login, logout, clearError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}