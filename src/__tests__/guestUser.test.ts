import { createGuestUser } from '../utils/guestUser';

describe('createGuestUser', () => {
  it('creates a local-only user identity for guest mode', () => {
    const user = createGuestUser(1000);

    expect(user.id).toBe('guest-local');
    expect(user.email).toBe('local@ai-sport');
    expect(user.nickname).toBe('本地训练');
    expect(user.isGuest).toBe(true);
    expect(user.createdAt).toBe(new Date(1000).toISOString());
  });
});
