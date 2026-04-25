import React, { useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { WorkoutSession, ExerciseType } from '../types';
import { AnalyticsScreenProps } from '../types/navigation';
import StorageService from '../services/StorageService';
import BarChart from '../components/BarChart';
import { EXERCISE_NAMES } from '../constants/exerciseConfig';

interface Analytics {
  totalWorkouts: number;
  totalReps: number;
  avgReps: number;
  totalDuration: number;
  recentWorkouts: WorkoutSession[];
}

const EXERCISE_COLORS: Record<ExerciseType, string> = {
  jump_rope: '#4CAF50',
  jumping_jacks: '#2196F3',
  squats: '#FF9800',
  standing_long_jump: '#9C27B0',
  vertical_jump: '#F44336',
  sit_ups: '#00BCD4',
};

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s > 0 ? `${m}分${s}秒` : `${m}分钟`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}小时${rm > 0 ? rm + '分' : ''}`;
}

export default function AnalyticsScreen(_props: AnalyticsScreenProps) {
  const [analytics, setAnalytics] = useState<Analytics>({
    totalWorkouts: 0,
    totalReps: 0,
    avgReps: 0,
    totalDuration: 0,
    recentWorkouts: [],
  });

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    const data = await StorageService.getAnalytics();
    setAnalytics(data);
  };

  // Memoized chart data: reps per day for last 7 days
  const last7DaysData = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const days: { label: string; value: number }[] = [];
    const dayNames = ['日', '一', '二', '三', '四', '五', '六'];

    for (let i = 6; i >= 0; i--) {
      // Create new date object to avoid mutation
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().split('T')[0];
      const dayName = dayNames[date.getDay()];

      const dayTotal = analytics.recentWorkouts
        .filter((w) => {
          const wDate = new Date(w.timestamp).toISOString().split('T')[0];
          return wDate === dateStr;
        })
        .reduce((sum, w) => sum + w.count, 0);

      days.push({ label: dayName, value: dayTotal });
    }

    return days;
  }, [analytics.recentWorkouts]);

  // Memoized chart data: exercise distribution
  const exerciseData = useMemo(() => {
    const counts: Record<ExerciseType, number> = {
      jump_rope: 0,
      jumping_jacks: 0,
      squats: 0,
      standing_long_jump: 0,
      vertical_jump: 0,
      sit_ups: 0,
    };

    analytics.recentWorkouts.forEach((w) => {
      counts[w.exerciseType] += w.count;
    });

    return Object.entries(counts)
      .filter(([, value]) => value > 0)
      .map(([type, value]) => ({
        label: EXERCISE_NAMES[type as ExerciseType],
        value,
        color: EXERCISE_COLORS[type as ExerciseType],
      }));
  }, [analytics.recentWorkouts]);

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>总体统计</Text>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>总训练次数</Text>
          <Text style={styles.statValue}>{analytics.totalWorkouts}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>总完成次数</Text>
          <Text style={styles.statValue}>{analytics.totalReps}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>平均次数</Text>
          <Text style={styles.statValue}>{analytics.avgReps.toFixed(1)}</Text>
        </View>
        <View style={styles.statRow}>
          <Text style={styles.statLabel}>⏱ 累计用时</Text>
          <Text style={[styles.statValue, styles.statValueDuration]}>{formatDuration(analytics.totalDuration)}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>近7天训练次数</Text>
        <BarChart data={last7DaysData} width={320} height={180} />
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>运动类型分布</Text>
        <BarChart data={exerciseData} width={320} height={180} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    padding: 15,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    marginBottom: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 15,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  statLabel: {
    fontSize: 16,
    color: '#666',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  statValueDuration: {
    color: '#9C27B0',
  },
});
