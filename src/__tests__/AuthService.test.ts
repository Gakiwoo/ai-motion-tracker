import AsyncStorage from '@react-native-async-storage/async-storage';
import AuthService from '../services/AuthService';

jest.mock('react-native', () => ({
  Platform: { OS: 'web' },
}));

jest.mock('@react-native-async-storage/async-storage', () => {
  const store = new Map<string, string>();
  return {
    __store: store,
    getItem: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItem: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

const USER_KEY = '@auth_user';
const TOKEN_KEY = '@auth_tokens';

describe('AuthService.restoreSession', () => {
  beforeEach(() => {
    (global as any).__DEV__ = true;
    (AsyncStorage as any).__store.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('returns null quickly when session verification does not respond', async () => {
    jest.useFakeTimers();
    await AsyncStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: 'u1', email: 'u@example.com', nickname: 'U' }),
    );
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    (global as any).fetch = jest.fn(() => new Promise(() => {}));

    const restore = AuthService.restoreSession();
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(2500);
    await Promise.resolve();

    await expect(Promise.race([restore, Promise.resolve('pending')])).resolves.toBeNull();
  });

  it('clears stored credentials when the server rejects the session', async () => {
    await AsyncStorage.setItem(
      USER_KEY,
      JSON.stringify({ id: 'u1', email: 'u@example.com', nickname: 'U' }),
    );
    await AsyncStorage.setItem(TOKEN_KEY, JSON.stringify({ accessToken: 'a', refreshToken: 'r' }));
    (global as any).fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'expired' }),
      }),
    );

    await expect(AuthService.restoreSession()).resolves.toBeNull();
    await expect(AsyncStorage.getItem(USER_KEY)).resolves.toBeNull();
    await expect(AsyncStorage.getItem(TOKEN_KEY)).resolves.toBeNull();
  });
});
