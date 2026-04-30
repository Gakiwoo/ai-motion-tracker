import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  User,
  AuthTokens,
  LoginRequest,
  RegisterRequest,
  UpdateNicknameRequest,
  ChangePasswordRequest,
  UsageLog,
} from '../types/auth';
import { resolveApiBaseUrl } from '../utils/apiBaseUrl';

// ── 常量 ──
const isDev = (globalThis as unknown as { __DEV__?: boolean }).__DEV__ ?? false;
const envBaseUrl = (globalThis as unknown as {
  process?: { env?: { EXPO_PUBLIC_API_BASE_URL?: string } };
}).process?.env?.EXPO_PUBLIC_API_BASE_URL;

const BASE_URL = resolveApiBaseUrl({
  isDev,
  platformOS: Platform.OS,
  envUrl: envBaseUrl,
});

const TOKEN_KEY = '@auth_tokens';
const USER_KEY = '@auth_user';

// ── 错误类型 ──
export class AuthError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

// ── 内部：带 Cookie 的 fetch 封装 ──
// React Native 的 fetch 不自动处理 cookie，需要手动管理
async function authFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const tokens = await getStoredTokens();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  // Access Token 放 Header
  if (tokens?.accessToken) {
    headers['Authorization'] = `Bearer ${tokens.accessToken}`;
  }

  // Cookie 字符串（手动模拟浏览器行为）
  const cookieParts: string[] = [];
  if (tokens?.accessToken) {
    cookieParts.push(`access_token=${tokens.accessToken}`);
  }
  if (tokens?.refreshToken) {
    cookieParts.push(`refresh_token=${tokens.refreshToken}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',  // 尝试让浏览器/web 端自动处理 cookie
    // React Native 忽略 credentials，cookie 需要后端从 header 读取
    ...(cookieParts.length > 0 ? { cookie: cookieParts.join('; ') } as any : {}),
  });

  // 如果 401，尝试 refresh token
  if (res.status === 401 && tokens?.refreshToken && !path.includes('/auth/refresh')) {
    const refreshed = await refreshToken(tokens.refreshToken);
    if (refreshed) {
      // 用新 token 重试
      return authFetch(path, options);
    }
  }

  return res;
}

// ── 本地存储 ──
async function getStoredTokens(): Promise<AuthTokens | null> {
  try {
    const raw = await AsyncStorage.getItem(TOKEN_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function storeTokens(tokens: AuthTokens): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify(tokens));
}

async function clearTokens(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

async function storeUser(user: User): Promise<void> {
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
}

async function getStoredUser(): Promise<User | null> {
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

async function clearUser(): Promise<void> {
  await AsyncStorage.removeItem(USER_KEY);
}

async function clearSession(): Promise<void> {
  await clearTokens();
  await clearUser();
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new AuthError('请求超时', 408));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

// ── Refresh Token ──
async function refreshToken(refreshTokenStr: string): Promise<boolean> {
  try {
    const cookieStr = `refresh_token=${refreshTokenStr}`;
    const res = await fetch(`${BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieStr,
      },
      credentials: 'include',
    });

    if (!res.ok) {
      // refresh 失败，清除本地登录状态
      await clearSession();
      return false;
    }

    // 从响应头提取新 token
    const setCookie = res.headers.get('set-cookie') || '';
    const newAccessToken = extractCookie(setCookie, 'access_token');
    const newRefreshToken = extractCookie(setCookie, 'refresh_token');

    if (newAccessToken && newRefreshToken) {
      await storeTokens({ accessToken: newAccessToken, refreshToken: newRefreshToken });
    }

    // 同时解析 user
    const data = await res.json().catch(() => null);
    if (data?.user) {
      await storeUser(data.user);
    }

    return true;
  } catch {
    return false;
  }
}

// 从 Set-Cookie 头提取指定 cookie 值
function extractCookie(setCookieHeader: string, name: string): string | null {
  const match = setCookieHeader.match(new RegExp(`${name}=([^;]+)`));
  return match ? match[1] : null;
}

// ── 公共 API ──
const AuthService = {
  /**
   * 注册
   * 后端响应格式: { message, user }
   * 同时通过 Set-Cookie 返回 access_token + refresh_token
   */
  async register(data: RegisterRequest): Promise<{ message: string; user: User }> {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    const body = await res.json();

    if (!res.ok) {
      throw new AuthError(body.message || '注册失败', res.status);
    }

    // 保存 user（token 通过 cookie 由后端管理，RN 需要从 header 提取）
    await storeUser(body.user);

    // 尝试从 Set-Cookie 提取 token（RN fetch 可能不返回 set-cookie）
    const setCookie = res.headers.get('set-cookie') || '';
    const accessToken = extractCookie(setCookie, 'access_token');
    const refreshTokenVal = extractCookie(setCookie, 'refresh_token');
    if (accessToken && refreshTokenVal) {
      await storeTokens({ accessToken, refreshToken: refreshTokenVal });
    }

    return body;
  },

  /**
   * 登录
   * 后端响应: { user }
   * Cookie: access_token (15min) + refresh_token (7d, httpOnly)
   */
  async login(data: LoginRequest): Promise<User> {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      credentials: 'include',
    });

    const body = await res.json();

    if (!res.ok) {
      throw new AuthError(body.message || '登录失败', res.status);
    }

    await storeUser(body.user);

    // 同上，尝试从 Set-Cookie 提取
    const setCookie = res.headers.get('set-cookie') || '';
    const accessToken = extractCookie(setCookie, 'access_token');
    const refreshTokenVal = extractCookie(setCookie, 'refresh_token');
    if (accessToken && refreshTokenVal) {
      await storeTokens({ accessToken, refreshToken: refreshTokenVal });
    }

    return body.user;
  },

  /** 登出 */
  async logout(): Promise<void> {
    try {
      const tokens = await getStoredTokens();
      const cookieParts: string[] = [];
      if (tokens?.refreshToken) {
        cookieParts.push(`refresh_token=${tokens.refreshToken}`);
      }

      await fetch(`${BASE_URL}/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(cookieParts.length > 0 ? { Cookie: cookieParts.join('; ') } : {}),
        },
        credentials: 'include',
      });
    } finally {
      await clearTokens();
      await clearUser();
    }
  },

  /** 获取当前用户 */
  async getMe(): Promise<User> {
    const res = await authFetch('/api/auth/me');
    const body = await res.json();

    if (!res.ok) {
      throw new AuthError(body.message || '获取用户信息失败', res.status);
    }

    await storeUser(body.user);
    return body.user;
  },

  /** 更新昵称 */
  async updateNickname(data: UpdateNicknameRequest): Promise<User> {
    const res = await authFetch('/api/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    const body = await res.json();

    if (!res.ok) {
      throw new AuthError(body.message || '更新失败', res.status);
    }

    await storeUser(body.user);
    return body.user;
  },

  /** 修改密码（成功后自动登出） */
  async changePassword(data: ChangePasswordRequest): Promise<void> {
    const res = await authFetch('/api/auth/me/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new AuthError(body.message || '密码修改失败', res.status);
    }

    // 后端清除 cookie → 前端也清除
    await clearTokens();
    await clearUser();
  },

  /** 获取使用记录 */
  async getUsage(): Promise<UsageLog[]> {
    const res = await authFetch('/api/auth/usage');
    const body = await res.json();

    if (!res.ok) {
      throw new AuthError(body.message || '获取使用记录失败', res.status);
    }

    return body.logs || [];
  },

  /** 从本地恢复登录状态 */
  async restoreSession(): Promise<User | null> {
    const user = await getStoredUser();
    if (!user) return null;

    // 尝试用 /me 验证 token 是否仍然有效
    try {
      const freshUser = await withTimeout(this.getMe(), 2500);
      return freshUser;
    } catch (err) {
      if (err instanceof AuthError && (err.status === 401 || err.status === 403)) {
        await clearSession();
      }
      return null;
    }
  },
};

export default AuthService;
