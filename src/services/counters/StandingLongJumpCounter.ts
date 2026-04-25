/**
 * StandingLongJumpCounter V3
 *
 * 核心改进：
 * 1. 身体比例标定（躯干长度 → 像素/厘米换算）
 * 2. 完整状态机（idle → ready → crouch → takeoff → airborne → landing → stable）
 * 3. 多信号融合检测（膝盖角度 + 髋部Y + 脚踝水平位移）
 * 4. Kalman滤波平滑关键点
 * 5. 起跳动作反馈（蹲深不足、落地重心、动作标准度）
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface FormFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 跳远阶段 ──
type JumpPhase = 'idle' | 'ready' | 'crouch' | 'takeoff' | 'airborne' | 'landing' | 'stable';

// ── 标定结果 ──
interface CalibrationResult {
  calibrated: boolean;
  torsoLengthPx: number;     // 躯干像素长度
  pixelsPerCm: number;        // 像素/厘米
  shoulderWidthPx: number;    // 肩宽像素
  userHeightCm: number;       // 用户身高（cm）
  startAnkleX: number;        // 起跳脚踝 X（像素）
}

export class StandingLongJumpCounter extends ExerciseCounter {
  // ── 标定 ──
  private calibration: CalibrationResult = {
    calibrated: false,
    torsoLengthPx: 0,
    pixelsPerCm: 0,
    shoulderWidthPx: 0,
    userHeightCm: 170,  // 默认 170cm
    startAnkleX: 0,
  };
  private stabilityWindow = new SlidingWindow(30);
  private calibrationRequired = true;

  // ── 滤波器 ──
  private kneeAngleFilter = new KalmanFilter1D(0.01, 0.08);
  private ankleXFilter = new KalmanFilter1D(0.005, 0.03);
  private ankleYFilter = new KalmanFilter1D(0.005, 0.03);

  // ── 状态机 ──
  private phase: JumpPhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: JumpPhase = 'idle';

  // ── 动作检测 ──
  private crouchMaxDepth = 0;        // 下蹲最深处
  private crouchKneeMin = 180;       // 蹲下时最小膝盖角度
  private takeoffAnkleX = 0;        // 起跳瞬间脚踝 X
  private takeoffAnkleY = 0;        // 起跳瞬间脚踝 Y
  private maxAirborneY = 0;         // 腾空最高点（Y 最小值）
  private landingAnkleX = 0;        // 落地脚踝 X
  private landingAnkleY = 0;        // 落地脚踝 Y
  private peakDistancePx = 0;       // 最大水平位移（像素）
  private jumpDistanceCm = 0;       // 最终距离（厘米）

  // ── 配置 ──
  private readonly CROUCH_ANGLE_THRESHOLD = 100;   // 膝盖角 < 此值判定蹲下
  private readonly TAKEOFF_ANGLE_THRESHOLD = 140;  // 膝盖角 > 此值判定起跳
  private readonly AIRBORNE_Y_THRESHOLD = 15;      // 脚踝Y上升超过此像素判定腾空
  private readonly LANDING_STABLE_FRAMES = 15;     // 落地后需要稳定帧数
  private readonly MIN_DISTANCE_PX = 20;           // 最小有效位移像素
  private readonly STABLE_VARIANCE_THRESHOLD = 5;  // 方差阈值（判定稳定站立）

  // ── 用户身高（可通过 setter 设置）──
  private _userHeightCm = 170;

  setUserHeight(heightCm: number): void {
    this._userHeightCm = Math.max(100, Math.min(220, heightCm));
    this.calibration.userHeightCm = this._userHeightCm;
    if (this.calibration.calibrated) {
      this.recalculatePixelsPerCm();
    }
  }

  getUserHeight(): number {
    return this._userHeightCm;
  }

  getDistance(): number {
    return Math.round(this.jumpDistanceCm);
  }

  getPhase(): JumpPhase {
    return this.phase;
  }

  isCalibrated(): boolean {
    return this.calibration.calibrated;
  }

  getCalibrationInfo(): CalibrationResult {
    return { ...this.calibration };
  }

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.crouchMaxDepth = 0;
    this.crouchKneeMin = 180;
    this.takeoffAnkleX = 0;
    this.takeoffAnkleY = 0;
    this.maxAirborneY = Infinity;
    this.landingAnkleX = 0;
    this.landingAnkleY = 0;
    this.peakDistancePx = 0;
    this.jumpDistanceCm = 0;
    this.stabilityWindow.clear();
    this.calibrationRequired = true;
    this.kneeAngleFilter.reset(180);
    this.ankleXFilter.reset(0.5);
    this.ankleYFilter.reset(0.8);
  }

  processFrame(pose: Pose): void {
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
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const ankleMidX = (leftAnkle.x + rightAnkle.x) / 2;
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;

    const shoulderWidth = Math.abs(leftShoulder.x - rightShoulder.x);
    const torsoLength = Math.abs(shoulderMidY - hipMidY);

    // ── 计算角度 ──
    const leftKneeAngle = this.calculateAngle(pose, 'left_hip', 'left_knee', 'left_ankle');
    const rightKneeAngle = this.calculateAngle(pose, 'right_hip', 'right_knee', 'right_ankle');
    if (leftKneeAngle === null || rightKneeAngle === null) return;

    const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

    // ── 滤波 ──
    const smoothKneeAngle = this.kneeAngleFilter.filter(avgKneeAngle);
    const smoothAnkleX = this.ankleXFilter.filter(ankleMidX);
    const smoothAnkleY = this.ankleYFilter.filter(ankleMidY);

    // ── 自动标定（idle 阶段）──
    if (this.calibrationRequired) {
      this.stabilityWindow.push(torsoLength);

      if (this.stabilityWindow.size >= 25) {
        const variance = this.stabilityWindow.variance();
        if (variance < this.STABLE_VARIANCE_THRESHOLD && torsoLength > 30) {
          // 用户稳定站立，执行标定
          this.calibration.torsoLengthPx = this.stabilityWindow.mean();
          this.calibration.shoulderWidthPx = shoulderWidth;
          this.calibration.userHeightCm = this._userHeightCm;
          this.calibration.startAnkleX = ankleMidX;
          this.recalculatePixelsPerCm();
          this.calibration.calibrated = true;
          this.calibrationRequired = false;
          this.phase = 'ready';
          this.lastState = 'ready';
          this.lastPhase = 'ready';
        }
      }
      return;
    }

    // ── 状态机驱动 ──
    this.phaseFrameCount++;

    switch (this.phase) {
      case 'ready':
        this.handleReady(smoothKneeAngle, smoothAnkleX, smoothAnkleY);
        break;
      case 'crouch':
        this.handleCrouch(smoothKneeAngle, smoothAnkleX, smoothAnkleY);
        break;
      case 'takeoff':
        this.handleTakeoff(smoothKneeAngle, smoothAnkleX, smoothAnkleY);
        break;
      case 'airborne':
        this.handleAirborne(smoothAnkleX, smoothAnkleY);
        break;
      case 'landing':
        this.handleLanding(smoothKneeAngle, smoothAnkleX, smoothAnkleY);
        break;
      case 'stable':
        // 等待下一次跳跃
        break;
    }

    // 持续追踪最大水平位移
    if (this.calibration.calibrated && this.phase !== 'idle') {
      const displacement = Math.abs(smoothAnkleX - this.calibration.startAnkleX);
      if (displacement > this.peakDistancePx) {
        this.peakDistancePx = displacement;
      }
    }
  }

  // ── 状态处理 ──

  private handleReady(kneeAngle: number, _ankleX: number, _ankleY: number): void {
    if (kneeAngle < this.CROUCH_ANGLE_THRESHOLD) {
      this.transitionTo('crouch');
    }
  }

  private handleCrouch(kneeAngle: number, ankleX: number, _ankleY: number): void {
    // 记录蹲下最深
    if (kneeAngle < this.crouchKneeMin) {
      this.crouchKneeMin = kneeAngle;
    }

    // 检测起身 → 起跳
    if (kneeAngle > this.TAKEOFF_ANGLE_THRESHOLD && this.phaseFrameCount > 5) {
      this.transitionTo('takeoff');
      this.takeoffAnkleX = ankleX;
      this.takeoffAnkleY = _ankleY;
      this.maxAirborneY = Infinity;
    }
  }

  private handleTakeoff(_kneeAngle: number, _ankleX: number, ankleY: number): void {
    // 脚踝 Y 显著上升 → 进入腾空
    if (this.takeoffAnkleY - ankleY > this.AIRBORNE_Y_THRESHOLD) {
      this.transitionTo('airborne');
    }
    // 超时未进入腾空，退回 crouch
    if (this.phaseFrameCount > 15) {
      this.transitionTo('crouch');
    }
  }

  private handleAirborne(ankleX: number, ankleY: number): void {
    // 追踪腾空最高点
    if (ankleY < this.maxAirborneY) {
      this.maxAirborneY = ankleY;
    }

    // 脚踝 Y 回落到接近起跳高度 → 进入落地
    if (ankleY > this.takeoffAnkleY - this.AIRBORNE_Y_THRESHOLD * 0.5) {
      this.landingAnkleX = ankleX;
      this.landingAnkleY = ankleY;
      this.transitionTo('landing');
    }
  }

  private handleLanding(_kneeAngle: number, ankleX: number, ankleY: number): void {
    this.landingAnkleX = ankleX;
    this.landingAnkleY = ankleY;

    // 稳定后记录结果
    if (this.phaseFrameCount >= this.LANDING_STABLE_FRAMES) {
      this.recordJump();
      this.transitionTo('stable');

      // 准备下一次跳跃：更新起始位置
      this.calibration.startAnkleX = ankleX;
    }
  }

  private transitionTo(newPhase: JumpPhase): void {
    this.lastPhase = this.phase;
    this.phase = newPhase;
    this.phaseFrameCount = 0;
    this.lastState = newPhase;
  }

  private recordJump(): void {
    if (!this.calibration.calibrated) return;

    // 计算水平位移（像素）
    const horizontalPx = Math.abs(this.landingAnkleX - this.takeoffAnkleX);

    // 只记录有效跳远（位移足够大）
    if (horizontalPx < this.MIN_DISTANCE_PX) return;

    // 像素 → 厘米
    const distanceCm = horizontalPx / this.calibration.pixelsPerCm;

    // 合理性检查：立定跳远一般在 80cm ~ 350cm 之间
    if (distanceCm < 50 || distanceCm > 400) return;

    this.jumpDistanceCm = distanceCm;
    this.count = Math.round(distanceCm);

    // 重置动作参数，准备下一次
    this.crouchMaxDepth = 0;
    this.crouchKneeMin = 180;
    this.peakDistancePx = 0;

    // 标定有效则进入 ready 状态等待下一跳
    setTimeout(() => {
      if (this.phase === 'stable') {
        this.phase = 'ready';
        this.lastState = 'ready';
      }
    }, 1500);
  }

  private recalculatePixelsPerCm(): void {
    // 躯干长度 ≈ 身高 × 29%（肩峰到髋关节的骨骼测量均值）
    const TORSO_HEIGHT_RATIO = 0.29;
    const expectedTorsoCm = this.calibration.userHeightCm * TORSO_HEIGHT_RATIO;
    this.calibration.pixelsPerCm = this.calibration.torsoLengthPx / expectedTorsoCm;
  }

  getFeedback(_pose?: Pose): FormFeedback | null {
    switch (this.phase) {
      case 'ready':
        return null; // 等待中，不需要反馈

      case 'crouch': {
        // 检查蹲深是否足够
        if (this.crouchKneeMin > 110) {
          return {
            type: 'warning',
            message: '下蹲更深一些，蓄力更充分',
          };
        }
        return null;
      }

      case 'takeoff':
        return {
          type: 'success',
          message: '起跳！',
        };

      case 'airborne':
        return {
          type: 'success',
          message: '腾空中...',
        };

      case 'landing': {
        // 检查落地质量
        const landingQuality = this.assessLanding();
        return landingQuality;
      }

      case 'stable': {
        if (this.jumpDistanceCm > 0) {
          const dist = Math.round(this.jumpDistanceCm);
          let qualityMsg = '';
          if (dist >= 200) qualityMsg = '非常出色！';
          else if (dist >= 150) qualityMsg = '不错的成绩！';
          else qualityMsg = '继续加油！';
          return {
            type: 'success',
            message: `${dist}cm ${qualityMsg}`,
          };
        }
        return null;
      }

      default:
        if (!this.calibration.calibrated) {
          return {
            type: 'warning',
            message: '请站稳，系统正在标定...',
          };
        }
        return null;
    }
  }

  private assessLanding(): FormFeedback | null {
    // 检查是否双脚落地（用起跳和落地的水平距离差异判断）
    if (this.phaseFrameCount < 5) {
      return null; // 还在落地过程中
    }

    const dist = Math.round(this.jumpDistanceCm);

    // 落地稳定性反馈
    if (dist < 80 && dist > 0) {
      return {
        type: 'warning',
        message: '蹬地力量不足，注意摆臂配合',
      };
    }

    if (dist >= 180) {
      return {
        type: 'success',
        message: '完美落地！' + dist + 'cm',
      };
    }

    return null;
  }
}
