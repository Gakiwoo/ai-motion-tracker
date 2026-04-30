// ── 认证相关类型 ──

export interface User {
  id: string;
  email: string;
  nickname: string;
  isActive?: boolean;
  isGuest?: boolean;
  createdAt: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  nickname: string;
}

export interface UpdateNicknameRequest {
  nickname: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface UsageLog {
  id: string;
  mode: string;
  inputTokens: number;
  outputTokens: number;
  createdAt: string;
}
