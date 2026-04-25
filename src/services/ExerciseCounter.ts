import { Pose } from '../types';
import PoseDetectionService from './PoseDetectionService';

// ── 反馈接口（所有 Counter 的 getFeedback 返回此类型）──
export interface CounterFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

export abstract class ExerciseCounter {
  protected count = 0;
  protected isInPosition = false;
  protected lastState: string = 'neutral';
  protected totalFrames = 0;

  /** 实际帧间隔（ms），默认 100ms ≈ 10fps。由外部通过 setFrameInterval 设置 */
  protected frameIntervalMs = 100;

  abstract processFrame(pose: Pose): void;

  /** 设置实际帧间隔，用于 getRate 的速率计算 */
  setFrameInterval(ms: number): void {
    this.frameIntervalMs = ms;
  }

  getCount(): number {
    return this.count;
  }

  reset(): void {
    this.count = 0;
    this.isInPosition = false;
    this.lastState = 'neutral';
    this.totalFrames = 0;
  }

  /** 获取当前动作阶段（各子类自定义阶段名） */
  getPhase(): string {
    return this.lastState;
  }

  /** 获取实时动作反馈（指导用户改善动作质量） */
  getFeedback(_pose?: Pose): CounterFeedback | null {
    return null;
  }

  protected getKeypoint(pose: Pose, name: string) {
    return PoseDetectionService.getKeypoint(pose, name);
  }

  protected calculateAngle(pose: Pose, a: string, b: string, c: string): number | null {
    const kpA = this.getKeypoint(pose, a);
    const kpB = this.getKeypoint(pose, b);
    const kpC = this.getKeypoint(pose, c);

    if (!kpA || !kpB || !kpC) return null;
    if ((kpA.score || 0) < 0.3 || (kpB.score || 0) < 0.3 || (kpC.score || 0) < 0.3) return null;

    return PoseDetectionService.calculateAngle(kpA, kpB, kpC);
  }

  /** 计算每分钟动作速率（次/分钟），基于实际帧间隔 */
  getRate(): number {
    if (this.totalFrames === 0 || this.count === 0) return 0;
    const fps = 1000 / this.frameIntervalMs;
    const seconds = this.totalFrames / fps;
    return Math.round(this.count / seconds * 60);
  }
}
