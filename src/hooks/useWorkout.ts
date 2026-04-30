import { useState, useCallback, useRef, useEffect } from 'react';
import { ExerciseType, Pose, WorkoutSession, WorkoutMode } from '../types';
import { ExerciseCounter } from '../services/ExerciseCounter';
import { JumpRopeCounter } from '../services/counters/JumpRopeCounter';
import { JumpingJacksCounter } from '../services/counters/JumpingJacksCounter';
import { SquatsCounter } from '../services/counters/SquatsCounter';
import { StandingLongJumpCounter } from '../services/counters/StandingLongJumpCounter';
import { VerticalJumpCounter } from '../services/counters/VerticalJumpCounter';
import { SitUpCounter } from '../services/counters/SitUpCounter';
import StorageService from '../services/StorageService';
import { DEFAULT_TARGETS, DEFAULT_DURATIONS } from '../constants/exerciseConfig';
import { getExerciseRuntimeProfile } from '../utils/exerciseRuntime';

export interface WorkoutState {
  isActive: boolean;
  count: number;
  mode: WorkoutMode;
  targetCount: number;
  targetDuration: number;
  isSaving: boolean;
  timeUp: boolean;
}

export function useWorkout(exerciseType: ExerciseType) {
  const [isActive, setIsActive] = useState(false);
  const [count, setCount] = useState(0);
  const [mode, setMode] = useState<WorkoutMode>('count');
  const [targetCount, setTargetCount] = useState(DEFAULT_TARGETS[exerciseType]);
  const [targetDuration, setTargetDuration] = useState(DEFAULT_DURATIONS[exerciseType]);
  const [isSaving, setIsSaving] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [counter] = useState<ExerciseCounter>(() => createCounter(exerciseType));
  const startTimeRef = useRef<number | null>(null);
  const prevCountRef = useRef(0);

  const setFrameInterval = useCallback((intervalMs: number) => {
    counter.setFrameInterval(intervalMs);
  }, [counter]);

  useEffect(() => {
    setFrameInterval(getExerciseRuntimeProfile(exerciseType).activePoseIntervalMs);
  }, [exerciseType, setFrameInterval]);

  // 定时模式：时间到自动停止
  useEffect(() => {
    if (!isActive || mode !== 'timed') return;
    const timer = setInterval(() => {
      if (!startTimeRef.current) return;
      const elapsed = Math.round((Date.now() - startTimeRef.current) / 1000);
      if (elapsed >= targetDuration) {
        setTimeUp(true);
      }
    }, 200);
    return () => clearInterval(timer);
  }, [isActive, mode, targetDuration]);

  const processFrame = useCallback((pose: Pose) => {
    if (isActive) {
      counter.processFrame(pose);
      const newCount = counter.getCount();
      if (newCount !== prevCountRef.current) {
        prevCountRef.current = newCount;
        setCount(newCount);
      }
    }
  }, [isActive, counter]);

  const start = useCallback(() => {
    counter.reset();
    prevCountRef.current = 0;
    setCount(0);
    setIsActive(true);
    setTimeUp(false);
    startTimeRef.current = Date.now();
  }, [counter]);

  const stop = useCallback(async (): Promise<{ session: WorkoutSession | null; saved: boolean }> => {
    setIsActive(false);

    const finalCount = counter.getCount();
    if (finalCount === 0 && mode !== 'timed') {
      return { session: null, saved: false };
    }

    const duration = startTimeRef.current
      ? Math.round((Date.now() - startTimeRef.current) / 1000)
      : targetDuration;

    const session: WorkoutSession = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      exerciseType,
      mode,
      count: finalCount,
      duration,
      timestamp: Date.now(),
    };

    setIsSaving(true);
    try {
      await StorageService.saveWorkout(session);
      return { session, saved: true };
    } catch (error) {
      console.error('保存训练记录失败:', error);
      return { session, saved: false };
    } finally {
      setIsSaving(false);
    }
  }, [counter, exerciseType, mode, targetDuration]);

  const switchMode = useCallback((newMode: WorkoutMode) => {
    if (isActive) return;
    setMode(newMode);
  }, [isActive]);

  return {
    isActive,
    count,
    mode,
    targetCount,
    setTargetCount,
    targetDuration,
    setTargetDuration,
    isSaving,
    timeUp,
    processFrame,
    start,
    stop,
    switchMode,
    setFrameInterval,
  };
}

function createCounter(type: ExerciseType): ExerciseCounter {
  switch (type) {
    case 'jump_rope': return new JumpRopeCounter();
    case 'jumping_jacks': return new JumpingJacksCounter();
    case 'squats': return new SquatsCounter();
    case 'standing_long_jump': return new StandingLongJumpCounter();
    case 'vertical_jump': return new VerticalJumpCounter();
    case 'sit_ups': return new SitUpCounter();
  }
}
