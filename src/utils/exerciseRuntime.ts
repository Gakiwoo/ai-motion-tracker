import { ExerciseType } from '../types';

export interface ExerciseRuntimeProfile {
  activePoseIntervalMs: number;
  previewPoseIntervalMs: number;
  maxAdaptiveIntervalMs: number;
  modelComplexity: 0 | 1;
}

const MIN_INTERVAL_MS = 50;
const MAX_INTERVAL_MS = 300;

const PROFILES: Record<ExerciseType, ExerciseRuntimeProfile> = {
  jump_rope: {
    activePoseIntervalMs: 80,
    previewPoseIntervalMs: 240,
    maxAdaptiveIntervalMs: 180,
    modelComplexity: 0,
  },
  jumping_jacks: {
    activePoseIntervalMs: 90,
    previewPoseIntervalMs: 240,
    maxAdaptiveIntervalMs: 190,
    modelComplexity: 0,
  },
  squats: {
    activePoseIntervalMs: 120,
    previewPoseIntervalMs: 260,
    maxAdaptiveIntervalMs: 220,
    modelComplexity: 0,
  },
  standing_long_jump: {
    activePoseIntervalMs: 100,
    previewPoseIntervalMs: 260,
    maxAdaptiveIntervalMs: 180,
    modelComplexity: 1,
  },
  vertical_jump: {
    activePoseIntervalMs: 90,
    previewPoseIntervalMs: 240,
    maxAdaptiveIntervalMs: 170,
    modelComplexity: 1,
  },
  sit_ups: {
    activePoseIntervalMs: 120,
    previewPoseIntervalMs: 260,
    maxAdaptiveIntervalMs: 220,
    modelComplexity: 0,
  },
};

function clampInterval(ms: number): number {
  return Math.max(MIN_INTERVAL_MS, Math.min(MAX_INTERVAL_MS, ms));
}

export function getExerciseRuntimeProfile(type: ExerciseType): ExerciseRuntimeProfile {
  const profile = PROFILES[type];
  return {
    activePoseIntervalMs: clampInterval(profile.activePoseIntervalMs),
    previewPoseIntervalMs: clampInterval(profile.previewPoseIntervalMs),
    maxAdaptiveIntervalMs: clampInterval(profile.maxAdaptiveIntervalMs),
    modelComplexity: profile.modelComplexity,
  };
}
