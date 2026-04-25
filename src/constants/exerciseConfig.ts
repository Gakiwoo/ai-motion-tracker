import { ExerciseType } from '../types';

export interface ExerciseConfig {
  type: ExerciseType;
  name: string;
  icon: string;
  targetDefault: number;
}

export const EXERCISE_CONFIGS: ExerciseConfig[] = [
  { type: 'jump_rope', name: '跳绳', icon: '🪢', targetDefault: 100 },
  { type: 'jumping_jacks', name: '开合跳', icon: '🤸', targetDefault: 50 },
  { type: 'squats', name: '深蹲', icon: '🏋️', targetDefault: 30 },
  { type: 'standing_long_jump', name: '立定跳远', icon: '🦘', targetDefault: 10 },
  { type: 'vertical_jump', name: '纵跳摸高', icon: '⬆️', targetDefault: 20 },
  { type: 'sit_ups', name: '仰卧起坐', icon: '🧘', targetDefault: 40 },
];

export const EXERCISE_NAMES: Record<ExerciseType, string> = {
  jump_rope: '跳绳',
  jumping_jacks: '开合跳',
  squats: '深蹲',
  standing_long_jump: '立定跳远',
  vertical_jump: '纵跳摸高',
  sit_ups: '仰卧起坐',
};

export const DEFAULT_TARGETS: Record<ExerciseType, number> = {
  jump_rope: 100,
  jumping_jacks: 50,
  squats: 30,
  standing_long_jump: 10,
  vertical_jump: 20,
  sit_ups: 40,
};

/** 定时模式默认时长（秒） */
export const DEFAULT_DURATIONS: Record<ExerciseType, number> = {
  jump_rope: 60,
  jumping_jacks: 60,
  squats: 60,
  standing_long_jump: 30,
  vertical_jump: 30,
  sit_ups: 60,
};
