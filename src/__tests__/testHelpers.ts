/**
 * 测试辅助工具 — 快速构建 Pose 对象
 *
 * 重要：CameraView 发送给 RN 的关键点是**像素坐标**（非归一化 0-1）。
 * 代码：`pts.push({ x: (1 - lm[i].x) * W, y: lm[i].y * H, ... })`
 * 典型分辨率：640×480
 *
 * 因此所有测试姿态使用像素坐标。
 */

import { Pose, Keypoint } from '../types';

// ── 本 App 使用的 17 个关键点名 ──
const KEYPOINT_NAMES = [
  'nose', 'left_eye', 'right_eye', 'left_ear', 'right_ear',
  'left_shoulder', 'right_shoulder', 'left_elbow', 'right_elbow',
  'left_wrist', 'right_wrist', 'left_hip', 'right_hip',
  'left_knee', 'right_knee', 'left_ankle', 'right_ankle',
] as const;

// ── 参考分辨率（与 CameraView 中 480×360 对应） ──
const W = 480;
const H = 360;

/** 从部分关键点构建完整 Pose（缺失关键点自动补零分） */
export function buildPose(overrides: Partial<Record<string, { x: number; y: number; score?: number }>>): Pose {
  const keypoints: Keypoint[] = KEYPOINT_NAMES.map(name => {
    const o = overrides[name];
    return {
      name,
      x: o?.x ?? 0,
      y: o?.y ?? 0,
      score: o?.score ?? 0,
    };
  });
  return { keypoints, score: 0.9 };
}

/** 给所有关键点设置相同 score */
export function withScore(pose: Pose, score: number): Pose {
  return {
    ...pose,
    keypoints: pose.keypoints.map(kp => ({ ...kp, score })),
  };
}

// ── 预设姿态（像素坐标，模拟 480×360 画面）──

/** 站立面对摄像头 */
export function standingPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 36, score: 0.9 },
    left_shoulder:  { x: 168, y: 90, score: 0.9 },
    right_shoulder: { x: 312, y: 90, score: 0.9 },
    left_elbow:     { x: 144, y: 137, score: 0.9 },
    right_elbow:    { x: 336, y: 137, score: 0.9 },
    left_wrist:     { x: 134, y: 180, score: 0.9 },
    right_wrist:    { x: 346, y: 180, score: 0.9 },
    left_hip:       { x: 192, y: 198, score: 0.9 },
    right_hip:      { x: 288, y: 198, score: 0.9 },
    left_knee:      { x: 192, y: 259, score: 0.9 },
    right_knee:     { x: 288, y: 259, score: 0.9 },
    left_ankle:     { x: 192, y: 324, score: 0.9 },
    right_ankle:    { x: 288, y: 324, score: 0.9 },
  });
}

/** 仰卧姿态（肩→髋→膝角度 ≈ 170°，接近平躺） */
export function lyingPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 108, score: 0.9 },
    left_shoulder:  { x: 192, y: 126, score: 0.9 },
    right_shoulder: { x: 288, y: 126, score: 0.9 },
    left_elbow:     { x: 144, y: 137, score: 0.9 },
    right_elbow:    { x: 336, y: 137, score: 0.9 },
    left_wrist:     { x: 120, y: 144, score: 0.9 },
    right_wrist:    { x: 360, y: 144, score: 0.9 },
    left_hip:       { x: 206, y: 198, score: 0.9 },
    right_hip:      { x: 274, y: 198, score: 0.9 },
    left_knee:      { x: 206, y: 259, score: 0.9 },
    right_knee:     { x: 274, y: 259, score: 0.9 },
    left_ankle:     { x: 206, y: 324, score: 0.9 },
    right_ankle:    { x: 274, y: 324, score: 0.9 },
  });
}

/** 坐起姿态（肩→髋→膝角度 ≈ 70°，上身前倾肘触膝） */
export function sittingUpPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 144, score: 0.9 },
    left_shoulder:  { x: 202, y: 173, score: 0.9 },
    right_shoulder: { x: 278, y: 173, score: 0.9 },
    left_elbow:     { x: 182, y: 198, score: 0.9 },
    right_elbow:    { x: 298, y: 198, score: 0.9 },
    left_wrist:     { x: 192, y: 223, score: 0.9 },
    right_wrist:    { x: 288, y: 223, score: 0.9 },
    left_hip:       { x: 206, y: 198, score: 0.9 },
    right_hip:      { x: 274, y: 198, score: 0.9 },
    left_knee:      { x: 206, y: 259, score: 0.9 },
    right_knee:     { x: 274, y: 259, score: 0.9 },
    left_ankle:     { x: 206, y: 324, score: 0.9 },
    right_ankle:    { x: 274, y: 324, score: 0.9 },
  });
}

/** 深蹲底部姿态（膝盖角 ≈ 85°，蹲得很深） */
export function squatBottomPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 100, score: 0.9 },
    left_shoulder:  { x: 180, y: 115, score: 0.9 },
    right_shoulder: { x: 300, y: 115, score: 0.9 },
    left_elbow:     { x: 152, y: 150, score: 0.9 },
    right_elbow:    { x: 328, y: 150, score: 0.9 },
    left_wrist:     { x: 140, y: 180, score: 0.9 },
    right_wrist:    { x: 340, y: 180, score: 0.9 },
    left_hip:       { x: 210, y: 235, score: 0.9 },
    right_hip:      { x: 270, y: 235, score: 0.9 },
    left_knee:      { x: 155, y: 260, score: 0.9 },
    right_knee:     { x: 325, y: 260, score: 0.9 },
    left_ankle:     { x: 192, y: 324, score: 0.9 },
    right_ankle:    { x: 288, y: 324, score: 0.9 },
  });
}

/** 开合跳张开姿态（手臂举起 + 腿分开） */
export function jumpingJackOpenPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 36, score: 0.9 },
    left_shoulder:  { x: 168, y: 90, score: 0.9 },
    right_shoulder: { x: 312, y: 90, score: 0.9 },
    left_elbow:     { x: 120, y: 65, score: 0.9 },
    right_elbow:    { x: 360, y: 65, score: 0.9 },
    left_wrist:     { x: 106, y: 29, score: 0.9 },
    right_wrist:    { x: 374, y: 29, score: 0.9 },
    left_hip:       { x: 192, y: 198, score: 0.9 },
    right_hip:      { x: 288, y: 198, score: 0.9 },
    left_knee:      { x: 168, y: 259, score: 0.9 },
    right_knee:     { x: 312, y: 259, score: 0.9 },
    left_ankle:     { x: 144, y: 324, score: 0.9 },
    right_ankle:    { x: 336, y: 324, score: 0.9 },
  });
}

/** 跳跃腾空姿态（髋部/脚踝Y上升 = Y值减小） */
export function airbornePose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 18, score: 0.9 },
    left_shoulder:  { x: 168, y: 72, score: 0.9 },
    right_shoulder: { x: 312, y: 72, score: 0.9 },
    left_elbow:     { x: 144, y: 115, score: 0.9 },
    right_elbow:    { x: 336, y: 115, score: 0.9 },
    left_wrist:     { x: 134, y: 151, score: 0.9 },
    right_wrist:    { x: 346, y: 151, score: 0.9 },
    left_hip:       { x: 192, y: 162, score: 0.9 },
    right_hip:      { x: 288, y: 162, score: 0.9 },
    left_knee:      { x: 192, y: 223, score: 0.9 },
    right_knee:     { x: 288, y: 223, score: 0.9 },
    left_ankle:     { x: 192, y: 288, score: 0.9 },
    right_ankle:    { x: 288, y: 288, score: 0.9 },
  });
}

/** 低置信度姿态（所有关键点 score < 0.3） */
export function lowConfidencePose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 36, score: 0.1 },
    left_shoulder:  { x: 168, y: 90, score: 0.1 },
    right_shoulder: { x: 312, y: 90, score: 0.1 },
    left_elbow:     { x: 144, y: 137, score: 0.1 },
    right_elbow:    { x: 336, y: 137, score: 0.1 },
    left_wrist:     { x: 134, y: 180, score: 0.1 },
    right_wrist:    { x: 346, y: 180, score: 0.1 },
    left_hip:       { x: 192, y: 198, score: 0.1 },
    right_hip:      { x: 288, y: 198, score: 0.1 },
    left_knee:      { x: 192, y: 259, score: 0.1 },
    right_knee:     { x: 288, y: 259, score: 0.1 },
    left_ankle:     { x: 192, y: 324, score: 0.1 },
    right_ankle:    { x: 288, y: 324, score: 0.1 },
  });
}

/** 缺失关键点的姿态 */
export function missingKeypointPose(): Pose {
  return buildPose({
    nose:           { x: 240, y: 36, score: 0.9 },
    left_shoulder:  { x: 168, y: 90, score: 0.9 },
  });
}
