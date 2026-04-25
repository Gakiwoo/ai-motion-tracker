export type ExerciseType = 'jump_rope' | 'jumping_jacks' | 'squats' | 'standing_long_jump' | 'vertical_jump' | 'sit_ups';

/** 训练模式：定数（目标次数）或定时（目标时长） */
export type WorkoutMode = 'count' | 'timed';

export interface Keypoint {
  x: number;
  y: number;
  score?: number;
  name?: string;
}

export interface Pose {
  keypoints: Keypoint[];
  score?: number;
}

export interface WorkoutSession {
  id: string;
  exerciseType: ExerciseType;
  mode: WorkoutMode;
  count: number;
  duration: number;
  timestamp: number;
  accuracy: number;
}

export interface ExerciseConfig {
  name: string;
  chineseName: string;
  description: string;
  targetReps?: number;
  targetDuration?: number;
}