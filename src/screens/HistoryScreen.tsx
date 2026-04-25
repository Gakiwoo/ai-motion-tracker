import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { WorkoutSession, WorkoutMode } from '../types';
import { HistoryScreenProps } from '../types/navigation';
import StorageService from '../services/StorageService';
import { EXERCISE_NAMES } from '../constants/exerciseConfig';

export default function HistoryScreen(_props: HistoryScreenProps) {
  const [history, setHistory] = useState<WorkoutSession[]>([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    const data = await StorageService.getWorkoutHistory();
    setHistory([...data].reverse());
  };

  const formatDate = (timestamp: number): string => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN') + ' ' + date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.exerciseName}>{EXERCISE_NAMES[item.exerciseType]}</Text>
              <View style={[
                styles.modeTag,
                (item.mode as WorkoutMode) === 'timed' && styles.modeTagTimed,
              ]}>
                <Text style={styles.modeTagText}>
                  {(item.mode as WorkoutMode) === 'timed' ? '⏰ 定时' : '🎯 定数'}
                </Text>
              </View>
            </View>
            <Text style={styles.count}>次数: {item.count}  ·  用时: {item.duration}s</Text>
            <Text style={styles.date}>{formatDate(item.timestamp)}</Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>暂无训练记录</Text>
        }
      />
    </View>
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
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  exerciseName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 5,
    flex: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  modeTag: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  modeTagTimed: {
    backgroundColor: '#FFF3E0',
  },
  modeTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#007AFF',
  },
  count: {
    fontSize: 16,
    color: '#666',
    marginBottom: 5,
  },
  date: {
    fontSize: 14,
    color: '#999',
  },
  emptyText: {
    textAlign: 'center',
    fontSize: 16,
    color: '#999',
    marginTop: 50,
  },
});
