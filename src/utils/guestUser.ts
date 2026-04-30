import { User } from '../types/auth';

export function createGuestUser(now: number = Date.now()): User {
  return {
    id: 'guest-local',
    email: 'local@ai-sport',
    nickname: '本地训练',
    isGuest: true,
    isActive: true,
    createdAt: new Date(now).toISOString(),
  };
}
