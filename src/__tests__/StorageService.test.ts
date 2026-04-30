import AsyncStorage from '@react-native-async-storage/async-storage';
import StorageService from '../services/StorageService';
import { WorkoutSession } from '../types';

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

const STORAGE_KEY = '@workout_history';

function session(id: number): WorkoutSession {
  return {
    id: String(id),
    exerciseType: 'jump_rope',
    mode: 'count',
    count: id,
    duration: 30,
    timestamp: id,
  };
}

describe('StorageService', () => {
  beforeEach(() => {
    (AsyncStorage as any).__store.clear();
    jest.clearAllMocks();
  });

  it('keeps only the newest 1000 workout sessions when saving', async () => {
    const initial = Array.from({ length: 1000 }, (_, i) => session(i + 1));
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(initial));

    await StorageService.saveWorkout(session(1001));

    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const saved = JSON.parse(raw || '[]') as WorkoutSession[];
    expect(saved).toHaveLength(1000);
    expect(saved[0].id).toBe('2');
    expect(saved[999].id).toBe('1001');
  });
});
