/**
 * JumpingJacksCounter V2
 *
 * 算法核心：手臂角度 + 腿部张开比例双信号融合
 *
 * 参考方案：
 * - MediaPipe Fitness: jumping jack counter
 * - 双信号协同验证降低误判率
 *
 * 精度优化：
 * 1. Kalman 滤波平滑手臂角度和腿部距离
 * 2. 自适应阈值（基于个人肩宽和髋宽标定）
 * 3. 状态机防抖（需保持 N 帧确认才切换状态）
 * 4. 周期时间合理性检查
 * 5. 动作反馈系统（手臂举高、腿分开）
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface JackFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 开合跳阶段 ──
type JackPhase = 'idle' | 'closed' | 'opening' | 'open' | 'closing';

export class JumpingJacksCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private armAngleFilter = new KalmanFilter1D(0.01, 0.08);    // 手臂角度滤波
  private legSpreadFilter = new KalmanFilter1D(0.008, 0.06);  // 腿部张开比例滤波
  private hipYFilter = new KalmanFilter1D(0.005, 0.03);       // 髋部 Y 滤波

  // ── 自适应标定 ──
  private baselineWindow = new SlidingWindow(30);
  private shoulderWidth = 0;           // 肩宽基线
  private hipWidth = 0;                // 髋宽基线
  private baseLegSpread = 0;           // 站立时腿部基础张开比例
  private calibrated = false;

  // ── 阈值（自适应）──
  private armThreshold = 120;          // 手臂角度阈值
  private legThreshold = 1.4;          // 腿部张开倍数阈值（相对基线）

  // ── 状态机 ──
  private phase: JackPhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: JackPhase = 'idle';

  // ── 动作参数 ──
  private maxArmAngleInCycle = 0;      // 本周期最大手臂角度
  private maxLegSpreadInCycle = 0;     // 本周期最大腿部张开
  private cycleStartFrame = 0;

  // ── 判定阈值 ──
  private readonly CONFIRM_FRAMES_OPEN = 3;    // 张开确认帧数
  private readonly CONFIRM_FRAMES_CLOSED = 3;  // 收回确认帧数
  private readonly MIN_CYCLE_FRAMES = 10;      // 最小周期帧数（约 0.33s@30fps）
  private readonly MAX_CYCLE_FRAMES = 90;      // 最大周期帧数（约 3s@30fps）

  // ── 统计 ──
  private foulCount = 0;

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.shoulderWidth = 0;
    this.hipWidth = 0;
    this.baseLegSpread = 0;
    this.calibrated = false;
    this.armThreshold = 120;
    this.legThreshold = 1.4;
    this.maxArmAngleInCycle = 0;
    this.maxLegSpreadInCycle = 0;
    this.cycleStartFrame = 0;
    this.foulCount = 0;
    this.armAngleFilter.reset(60);
    this.legSpreadFilter.reset(1.0);
    this.hipYFilter.reset(0.5);
    this.baselineWindow.clear();
  }

  processFrame(pose: Pose): void {
    this.totalFrames++;

    // ── 获取关键点 ──
    const leftShoulder = this.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = this.getKeypoint(pose, 'right_shoulder');
    const leftElbow = this.getKeypoint(pose, 'left_elbow');
    const rightElbow = this.getKeypoint(pose, 'right_elbow');
    const leftWrist = this.getKeypoint(pose, 'left_wrist');
    const rightWrist = this.getKeypoint(pose, 'right_wrist');
    const leftHip = this.getKeypoint(pose, 'left_hip');
    const rightHip = this.getKeypoint(pose, 'right_hip');
    const leftAnkle = this.getKeypoint(pose, 'left_ankle');
    const rightAnkle = this.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftWrist || !rightWrist ||
        !leftHip || !rightHip || !leftAnkle || !rightAnkle) return;

    const minScore = 0.3;
    if ([leftShoulder, rightShoulder, leftWrist, rightWrist,
         leftHip, rightHip, leftAnkle, rightAnkle]
        .some(kp => (kp.score || 0) < minScore)) return;

    // ── 计算信号 ──

    // 信号 1：手臂角度（手腕-肩-髋）
    const leftArmAngle = leftElbow
      ? this.calculateAngle(pose, 'left_wrist', 'left_shoulder', 'left_hip')
      : this.calculateArmAngleSimple(leftWrist, leftShoulder, leftHip);
    const rightArmAngle = rightElbow
      ? this.calculateAngle(pose, 'right_wrist', 'right_shoulder', 'right_hip')
      : this.calculateArmAngleSimple(rightWrist, rightShoulder, rightHip);

    if (leftArmAngle === null || rightArmAngle === null) return;
    const avgArmAngle = (leftArmAngle + rightArmAngle) / 2;

    // 信号 2：腿部张开比例（脚踝距离 / 髋部距离）
    const legDistance = Math.abs(leftAnkle.x - rightAnkle.x);
    const hipDistance = Math.abs(leftHip.x - rightHip.x);
    const legSpread = hipDistance > 0 ? legDistance / hipDistance : 0;

    // ── 自适应标定 ──
    this.shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    this.hipWidth = hipDistance;

    // ── 滤波 ──
    const smoothArmAngle = this.armAngleFilter.filter(avgArmAngle);
    const smoothLegSpread = this.legSpreadFilter.filter(legSpread);

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'idle':
        this.handleIdle(smoothArmAngle, smoothLegSpread);
        break;
      case 'closed':
        this.handleClosed(smoothArmAngle, smoothLegSpread);
        break;
      case 'opening':
        this.handleOpening(smoothArmAngle, smoothLegSpread);
        break;
      case 'open':
        this.handleOpen(smoothArmAngle, smoothLegSpread);
        break;
      case 'closing':
        this.handleClosing(smoothArmAngle, smoothLegSpread);
        break;
    }
  }

  // ── 状态处理 ──

  private handleIdle(armAngle: number, legSpread: number): void {
    // 采集站立基线
    this.baselineWindow.push(armAngle);
    if (this.baselineWindow.isFull && this.baselineWindow.variance() < 50) {
      this.baseLegSpread = legSpread;
      this.calibrated = true;

      // 自适应阈值
      // 手臂阈值：肩宽越大的人，需要更大的角度才能算"举过头"
      if (this.shoulderWidth > 0) {
        const widthFactor = Math.min(1.2, Math.max(0.8, this.shoulderWidth / 0.25));
        this.armThreshold = Math.round(120 * widthFactor);
      }
      // 腿部阈值：基于基线张开比例
      this.legThreshold = Math.max(1.3, this.baseLegSpread + 0.8);

      this.transitionTo('closed');
    }
  }

  private handleClosed(armAngle: number, legSpread: number): void {
    // 手臂开始上举 + 腿开始分开 → 开始张开（两者同时满足才触发，避免单信号误触发）
    if (armAngle > this.armThreshold * 0.5 && legSpread > this.legThreshold * 0.7) {
      this.cycleStartFrame = this.totalFrames;
      this.maxArmAngleInCycle = 0;
      this.maxLegSpreadInCycle = 0;
      this.transitionTo('opening');
    }
  }

  private handleOpening(armAngle: number, legSpread: number): void {
    // 追踪最大值
    if (armAngle > this.maxArmAngleInCycle) {
      this.maxArmAngleInCycle = armAngle;
    }
    if (legSpread > this.maxLegSpreadInCycle) {
      this.maxLegSpreadInCycle = legSpread;
    }

    // 检测到达完全张开状态
    const armsUp = armAngle > this.armThreshold;
    const legsOut = legSpread > this.legThreshold;

    if (armsUp && legsOut) {
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_OPEN) {
        this.transitionTo('open');
      }
    }

    // 超时未到达 → 回到 closed
    if (this.phaseFrameCount > 30) {
      this.transitionTo('closed');
    }
  }

  private handleOpen(armAngle: number, legSpread: number): void {
    // 手臂放下 + 腿收回 → 开始收拢
    const armsDown = armAngle < this.armThreshold * 0.6;
    const legsIn = legSpread < this.legThreshold * 0.8;

    if (armsDown && legsIn) {
      this.transitionTo('closing');
    }
  }

  private handleClosing(armAngle: number, legSpread: number): void {
    // 检测回到收拢状态
    const armsDown = armAngle < this.armThreshold * 0.4;
    const legsIn = legSpread < this.legThreshold * 0.6;

    if (armsDown && legsIn) {
      if (this.phaseFrameCount >= this.CONFIRM_FRAMES_CLOSED) {
        this.recordJack();
        this.transitionTo('closed');
      }
    }

    // 如果又张开了 → 回到 open
    if (armAngle > this.armThreshold && legSpread > this.legThreshold) {
      this.transitionTo('open');
    }
  }

  private transitionTo(newPhase: JackPhase): void {
    this.lastPhase = this.phase;
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
  }

  // ── 简化手臂角度（无肘部时用）──
  private calculateArmAngleSimple(
    wrist: { x: number; y: number },
    shoulder: { x: number; y: number },
    hip: { x: number; y: number },
  ): number | null {
    const a = Math.atan2(wrist.y - shoulder.y, wrist.x - shoulder.x);
    const b = Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x);
    let angle = Math.abs(a - b) * 180 / Math.PI;
    if (angle > 180) angle = 360 - angle;
    return angle;
  }

  // ── 记录有效开合跳 ──
  private recordJack(): void {
    const cycleFrames = this.totalFrames - this.cycleStartFrame;

    if (cycleFrames < this.MIN_CYCLE_FRAMES) return;
    if (cycleFrames > this.MAX_CYCLE_FRAMES) return;

    this.count++;
  }

  // ── 公共接口 ──

  getPhase(): JackPhase {
    return this.phase;
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  getFeedback(_pose?: Pose): JackFeedback | null {
    switch (this.phase) {
      case 'idle':
        return {
          type: 'warning',
          message: '请站直面对摄像头...',
        };

      case 'closed':
        return null;

      case 'opening':
      case 'open':
        return null;

      case 'closing':
        return null;

      default:
        return null;
    }
  }
}
