import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutSession } from '../types';

const STORAGE_KEY = '@workout_history';
const MAX_RECENT_WORKOUTS = 10;
const MAX_STORED_WORKOUTS = 1000;

class StorageService {
  async saveWorkout(session: WorkoutSession): Promise<void> {
    const history = await this.getWorkoutHistory();
    history.push(session);
    const trimmedHistory = history
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_STORED_WORKOUTS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(trimmedHistory));
  }

  async getWorkoutHistory(): Promise<WorkoutSession[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      const sessions: WorkoutSession[] = data ? JSON.parse(data) : [];
      // 向后兼容：旧记录无 mode 字段，默认为 'count'
      return sessions.map((s) => ({
        ...s,
        mode: s.mode || 'count',
      }));
    } catch (error) {
      console.error('Error loading workout history:', error);
      return [];
    }
  }

  async getAnalytics(): Promise<{
    totalWorkouts: number;
    totalReps: number;
    avgReps: number;
    totalDuration: number;
    recentWorkouts: WorkoutSession[];
  }> {
    const history = await this.getWorkoutHistory();
    const totalWorkouts = history.length;
    const totalReps = history.reduce((sum, session) => sum + session.count, 0);
    const totalDuration = history.reduce((sum, session) => sum + session.duration, 0);
    const avgReps = totalWorkouts > 0 ? totalReps / totalWorkouts : 0;

    return {
      totalWorkouts,
      totalReps,
      avgReps,
      totalDuration,
      recentWorkouts: history.slice(-MAX_RECENT_WORKOUTS).reverse(),
    };
  }
}

export default new StorageService();
