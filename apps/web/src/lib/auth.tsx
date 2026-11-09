import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { api, tokenStore, Me } from './api';

interface AuthState {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  can: (permission: string) => boolean;
}

const Ctx = createContext<AuthState>(null as unknown as AuthState);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tokenStore.get()) { setLoading(false); return; }
    api.get<Me>('/auth/me')
      .then(setMe)
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const res = await api.post<{ token: string }>('/auth/login', { email, password });
    tokenStore.set(res.token);
    setMe(await api.get<Me>('/auth/me'));
  };

  const logout = async () => {
    try { await api.post('/auth/logout'); } catch { /* ignore */ }
    tokenStore.clear();
    setMe(null);
  };

  // Owner implicitly holds everything (mirrors the server rule).
  const can = (permission: string) =>
    !!me && (me.roles.includes('tenant_owner') || me.permissions.includes(permission));

  return <Ctx.Provider value={{ me, loading, login, logout, can }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
