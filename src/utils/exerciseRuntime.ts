import { ExerciseType } from '../types';

export interface ExerciseRuntimeProfile {
  activePoseIntervalMs: number;
  previewPoseIntervalMs: number;
}

const MIN_INTERVAL_MS = 50;
const MAX_INTERVAL_MS = 300;

const PROFILES: Record<ExerciseType, ExerciseRuntimeProfile> = {
  jump_rope: {
    activePoseIntervalMs: 80,
    previewPoseIntervalMs: 240,
  },
  jumping_jacks: {
    activePoseIntervalMs: 90,
    previewPoseIntervalMs: 240,
  },
  squats: {
    activePoseIntervalMs: 120,
    previewPoseIntervalMs: 260,
  },
  standing_long_jump: {
    activePoseIntervalMs: 100,
    previewPoseIntervalMs: 260,
  },
  vertical_jump: {
    activePoseIntervalMs: 90,
    previewPoseIntervalMs: 240,
  },
  sit_ups: {
    activePoseIntervalMs: 120,
    previewPoseIntervalMs: 260,
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
  };
}
