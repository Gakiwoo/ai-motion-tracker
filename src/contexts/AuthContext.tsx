import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types/auth';
import AuthService, { AuthError } from '../services/AuthService';

// ── Context 类型 ──
interface AuthContextType {
  user: User | null;
  isLoading: boolean;         // 初始恢复 session 中
  isAuthenticating: boolean;  // 登录/注册请求中
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, nickname: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
  updateUser: (user: User) => void;        // 本地直接更新 user（昵称修改后同步）
  refreshUser: () => Promise<void>;        // 从服务端重新拉取 user
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticating: false,
  error: null,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
  clearError: () => {},
  updateUser: () => {},
  refreshUser: async () => {},
});

// ── Provider ──
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 启动时恢复登录状态
  useEffect(() => {
    (async () => {
      try {
        const restored = await AuthService.restoreSession();
        if (restored) {
          setUser(restored);
        }
      } catch {
        // 静默失败，显示登录页
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const loggedInUser = await AuthService.login({ email, password });
      setUser(loggedInUser);
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : '登录失败，请稍后重试';
      setError(msg);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string, nickname: string) => {
    setIsAuthenticating(true);
    setError(null);
    try {
      const result = await AuthService.register({ email, password, nickname });
      setUser(result.user);
    } catch (err) {
      const msg = err instanceof AuthError ? err.message : '注册失败，请稍后重试';
      setError(msg);
      throw err;
    } finally {
      setIsAuthenticating(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await AuthService.logout();
    } finally {
      setUser(null);
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  // 本地直接覆盖 user（修改昵称等操作后同步）
  const updateUser = useCallback((updatedUser: User) => {
    setUser(updatedUser);
  }, []);

  // 从服务端重新拉取最新 user（token 仍然有效时使用）
  const refreshUser = useCallback(async () => {
    try {
      const freshUser = await AuthService.getMe();
      setUser(freshUser);
    } catch {
      // 拉取失败不做处理，保持现有 user 不变
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{ user, isLoading, isAuthenticating, error, login, register, logout, clearError, updateUser, refreshUser }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ── Hook ──
export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
