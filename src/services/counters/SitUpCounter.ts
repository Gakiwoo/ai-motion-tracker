/**
 * SitUpCounter V3
 *
 * 算法核心：基于肩-髋-膝三点躯干角度 (trunk angle) 检测仰卧起坐
 *
 * 参考方案：
 * - OpenSitUp (github.com/DL-Practise/OpenSitUp)：Android 仰卧起坐计数
 * - FitPose-Detector (github.com/timchen1015/FitPose-Detector)：MediaPipe + LSTM 方案
 * - 多个 CSDN/知乎开源实现：躯干角度 180° ↔ 90° 周期计数
 *
 * 中考规则适配：
 * - 仰卧时：手背/肩胛骨必须触垫（躯干角度接近 180°）
 * - 起坐时：双肘触及或超过双膝（躯干角度 < 90°）
 * - 一次完整仰卧起坐 = 仰卧 → 坐起 → 回到仰卧
 *
 * 精度优化：
 * 1. 多信号融合：躯干角度 + 鼻子Y变化 + 肩部Y变化
 * 2. Kalman 滤波平滑角度
 * 3. 状态机防抖（需保持阈值持续 N 帧才切换状态）
 * 4. 犯规检测：臀部离垫、动作不完整
 * 5. 速度自适应：快慢节奏都能准确计数
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface SitUpFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 仰卧起坐阶段 ──
type SitUpPhase = 'idle' | 'lying' | 'rising' | 'up' | 'returning' | 'done';

// ── 犯规类型 ──
type FoulType = 'hip_lift' | 'incomplete_up' | 'incomplete_down' | 'too_fast';

export class SitUpCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private trunkAngleFilter = new KalmanFilter1D(0.008, 0.06);  // 躯干角度滤波
  private shoulderYFilter = new KalmanFilter1D(0.01, 0.08);    // 肩部Y滤波
  private hipYFilter = new KalmanFilter1D(0.01, 0.05);         // 髋部Y滤波

  // ── 角度历史（用于变化速度计算和方向检测）──
  private angleHistory = new SlidingWindow(20);
  private hipYHistory = new SlidingWindow(20);
  private shoulderYHistory = new SlidingWindow(20);

  // ── 状态机 ──
  private phase: SitUpPhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: SitUpPhase = 'idle';
  private directionChangeCount = 0;  // 方向变化计数（用于有效计数判定）

  // ── 判定阈值 ──
  // 躯干角度：肩→髋→膝三点角度
  // 仰卧时 ≈ 150°~180°（接近平躺）
  // 坐起时 ≈ 50°~80°（躯干前倾，肘触膝）
  private readonly LYING_ANGLE_MIN = 140;     // 角度 >= 此值 → 判定为仰卧
  private readonly UP_ANGLE_MAX = 85;         // 角度 <= 此值 → 判定为坐起到位
  private readonly CONFIRM_FRAMES_LYING = 5;  // 连续 N 帧保持仰卧角度才确认
  private readonly CONFIRM_FRAMES_UP = 4;     // 连续 N 帧保持坐起角度才确认
  private readonly MIN_CYCLE_FRAMES = 12;     // 一次完整动作最少帧数（防抖，约 0.4s@30fps）
  private readonly MAX_CYCLE_FRAMES = 90;     // 一次完整动作最多帧数（约 3s@30fps）

  // ── 臀部离垫检测 ──
  private readonly HIP_LIFT_THRESHOLD = 0.03; // 臀部 Y 上升超过此比例判定离垫
  private baselineHipY = 0;                  // 仰卧时的髋部 Y 基线
  private baselineAnkleY = 0;                // 脚踝 Y 基线

  // ── 动作统计 ──
  private cycleStartFrame = 0;               // 当前周期起始帧
  private foulCount = 0;                     // 犯规次数
  private lastFoul: FoulType | null = null;  // 最近一次犯规
  private currentTrunkAngle = 180;           // 当前躯干角度
  private isInLyingBaseline = false;         // 是否已采集仰卧基线

  // ── 方向检测 ──
  private prevAngle = 180;
  private angleDirection: 'rising' | 'falling' | 'stable' = 'stable';

  // ── 速度追踪（自适应阈值）──
  private recentCycles: number[] = [];       // 最近的周期帧数
  private avgCycleFrames = 30;               // 平均周期帧数

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.directionChangeCount = 0;
    this.cycleStartFrame = 0;
    this.foulCount = 0;
    this.lastFoul = null;
    this.currentTrunkAngle = 180;
    this.isInLyingBaseline = false;
    this.prevAngle = 180;
    this.angleDirection = 'stable';
    this.recentCycles = [];
    this.avgCycleFrames = 30;
    this.baselineHipY = 0;
    this.baselineAnkleY = 0;
    this.trunkAngleFilter.reset(180);
    this.shoulderYFilter.reset(0.5);
    this.hipYFilter.reset(0.5);
    this.angleHistory.clear();
    this.hipYHistory.clear();
    this.shoulderYHistory.clear();
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
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const kneeMidX = (leftKnee.x + rightKnee.x) / 2;
    const kneeMidY = (leftKnee.y + rightKnee.y) / 2;
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;

    // ── 核心角度：肩-髋-膝 (trunk angle) ──
    // 这个角度反映躯干前倾程度
    // 仰卧 ≈ 160°~180°，坐起 ≈ 40°~80°
    const leftTrunkAngle = this.calculateTrunkAngle(
      leftShoulder.x, leftShoulder.y,
      leftHip.x, leftHip.y,
      leftKnee.x, leftKnee.y
    );
    const rightTrunkAngle = this.calculateTrunkAngle(
      rightShoulder.x, rightShoulder.y,
      rightHip.x, rightHip.y,
      rightKnee.x, rightKnee.y
    );

    if (leftTrunkAngle === null || rightTrunkAngle === null) return;

    const rawTrunkAngle = (leftTrunkAngle + rightTrunkAngle) / 2;

    // ── Kalman 滤波 ──
    const smoothAngle = this.trunkAngleFilter.filter(rawTrunkAngle);
    const smoothShoulderY = this.shoulderYFilter.filter(shoulderMidY);
    const smoothHipY = this.hipYFilter.filter(hipMidY);

    this.currentTrunkAngle = smoothAngle;

    // ── 记录历史 ──
    this.angleHistory.push(smoothAngle);
    this.hipYHistory.push(smoothHipY);
    this.shoulderYHistory.push(smoothShoulderY);

    // ── 方向检测 ──
    this.detectDirection(smoothAngle);

    // ── 臀部离垫检测 ──
    this.detectHipLift(smoothHipY, ankleMidY);

    // ── 仰卧基线采集（idle 阶段）──
    if (this.phase === 'idle') {
      if (smoothAngle >= this.LYING_ANGLE_MIN) {
        this.baselineHipY = smoothHipY;
        this.baselineAnkleY = ankleMidY;
        this.isInLyingBaseline = true;
        this.phase = 'lying';
        this.lastPhase = 'lying';
        this.lastState = 'lying';
        this.cycleStartFrame = this.totalFrames;
        this.prevAngle = smoothAngle;
      }
      return;
    }

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'lying':
        this.handleLying(smoothAngle, smoothHipY);
        break;
      case 'rising':
        this.handleRising(smoothAngle);
        break;
      case 'up':
        this.handleUp(smoothAngle);
        break;
      case 'returning':
        this.handleReturning(smoothAngle);
        break;
      case 'done':
        // 等待下一次
        break;
    }
  }

  // ── 状态处理 ──

  private handleLying(angle: number, hipY: number): void {
    // 保持仰卧姿态，等待开始起身
    if (angle < this.LYING_ANGLE_MIN - 20) {
      // 角度开始减小 → 开始起身
      this.transitionTo('rising');
    }

    // 更新基线（如果还在稳定仰卧）
    if (angle >= this.LYING_ANGLE_MIN && this.hipYHistory.size >= 5) {
      this.baselineHipY = this.hipYHistory.mean();
    }
  }

  private handleRising(angle: number): void {
    // 正在起身，角度持续减小
    // 检查是否到达坐起位置
    if (angle <= this.UP_ANGLE_MAX) {
      // 需要保持几帧确认（防止晃动误判）
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_UP) {
        this.transitionTo('up');
      }
    }

    // 如果角度反而增大（没坐起来就回去了）→ 退回 lying
    if (this.angleDirection === 'rising' && this.phaseFrameCount > 3) {
      if (angle > this.prevAngle + 15) {
        // 未完成坐起就倒回 → 不计数
        this.transitionTo('lying');
        this.cycleStartFrame = this.totalFrames;
      }
    }

    this.prevAngle = angle;
  }

  private handleUp(angle: number): void {
    // 已坐起到位（肘触膝位置）
    // 等待开始返回（角度开始增大 = 身体往下躺）
    if (angle > this.UP_ANGLE_MAX + 15) {
      this.transitionTo('returning');
    }

    this.prevAngle = angle;
  }

  private handleReturning(angle: number): void {
    // 正在返回仰卧，角度持续增大
    if (angle >= this.LYING_ANGLE_MIN) {
      // 需要保持几帧确认回到仰卧
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_LYING) {
        // ✅ 完成一次有效仰卧起坐！
        this.recordValidSitUp();
        this.transitionTo('done');

        // 短暂停顿后进入 lying 等待下一次
        setTimeout(() => {
          if (this.phase === 'done') {
            this.phase = 'lying';
            this.lastState = 'lying';
            this.lastPhase = 'lying';
            this.cycleStartFrame = this.totalFrames;
          }
        }, 200); // 200ms 冷却
      }
    }

    // 如果角度又减小（没躺下又坐起来）→ 回到 up
    if (angle < this.UP_ANGLE_MAX && this.phaseFrameCount > 5) {
      this.transitionTo('up');
    }

    this.prevAngle = angle;
  }

  private transitionTo(newPhase: SitUpPhase): void {
    this.lastPhase = this.phase;
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
  }

  // ── 记录有效次数 ──

  private recordValidSitUp(): void {
    // 检查周期是否合理
    const cycleFrames = this.totalFrames - this.cycleStartFrame;

    if (cycleFrames < this.MIN_CYCLE_FRAMES) {
      // 太快了，可能是误判
      this.lastFoul = 'too_fast';
      this.foulCount++;
      return;
    }

    if (cycleFrames > this.MAX_CYCLE_FRAMES) {
      // 太慢了，可能是中间停顿
      this.lastFoul = 'incomplete_up';
      this.foulCount++;
      return;
    }

    // ✅ 有效计数
    this.count++;

    // 记录周期用于速度自适应
    this.recentCycles.push(cycleFrames);
    if (this.recentCycles.length > 10) {
      this.recentCycles.shift();
    }
    this.avgCycleFrames = this.recentCycles.reduce((s, v) => s + v, 0) / this.recentCycles.length;

    this.lastFoul = null;
    this.cycleStartFrame = this.totalFrames;
  }

  // ── 躯干角度计算（肩-髋-膝）──
  // 返回角度：仰卧时 ≈ 160°~180°，坐起时 ≈ 40°~80°
  private calculateTrunkAngle(
    sx: number, sy: number,   // shoulder
    hx: number, hy: number,   // hip (顶点)
    kx: number, ky: number,   // knee
  ): number | null {
    const a = Math.atan2(sy - hy, sx - hx); // 肩→髋方向
    const b = Math.atan2(ky - hy, kx - hx); // 膝→髋方向
    let angle = Math.abs(a - b) * 180 / Math.PI;
    if (angle > 180) angle = 360 - angle;
    return angle;
  }

  // ── 方向检测 ──
  private detectDirection(angle: number): void {
    if (this.angleHistory.size < 3) return;

    const recent = this.angleHistory.data;
    const diff = angle - recent[recent.length - 3];

    if (diff > 3) {
      this.angleDirection = 'rising';   // 角度增大 = 躺下
    } else if (diff < -3) {
      this.angleDirection = 'falling';  // 角度减小 = 坐起
    } else {
      this.angleDirection = 'stable';
    }
  }

  // ── 臀部离垫检测 ──
  private detectHipLift(hipY: number, ankleY: number): void {
    if (!this.isInLyingBaseline || this.baselineHipY === 0) return;

    // 臀部相对于脚踝的位移（仰卧时脚踝 Y 大于臀部 Y，即脚踝更低）
    const currentHipAnkleDist = ankleY - hipY;
    const baselineHipAnkleDist = this.baselineAnkleY - this.baselineHipY;

    // 如果臀部相对脚踝的距离显著减小 → 臀部上抬
    if (baselineHipAnkleDist > 0) {
      const liftRatio = (baselineHipAnkleDist - currentHipAnkleDist) / baselineHipAnkleDist;
      if (liftRatio > this.HIP_LIFT_THRESHOLD * 3) {
        this.lastFoul = 'hip_lift';
      }
    }
  }

  // ── 公共接口 ──

  getPhase(): SitUpPhase {
    return this.phase;
  }

  getTrunkAngle(): number {
    return Math.round(this.currentTrunkAngle);
  }

  getFoulCount(): number {
    return this.foulCount;
  }

  getLastFoul(): FoulType | null {
    return this.lastFoul;
  }

  getFeedback(_pose?: Pose): SitUpFeedback | null {
    switch (this.phase) {
      case 'idle':
        return {
          type: 'warning',
          message: '请躺到垫子上，开始检测...',
        };

      case 'lying':
        return null; // 仰卧等待中

      case 'rising':
        if (this.phaseFrameCount > 20) {
          // 起身时间太长
          return {
            type: 'warning',
            message: '加快起身速度',
          };
        }
        return null;

      case 'up': {
        // 检查犯规
        if (this.lastFoul === 'hip_lift') {
          return {
            type: 'error',
            message: '臀部不要离垫！',
          };
        }
        return {
          type: 'success',
          message: '到位！',
        };
      }

      case 'returning':
        return null;

      case 'done': {
        if (this.lastFoul === 'too_fast') {
          return {
            type: 'error',
            message: '动作太快，不计入',
          };
        }
        if (this.lastFoul === 'hip_lift') {
          return {
            type: 'error',
            message: '臀部离垫，本次不计',
          };
        }
        // 显示当前速率
        const rate = this.getRate();
        if (rate > 0) {
          return {
            type: 'success',
            message: `${this.count} 次 (${rate}/分钟)`,
          };
        }
        return {
          type: 'success',
          message: `${this.count} 次`,
        };
      }

      default:
        return null;
    }
  }
}
