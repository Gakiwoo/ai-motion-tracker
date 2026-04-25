/**
 * JumpRopeCounter V2
 *
 * 算法核心：双信号融合检测跳绳
 *
 * 信号 1 — 手腕旋转周期检测：
 *   跳绳时手腕在 X-Z 平面上做椭圆/圆周运动。
 *   由于 MediaPipe 是 2D 投影，手腕到手肘的距离会出现周期性变化
 *   （手腕绕过头顶时离手肘最远，经过髋部时最近）。
 *   检测这个距离信号的周期性峰谷 → 一次完整旋转 = 一次跳绳。
 *
 * 信号 2 — 髋部 Y 轴节奏检测：
 *   跳绳时身体做小幅弹跳，髋部 Y 坐标呈现周期性升降。
 *   配合手腕信号做交叉验证，降低误判。
 *
 * 精度优化：
 * 1. Kalman 滤波平滑手腕距离和髋部 Y
 * 2. 状态机防抖（需保持 N 帧确认才切换）
 * 3. 自适应跳绳节奏（动态调整周期窗口）
 * 4. 双信号交叉验证（必须同时满足手腕周期 + 髋部弹跳）
 * 5. 入门阶段检测（识别用户开始跳绳的意图）
 *
 * 参考：
 * - MediaPipe Pose 33 关键点
 * - 跳绳 biomechanics: 手腕旋前/旋后 + 前臂旋转
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface JumpRopeFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 跳绳阶段 ──
type RopePhase = 'idle' | 'detecting' | 'jumping' | 'resting';

export class JumpRopeCounter extends ExerciseCounter {
  // ── 滤波器 ──
  private wristDistFilter = new KalmanFilter1D(0.01, 0.06);  // 手腕距离滤波
  private hipYFilter = new KalmanFilter1D(0.005, 0.03);      // 髋部 Y 滤波
  private ankleYFilter = new KalmanFilter1D(0.005, 0.03);    // 脚踝 Y 滤波

  // ── 信号检测 ──
  private wristDistHistory = new SlidingWindow(40);    // 手腕距离历史
  private hipYHistory = new SlidingWindow(40);         // 髋部 Y 历史
  private wristAngleHistory = new SlidingWindow(40);   // 手腕角度历史（手腕相对身体的角度）

  // ── 状态机 ──
  private phase: RopePhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: RopePhase = 'idle';

  // ── 手腕旋转检测 ──
  private wristCycleDetected = false;    // 检测到一次手腕旋转周期
  private lastWristPeak = false;         // 上次手腕距离是否在峰值
  private wristPeakCount = 0;            // 手腕峰值计数（用于节奏检测）
  private wristCycleFrames = 0;          // 上一次完整周期帧数
  private expectedCycleFrames = 20;      // 期望周期帧数（自适应，初始 ~0.67s@30fps）
  private framesSinceLastPeak = 0;       // 距上一个峰的帧数（防止高频噪声）
  private framesSinceLastCycleStart = 0; // 距上一个周期开始的帧数（自适应用）

  // ── 髋部弹跳检测 ──
  private lastHipValley = false;         // 上次髋部 Y 是否在谷值
  private hipBaselineY = 0;              // 髋部 Y 基线（站立时）
  private baselineWindow = new SlidingWindow(30);

  // ── 双信号融合 ──
  private recentJumpIntervals: number[] = [];  // 最近几次跳跃的帧间隔
  private avgJumpInterval = 20;                // 平均帧间隔（自适应）
  private confirmWindow = new SlidingWindow(6); // 确认窗口（防抖）
  private bounceWindow = new SlidingWindow(60); // 弹跳信号回溯窗口（交叉验证用）

  // ── 统计 ──
  private consecutiveJumps = 0;          // 连续有效跳跃次数
  private missedSwings = 0;              // 漏绳检测

  // ── 阈值配置 ──
  private readonly WRIST_DIST_CHANGE_THRESHOLD = 0.008;  // 手腕距离变化阈值（归一化）
  private readonly HIP_JUMP_THRESHOLD = 0.015;           // 髋部弹跳阈值
  private readonly MIN_CYCLE_FRAMES = 8;                  // 最小周期帧数（约 0.27s@30fps）
  private readonly MAX_CYCLE_FRAMES = 60;                 // 最大周期帧数（约 2s@30fps）
  private readonly CONFIRM_FRAMES_START = 5;              // 开始跳绳确认帧数
  private readonly REST_TIMEOUT_FRAMES = 45;              // 休息超时帧数（约 1.5s）

  // ── 自适应标定 ──
  private shoulderWidth = 0;             // 肩宽（归一化，用于手腕距离归一化）
  private hipWidth = 0;                  // 髋宽
  private calibrated = false;

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.wristCycleDetected = false;
    this.lastWristPeak = false;
    this.wristPeakCount = 0;
    this.wristCycleFrames = 0;
    this.expectedCycleFrames = 20;
    this.framesSinceLastPeak = 0;
    this.framesSinceLastCycleStart = 0;
    this.lastHipValley = false;
    this.hipBaselineY = 0;
    this.consecutiveJumps = 0;
    this.missedSwings = 0;
    this.recentJumpIntervals = [];
    this.avgJumpInterval = 20;
    this.shoulderWidth = 0;
    this.hipWidth = 0;
    this.calibrated = false;
    this.wristDistFilter.reset(0.2);
    this.hipYFilter.reset(0.5);
    this.ankleYFilter.reset(0.8);
    this.wristDistHistory.clear();
    this.hipYHistory.clear();
    this.wristAngleHistory.clear();
    this.baselineWindow.clear();
    this.confirmWindow.clear();
    this.bounceWindow.clear();
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

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return;
    if (!leftWrist || !rightWrist) return;

    const minScore = 0.3;
    if ([leftShoulder, rightShoulder, leftWrist, rightWrist, leftHip, rightHip]
        .some(kp => (kp.score || 0) < minScore)) return;

    // ── 计算信号 ──

    // 信号 1a：手腕到手肘的距离（用平均值）
    const leftWristElbowDist = leftElbow
      ? Math.sqrt(Math.pow(leftWrist.x - leftElbow.x, 2) + Math.pow(leftWrist.y - leftElbow.y, 2))
      : 0;
    const rightWristElbowDist = rightElbow
      ? Math.sqrt(Math.pow(rightWrist.x - rightElbow.x, 2) + Math.pow(rightWrist.y - rightElbow.y, 2))
      : 0;
    const avgWristDist = (leftWristElbowDist + rightWristElbowDist) / 2;

    // 信号 1b：手腕相对肩部的角度（X-Y 平面上，手腕在肩膀下方/上方）
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const wristMidX = (leftWrist.x + rightWrist.x) / 2;
    const wristMidY = (leftWrist.y + rightWrist.y) / 2;
    const wristAngle = Math.atan2(wristMidY - shoulderMidY, wristMidX - shoulderMidX);

    // 信号 2：髋部 Y（弹跳信号）
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    // 信号 3：脚踝 Y（辅助弹跳检测）
    const ankleMidY = (leftAnkle && rightAnkle)
      ? (leftAnkle.y + rightAnkle.y) / 2
      : hipMidY;

    // ── 自适应标定 ──
    this.shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    this.hipWidth = Math.abs(leftHip.x - rightHip.x);

    // ── 滤波 ──
    const smoothWristDist = this.wristDistFilter.filter(avgWristDist);
    const smoothHipY = this.hipYFilter.filter(hipMidY);
    const smoothAnkleY = this.ankleYFilter.filter(ankleMidY);

    // ── 记录历史 ──
    this.wristDistHistory.push(smoothWristDist);
    this.hipYHistory.push(smoothHipY);
    this.wristAngleHistory.push(wristAngle);

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'idle':
        this.handleIdle(smoothHipY);
        break;
      case 'detecting':
        this.handleDetecting(smoothWristDist, smoothHipY);
        break;
      case 'jumping':
        this.handleJumping(smoothWristDist, smoothHipY, smoothAnkleY);
        break;
      case 'resting':
        this.handleResting(smoothHipY);
        break;
    }
  }

  // ── 状态处理 ──

  private handleIdle(hipY: number): void {
    // 采集站立基线
    this.baselineWindow.push(hipY);
    if (this.baselineWindow.isFull && this.baselineWindow.variance() < 5) {
      this.hipBaselineY = this.baselineWindow.mean();
      this.calibrated = true;
    }

    // 检测手腕是否有周期性运动（甩绳意图）
    if (this.wristDistHistory.size >= 20) {
      const variance = this.wristDistHistory.variance();
      const normalizedVar = variance / (this.shoulderWidth * this.shoulderWidth + 0.001);
      // 手腕距离方差显著 → 可能在甩绳
      if (normalizedVar > 0.02 && this.calibrated) {
        this.transitionTo('detecting');
      }
    }
  }

  private handleDetecting(wristDist: number, hipY: number): void {
    // 检测手腕旋转周期 + 髋部弹跳的协同信号
    const wristCycle = this.detectWristCycle(wristDist);
    const hipBounce = this.detectHipBounce(hipY);

    // 双信号协同：手腕在旋转 + 身体在弹跳 → 开始正式计数
    if (wristCycle && hipBounce) {
      this.confirmWindow.push(1);
    } else {
      this.confirmWindow.push(0);
    }

    if (this.confirmWindow.isFull && this.confirmWindow.mean() > 0.5) {
      this.transitionTo('jumping');
      this.consecutiveJumps = 0;
    }

    // 超时未检测到 → 退回 idle
    if (this.phaseFrameCount > 60) {
      this.transitionTo('idle');
    }
  }

  private handleJumping(wristDist: number, hipY: number, ankleY: number): void {
    // 检测髋部/脚踝弹跳信号，记录到回溯窗口
    const hipRise = hipY < this.hipBaselineY - this.HIP_JUMP_THRESHOLD;
    const ankleRise = ankleY < this.hipBaselineY - this.HIP_JUMP_THRESHOLD * 2;
    this.bounceWindow.push(hipRise || ankleRise ? 1 : 0);

    // 检测手腕旋转周期
    const wristCycle = this.detectWristCycle(wristDist);

    // 手腕完成一个周期 → 计一次
    if (wristCycle) {
      // 交叉验证：回溯 N 帧内是否有弹跳信号（宽容窗口，避免帧率错开导致漏计）
      const recentBounces = this.bounceWindow.data;
      const lookback = Math.min(recentBounces.length, this.expectedCycleFrames);
      const slice = recentBounces.slice(-lookback);
      const hasBounce = slice.some(v => v > 0);

      if (hasBounce) {
        this.count++;
        this.consecutiveJumps++;
        this.recordJumpInterval();

        // 自适应周期
        if (this.wristCycleFrames > 0) {
          this.expectedCycleFrames = Math.round(
            this.expectedCycleFrames * 0.7 + this.wristCycleFrames * 0.3
          );
          // 限制范围
          this.expectedCycleFrames = Math.max(this.MIN_CYCLE_FRAMES, Math.min(this.MAX_CYCLE_FRAMES, this.expectedCycleFrames));
        }
      }
    }

    // 检测停止跳绳（髋部回到基线 + 无手腕运动）
    if (this.hipYHistory.isFull && this.wristDistHistory.isFull) {
      const hipVariance = this.hipYHistory.variance();
      const wristVariance = this.wristDistHistory.variance();
      const normalizedWristVar = wristVariance / (this.shoulderWidth * this.shoulderWidth + 0.001);

      if (hipVariance < 0.5 && normalizedWristVar < 0.01) {
        // 检测到稳定 → 进入休息
        this.confirmWindow.push(0);
        if (this.confirmWindow.isFull && this.confirmWindow.mean() < 0.2) {
          this.transitionTo('resting');
        }
      } else {
        this.confirmWindow.push(1);
      }
    }
  }

  private handleResting(hipY: number): void {
    // 更新基线（休息时的髋部位置可能略有变化）
    this.baselineWindow.push(hipY);
    if (this.baselineWindow.isFull) {
      this.hipBaselineY = this.baselineWindow.mean();
    }

    // 检测是否又开始跳绳
    if (this.wristDistHistory.isFull) {
      const variance = this.wristDistHistory.variance();
      const normalizedVar = variance / (this.shoulderWidth * this.shoulderWidth + 0.001);
      if (normalizedVar > 0.02) {
        this.transitionTo('detecting');
      }
    }

    // 超时 → 退回 idle
    if (this.phaseFrameCount > this.REST_TIMEOUT_FRAMES) {
      this.transitionTo('idle');
      this.consecutiveJumps = 0;
    }
  }

  // ── 信号检测器 ──

  /**
   * 检测手腕旋转周期
   * 通过分析手腕到手肘距离的峰谷变化来识别旋转
   * @returns true 如果检测到一个完整周期（峰→谷→峰 或 谷→峰→谷）
   */
  private detectWristCycle(wristDist: number): boolean {
    if (this.wristDistHistory.size < 10) return false;

    const data = this.wristDistHistory.data;

    // 用全窗口均值作为参考线（更稳定）
    const mean = data.reduce((s, v) => s + v, 0) / data.length;

    // 归一化阈值（基于肩宽自适应）
    const threshold = this.shoulderWidth * this.WRIST_DIST_CHANGE_THRESHOLD;

    const currentIsPeak = wristDist > mean + threshold;

    // 最小峰间隔检查：避免高频噪声导致多计
    if (currentIsPeak && !this.lastWristPeak) {
      if (this.framesSinceLastPeak >= this.MIN_CYCLE_FRAMES) {
        this.wristPeakCount++;
        this.framesSinceLastPeak = 0;
      }
    }

    this.lastWristPeak = currentIsPeak;

    // 每 2 个峰 = 1 个完整周期
    if (this.wristPeakCount >= 2) {
      this.wristPeakCount = 0;
      // 记录本周期帧数用于自适应
      this.wristCycleFrames = this.framesSinceLastCycleStart;
      this.framesSinceLastCycleStart = 0;
      return true;
    }

    this.framesSinceLastPeak++;
    this.framesSinceLastCycleStart++;

    return false;
  }

  /**
   * 检测髋部弹跳
   * 髋部 Y 上升（Y 值减小）超过阈值
   */
  private detectHipBounce(hipY: number): boolean {
    if (!this.calibrated || this.hipBaselineY === 0) return false;

    const rise = this.hipBaselineY - hipY;
    return rise > this.HIP_JUMP_THRESHOLD;
  }

  private recordJumpInterval(): void {
    // 简化：用期望周期作为间隔
    this.recentJumpIntervals.push(this.expectedCycleFrames);
    if (this.recentJumpIntervals.length > 10) {
      this.recentJumpIntervals.shift();
    }
    this.avgJumpInterval = this.recentJumpIntervals.reduce((s, v) => s + v, 0) / this.recentJumpIntervals.length;
  }

  private transitionTo(newPhase: RopePhase): void {
    this.lastPhase = this.phase;
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
    this.confirmWindow.clear();
  }

  // ── 公共接口 ──

  getPhase(): RopePhase {
    return this.phase;
  }

  getConsecutiveJumps(): number {
    return this.consecutiveJumps;
  }

  isCalibrated(): boolean {
    return this.calibrated;
  }

  getFeedback(_pose?: Pose): JumpRopeFeedback | null {
    switch (this.phase) {
      case 'idle':
        if (!this.calibrated) {
          return {
            type: 'warning',
            message: '请站稳，系统正在标定...',
          };
        }
        return {
          type: 'warning',
          message: '准备跳绳，手腕开始甩动...',
        };

      case 'detecting':
        return null; // 检测中，静默

      case 'jumping': {
        if (this.count === 0 && this.phaseFrameCount > 30) {
          return {
            type: 'warning',
            message: '保持节奏，手臂多甩一些...',
          };
        }
        if (this.count > 0 && this.count % 50 === 0) {
          return {
            type: 'success',
            message: `${this.count} 次！继续保持！`,
          };
        }
        return null;
      }

      case 'resting': {
        if (this.consecutiveJumps > 0) {
          return {
            type: 'success',
            message: `${this.count} 次（连续 ${this.consecutiveJumps} 次）`,
          };
        }
        return null;
      }

      default:
        return null;
    }
  }
}
