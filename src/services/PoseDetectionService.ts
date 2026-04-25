import { Pose, Keypoint } from '../types';

/**
 * PoseDetectionService - 姿态检测服务
 *
 * 注意：当前实现使用 MediaPipe WebView 方案（CameraView.tsx）
 * 此服务保留用于辅助计算，如角度计算等
 */
class PoseDetectionService {
  private isInitialized = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;
  }

  getKeypoint(pose: Pose, name: string): Keypoint | undefined {
    return pose.keypoints.find(kp => kp.name === name);
  }

  calculateAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
    const radians = Math.atan2(c.y - b.y, c.x - b.x) - Math.atan2(a.y - b.y, a.x - b.x);
    let angle = Math.abs(radians * 180.0 / Math.PI);
    if (angle > 180.0) angle = 360 - angle;
    return angle;
  }

  calculateDistance(a: Keypoint, b: Keypoint): number {
    return Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.y - a.y, 2));
  }
}

export default new PoseDetectionService();
