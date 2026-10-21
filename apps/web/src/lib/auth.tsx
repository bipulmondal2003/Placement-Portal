'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';

export type Role = 'student' | 'faculty' | 'placement_officer' | 'placement_head' | 'recruiter' | 'admin';
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  department?: string;
  company?: string;
}

interface AuthState {
  user: SessionUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string, portal?: 'app' | 'recruiter') => Promise<SessionUser>;
  logout: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export const HOME: Record<Role, string> = {
  student: '/student',
  faculty: '/faculty',
  placement_officer: '/officer',
  placement_head: '/head',
  admin: '/admin',
  recruiter: '/recruiter',
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get<{ user: SessionUser } | SessionUser>('/auth/me');
      setUser('user' in (res as any) ? (res as any).user : (res as SessionUser));
    } catch (e) {
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) setUser(null);
      else setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string, portal: 'app' | 'recruiter' = 'app') => {
    const res = await api.post<{ user: SessionUser }>(portal === 'app' ? '/auth/login' : '/auth/recruiter/login', { email, password });
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      setUser(null);
    }
  }, []);

  return <Ctx.Provider value={{ user, loading, refresh, login, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
