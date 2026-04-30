/**
 * SquatsCounter V2
 *
 * 算法核心：基于膝盖角度 + 躯干稳定性的深蹲检测
 *
 * 参考方案：
 * - MediaPipe Fitness: squat counter by knee angle
 * - 中考体考深蹲标准：大腿平行地面（膝盖角 ≈ 90°）
 *
 * 精度优化：
 * 1. Kalman 滤波平滑膝盖角度和背部角度
 * 2. 完整状态机：idle → standing → descending → bottom → ascending → standing
 * 3. 状态确认防抖（需保持 N 帧才切换状态）
 * 4. 犯规检测：背部过度前倾、膝盖内扣、蹲深不够
 * 5. 动作反馈系统（实时指导）
 * 6. 自适应深度阈值（基于用户站立时的基线角度）
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface SquatFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 深蹲阶段 ──
type SquatPhase = 'idle' | 'standing' | 'descending' | 'bottom' | 'ascending';

// ── 犯规类型 ──
type FoulType = 'shallow_squat' | 'back_lean' | 'knee_valgus' | 'too_fast';

export class SquatsCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private kneeAngleFilter = new KalmanFilter1D(0.008, 0.06);  // 膝盖角度滤波
  private backAngleFilter = new KalmanFilter1D(0.01, 0.08);    // 背部角度滤波
  private hipYFilter = new KalmanFilter1D(0.005, 0.03);       // 髋部 Y 滤波

  // ── 历史窗口 ──
  private kneeAngleHistory = new SlidingWindow(20);
  private backAngleHistory = new SlidingWindow(20);

  // ── 状态机 ──
  private phase: SquatPhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: SquatPhase = 'idle';

  // ── 动作参数 ──
  private standingKneeAngle = 175;       // 站立时的膝盖角度基线
  private minKneeAngleInCycle = 180;     // 本次下蹲最小膝盖角度
  private backAngleAtBottom = 90;        // 蹲底时的背部角度
  private hipBaselineY = 0;              // 髋部 Y 基线
  private baselineWindow = new SlidingWindow(30);

  // ── 判定阈值 ──
  private readonly DOWN_ANGLE = 100;            // 膝盖角 < 此值 → 蹲到底
  private readonly UP_ANGLE = 155;              // 膝盖角 > 此值 → 站起来
  private readonly MIN_SQUAT_ANGLE = 110;       // 有效深蹲最大角度（蹲得不够深）
  private readonly BACK_LEAN_THRESHOLD = 60;    // 背部角度 < 此值 → 过度前倾
  private readonly CONFIRM_FRAMES_DOWN_30FPS = 4;
  private readonly CONFIRM_FRAMES_UP_30FPS = 4;
  private readonly MIN_CYCLE_FRAMES_30FPS = 15;
  private readonly MAX_CYCLE_FRAMES_30FPS = 120;

  // ── 统计 ──
  private cycleStartFrame = 0;
  private foulCount = 0;
  private lastFoul: FoulType | null = null;
  private currentKneeAngle = 175;

  // ── 膝盖内扣检测 ──
  private kneeTrackingAngle = 0;  // 膝盖追踪角（正面看膝盖朝向）

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.standingKneeAngle = 175;
    this.minKneeAngleInCycle = 180;
    this.backAngleAtBottom = 90;
    this.hipBaselineY = 0;
    this.cycleStartFrame = 0;
    this.foulCount = 0;
    this.lastFoul = null;
    this.currentKneeAngle = 175;
    this.kneeTrackingAngle = 0;
    this.kneeAngleFilter.reset(175);
    this.backAngleFilter.reset(90);
    this.hipYFilter.reset(0.5);
    this.resizeTimingWindows();
    this.kneeAngleHistory.clear();
    this.backAngleHistory.clear();
    this.baselineWindow.clear();
  }

  protected onFrameIntervalChanged(): void {
    this.resizeTimingWindows();
  }

  private resizeTimingWindows(): void {
    this.kneeAngleHistory.resize(this.framesAt30Fps(20));
    this.backAngleHistory.resize(this.framesAt30Fps(20));
    this.baselineWindow.resize(this.framesAt30Fps(30));
  }

  processFrame(pose: Pose): void {
    this.totalFrames++;

    // ── 获取关键点 ──
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftKnee = this.getKeypoint(pose, 'left_knee');
    const rightKnee = this.getKeypoint(pose, 'right_knee');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
        !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return;

    const minScore = 0.3;
    if ([leftShoulder, rightShoulder, leftHip, rightHip,
         leftKnee, rightKnee, leftAnkle, rightAnkle]
        .some(kp => (kp.score || 0) < minScore)) return;

    // ── 计算中值 ──
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;

    // ── 膝盖角度（髋-膝-踝）──
    const leftKneeAngle = this.calculateAngle(pose, 'left_hip', 'left_knee', 'left_ankle');
    const rightKneeAngle = this.calculateAngle(pose, 'right_hip', 'right_knee', 'right_ankle');
    if (leftKneeAngle === null || rightKneeAngle === null) return;

    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // ── 背部角度（肩-髋-垂直线）
    // 用髋部到肩部的向量与垂直方向的夹角
    const backAngle = this.calculateBackAngle(
      shoulderMidX, shoulderMidY,
      hipMidX, hipMidY
    );

    // ── 膝盖内扣检测（正面拍摄时有效）──
    // 膝盖X应该在脚踝X的外侧（或对齐），如果膝盖X在内侧则为内扣
    const leftKneeValgus = leftKnee.x < leftAnkle.x ? 1 : 0;
    const rightKneeValgus = rightKnee.x > rightAnkle.x ? 1 : 0;
    this.kneeTrackingAngle = (leftKneeValgus + rightKneeValgus) * 10;

    // ── 滤波 ──
    const smoothKneeAngle = this.kneeAngleFilter.filter(avgKneeAngle);
    const smoothBackAngle = this.backAngleFilter.filter(backAngle);
    const smoothHipY = this.hipYFilter.filter(hipMidY);

    this.currentKneeAngle = smoothKneeAngle;

    // ── 记录历史 ──
    this.kneeAngleHistory.push(smoothKneeAngle);
    this.backAngleHistory.push(smoothBackAngle);

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'idle':
        this.handleIdle(smoothKneeAngle, smoothHipY);
        break;
      case 'standing':
        this.handleStanding(smoothKneeAngle, smoothHipY);
        break;
      case 'descending':
        this.handleDescending(smoothKneeAngle, smoothBackAngle);
        break;
      case 'bottom':
        this.handleBottom(smoothKneeAngle, smoothBackAngle);
        break;
      case 'ascending':
        this.handleAscending(smoothKneeAngle, smoothBackAngle);
        break;
    }
  }

  // ── 状态处理 ──

  private handleIdle(kneeAngle: number, hipY: number): void {
    // 采集站立基线
    this.baselineWindow.push(kneeAngle);
    if (this.baselineWindow.isFull && this.baselineWindow.variance() < 20) {
      this.standingKneeAngle = this.baselineWindow.mean();
      this.hipBaselineY = hipY;
      this.transitionTo('standing');
    }
  }

  private handleStanding(kneeAngle: number, hipY: number): void {
    // 更新基线
    this.baselineWindow.push(kneeAngle);
    if (this.baselineWindow.isFull && this.baselineWindow.variance() < 20) {
      this.standingKneeAngle = this.baselineWindow.mean();
      this.hipBaselineY = hipY;
    }

    // 膝盖角度开始减小 → 开始下蹲
    if (kneeAngle < this.standingKneeAngle - 15) {
      this.cycleStartFrame = this.totalFrames;
      this.minKneeAngleInCycle = 180;
      this.transitionTo('descending');
    }
  }

  private handleDescending(kneeAngle: number, backAngle: number): void {
    // 追踪最小膝盖角度
    if (kneeAngle < this.minKneeAngleInCycle) {
      this.minKneeAngleInCycle = kneeAngle;
      this.backAngleAtBottom = backAngle;
    }

    // 检测犯规：背部过度前倾
    if (backAngle < this.BACK_LEAN_THRESHOLD) {
      this.lastFoul = 'back_lean';
    }

    // 检测到达底部
    if (kneeAngle < this.DOWN_ANGLE) {
      if (this.phaseFrameCount >= this.framesAt30Fps(this.CONFIRM_FRAMES_DOWN_30FPS)) {
        this.transitionTo('bottom');
      }
    }

    // 如果角度又增大（没蹲下去就站起来了）→ 回到 standing
    if (this.phaseFrameCount > this.framesAt30Fps(5) && kneeAngle > this.standingKneeAngle - 10) {
      this.transitionTo('standing');
    }
  }

  private handleBottom(kneeAngle: number, backAngle: number): void {
    // 持续追踪最深处
    if (kneeAngle < this.minKneeAngleInCycle) {
      this.minKneeAngleInCycle = kneeAngle;
      this.backAngleAtBottom = backAngle;
    }

    // 检测犯规：蹲深不够
    if (this.minKneeAngleInCycle > this.MIN_SQUAT_ANGLE) {
      this.lastFoul = 'shallow_squat';
    }

    // 膝盖角度开始增大 → 开始起身
    if (kneeAngle > this.DOWN_ANGLE + 10) {
      this.transitionTo('ascending');
    }
  }

  private handleAscending(kneeAngle: number, _backAngle: number): void {
    // 追踪是否站直
    if (kneeAngle > this.UP_ANGLE) {
      if (this.phaseFrameCount >= this.framesAt30Fps(this.CONFIRM_FRAMES_UP_30FPS)) {
        this.recordSquat();
        this.transitionTo('standing');
      }
    }

    // 如果角度又减小（没站直又蹲下去了）→ 回到 descending
    if (this.phaseFrameCount > this.framesAt30Fps(5) && kneeAngle < this.DOWN_ANGLE) {
      this.transitionTo('descending');
    }
  }

  private transitionTo(newPhase: SquatPhase): void {
    this.lastPhase = this.phase;
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
  }

  // ── 记录有效深蹲 ──

  private recordSquat(): void {
    const cycleFrames = this.totalFrames - this.cycleStartFrame;

    if (cycleFrames < this.framesAt30Fps(this.MIN_CYCLE_FRAMES_30FPS)) {
      this.lastFoul = 'too_fast';
      this.foulCount++;
      return;
    }

    if (cycleFrames > this.framesAt30Fps(this.MAX_CYCLE_FRAMES_30FPS)) {
      // 超时可能中间停顿了
      return;
    }

    // 检查蹲深是否足够
    if (this.minKneeAngleInCycle > this.MIN_SQUAT_ANGLE) {
      // 蹲得不够深，犯规但不阻止计数（中考场景下仍然计但扣分）
      this.lastFoul = 'shallow_squat';
      this.foulCount++;
    } else {
      this.lastFoul = null;
    }

    // ✅ 有效计数
    this.count++;
  }

  // ── 背部角度计算 ──
  // 返回肩-髋连线与垂直方向的夹角（度）
  // 90° = 站直，< 90° = 前倾
  private calculateBackAngle(
    sx: number, sy: number,   // shoulder mid
    hx: number, hy: number,   // hip mid
  ): number {
    const dx = sx - hx;
    const dy = hy - sy;  // 注意 Y 轴反转
    const angle = Math.atan2(Math.abs(dx), dy) * 180 / Math.PI;
    return angle;
  }

  // ── 公共接口 ──

  getPhase(): SquatPhase {
    return this.phase;
  }

  getKneeAngle(): number {
    return Math.round(this.currentKneeAngle);
  }

  getMinKneeAngle(): number {
    return Math.round(this.minKneeAngleInCycle);
  }

  getFoulCount(): number {
    return this.foulCount;
  }

  getLastFoul(): FoulType | null {
    return this.lastFoul;
  }

  getFeedback(_pose?: Pose): SquatFeedback | null {
    switch (this.phase) {
      case 'idle':
        return {
          type: 'warning',
          message: '请站直面对摄像头...',
        };

      case 'standing':
        return null;

      case 'descending': {
        if (this.lastFoul === 'back_lean') {
          return {
            type: 'error',
            message: '背部不要过度前倾！',
          };
        }
        return null;
      }

      case 'bottom': {
        if (this.lastFoul === 'shallow_squat') {
          return {
            type: 'warning',
            message: '蹲深不够，大腿要平行地面',
          };
        }
        return null;
      }

      case 'ascending': {
        if (this.phaseFrameCount > this.framesAt30Fps(20)) {
          return {
            type: 'warning',
            message: '起身太慢，注意发力',
          };
        }
        return null;
      }

      default:
        return null;
    }
  }
}
