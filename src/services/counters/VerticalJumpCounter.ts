/**
 * VerticalJumpCounter V3
 *
 * 核心改进：
 * 1. 身体比例标定（躯干长度 → 像素/厘米换算，复用立定跳远的标定思路）
 * 2. 完整状态机（idle → ready → crouch → takeoff → airborne → landing → stable）
 * 3. 多信号融合检测（膝盖角度 + 脚踝Y上升 + 髋部Y上升）
 * 4. Kalman滤波平滑关键点
 * 5. 起跳动作反馈（蹲深、腾空、落地缓冲、成绩评价）
 * 6. 支持连续多次纵跳，自动记录最佳成绩
 */

import { Pose } from '../../types';
import { ExerciseCounter } from '../ExerciseCounter';
import { KalmanFilter1D, SlidingWindow } from '../../utils/filters';

// ── 反馈类型 ──
export interface FormFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

// ── 纵跳阶段 ──
type JumpPhase = 'idle' | 'ready' | 'crouch' | 'takeoff' | 'airborne' | 'landing' | 'stable';

// ── 标定结果 ──
interface CalibrationResult {
  calibrated: boolean;
  torsoLengthPx: number;
  pixelsPerCm: number;
  shoulderWidthPx: number;
  userHeightCm: number;
  baselineAnkleY: number;     // 站立时脚踝Y基准
  baselineHipY: number;       // 站立时髋部Y基准
}

export class VerticalJumpCounter extends ExerciseCounter {
  // ── 标定 ──
  private calibration: CalibrationResult = {
    calibrated: false,
    torsoLengthPx: 0,
    pixelsPerCm: 0,
    shoulderWidthPx: 0,
    userHeightCm: 170,
    baselineAnkleY: 0,
    baselineHipY: 0,
  };
  private stabilityWindow = new SlidingWindow(30);
  private calibrationRequired = true;

  // ── 滤波器 ──
  private kneeAngleFilter = new KalmanFilter1D(0.01, 0.08);
  private ankleYFilter = new KalmanFilter1D(0.005, 0.03);
  private hipYFilter = new KalmanFilter1D(0.005, 0.03);

  // ── 状态机 ──
  private phase: JumpPhase = 'idle';
  private phaseFrameCount = 0;
  private lastPhase: JumpPhase = 'idle';

  // ── 动作检测 ──
  private crouchKneeMin = 180;         // 蹲下时最小膝盖角度
  private crouchAnkleY = 0;            // 下蹲最深处脚踝Y（最大值）
  private crouchHipY = 0;              // 下蹲最深处髋部Y
  private takeoffAnkleY = 0;           // 起跳瞬间脚踝Y
  private takeoffHipY = 0;             // 起跳瞬间髋部Y
  private airborneMinAnkleY = Infinity;// 腾空时脚踝最高点（Y最小）
  private airborneMinHipY = Infinity;  // 腾空时髋部最高点
  private landingAnkleY = 0;           // 落地脚踝Y
  private maxJumpHeightCm = 0;         // 历史最佳高度（厘米）
  private currentJumpHeightCm = 0;     // 当前跳高度（厘米）
  private jumpCount = 0;               // 成功跳跃次数

  // ── 配置 ──
  private readonly CROUCH_ANGLE_THRESHOLD = 100;     // 膝盖角 < 此值判定蹲下
  private readonly TAKEOFF_ANGLE_THRESHOLD = 145;    // 膝盖角 > 此值判定起跳
  private readonly AIRBORNE_Y_THRESHOLD = 12;       // 脚踝Y上升超过此像素判定腾空
  private readonly LANDING_STABLE_FRAMES = 12;      // 落地后需要稳定帧数
  private readonly MIN_JUMP_HEIGHT_PX = 8;          // 最小有效腾空高度像素
  private readonly STABLE_VARIANCE_THRESHOLD = 5;   // 方差阈值（判定稳定站立）

  // ── 用户身高 ──
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

  getHeight(): number {
    return Math.round(this.maxJumpHeightCm);
  }

  getCurrentHeight(): number {
    return Math.round(this.currentJumpHeightCm);
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

  getJumpCount(): number {
    return this.jumpCount;
  }

  reset(): void {
    super.reset();
    this.phase = 'idle';
    this.phaseFrameCount = 0;
    this.lastPhase = 'idle';
    this.crouchKneeMin = 180;
    this.crouchAnkleY = 0;
    this.crouchHipY = 0;
    this.takeoffAnkleY = 0;
    this.takeoffHipY = 0;
    this.airborneMinAnkleY = Infinity;
    this.airborneMinHipY = Infinity;
    this.landingAnkleY = 0;
    this.maxJumpHeightCm = 0;
    this.currentJumpHeightCm = 0;
    this.jumpCount = 0;
    this.stabilityWindow.clear();
    this.calibrationRequired = true;
    this.calibration.calibrated = false;
    this.kneeAngleFilter.reset(180);
    this.ankleYFilter.reset(0.8);
    this.hipYFilter.reset(0.5);
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
    const smoothAnkleY = this.ankleYFilter.filter(ankleMidY);
    const smoothHipY = this.hipYFilter.filter(hipMidY);

    // ── 自动标定（idle 阶段）──
    if (this.calibrationRequired) {
      this.stabilityWindow.push(torsoLength);

      if (this.stabilityWindow.size >= 25) {
        const variance = this.stabilityWindow.variance();
        if (variance < this.STABLE_VARIANCE_THRESHOLD && torsoLength > 30) {
          this.calibration.torsoLengthPx = this.stabilityWindow.mean();
          this.calibration.shoulderWidthPx = shoulderWidth;
          this.calibration.userHeightCm = this._userHeightCm;
          this.calibration.baselineAnkleY = ankleMidY;
          this.calibration.baselineHipY = hipMidY;
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
        this.handleReady(smoothKneeAngle, smoothAnkleY, smoothHipY);
        break;
      case 'crouch':
        this.handleCrouch(smoothKneeAngle, smoothAnkleY, smoothHipY);
        break;
      case 'takeoff':
        this.handleTakeoff(smoothAnkleY, smoothHipY);
        break;
      case 'airborne':
        this.handleAirborne(smoothAnkleY, smoothHipY);
        break;
      case 'landing':
        this.handleLanding(smoothKneeAngle, smoothAnkleY, smoothHipY);
        break;
      case 'stable':
        break;
    }
  }

  // ── 状态处理 ──

  private handleReady(kneeAngle: number, _ankleY: number, _hipY: number): void {
    if (kneeAngle < this.CROUCH_ANGLE_THRESHOLD) {
      this.transitionTo('crouch');
    }
  }

  private handleCrouch(kneeAngle: number, ankleY: number, hipY: number): void {
    // 记录蹲下最深处
    if (kneeAngle < this.crouchKneeMin) {
      this.crouchKneeMin = kneeAngle;
    }
    // 脚踝Y越大越低（下蹲时脚踝不变但髋部下降，这里记录参考）
    if (ankleY > this.crouchAnkleY) {
      this.crouchAnkleY = ankleY;
    }
    if (hipY > this.crouchHipY) {
      this.crouchHipY = hipY;
    }

    // 检测起身起跳：膝盖角从深蹲恢复到接近伸直
    if (kneeAngle > this.TAKEOFF_ANGLE_THRESHOLD && this.phaseFrameCount > 4) {
      this.takeoffAnkleY = ankleY;
      this.takeoffHipY = hipY;
      this.airborneMinAnkleY = Infinity;
      this.airborneMinHipY = Infinity;
      this.transitionTo('takeoff');
    }
  }

  private handleTakeoff(ankleY: number, hipY: number): void {
    // 脚踝Y显著上升 → 进入腾空
    // 使用起跳瞬间作为参考（而非蹲底），更准确反映腾空高度
    const ankleRise = this.takeoffAnkleY - ankleY;
    if (ankleRise > this.AIRBORNE_Y_THRESHOLD) {
      this.transitionTo('airborne');
    }
    // 超时未进入腾空 → 退回 crouch
    if (this.phaseFrameCount > 12) {
      this.transitionTo('crouch');
    }
  }

  private handleAirborne(ankleY: number, hipY: number): void {
    // 追踪腾空最高点（Y最小 = 位置最高）
    if (ankleY < this.airborneMinAnkleY) {
      this.airborneMinAnkleY = ankleY;
    }
    if (hipY < this.airborneMinHipY) {
      this.airborneMinHipY = hipY;
    }

    // 脚踝Y回落 → 进入落地
    // 用起跳瞬间的脚踝Y作为参考来判断是否回到地面附近
    if (ankleY > this.takeoffAnkleY - this.AIRBORNE_Y_THRESHOLD * 0.3) {
      this.landingAnkleY = ankleY;
      this.transitionTo('landing');
    }
  }

  private handleLanding(kneeAngle: number, ankleY: number, _hipY: number): void {
    this.landingAnkleY = ankleY;

    // 稳定后记录结果
    if (this.phaseFrameCount >= this.LANDING_STABLE_FRAMES) {
      this.recordJump();
      this.transitionTo('stable');
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

    // ── 高度计算（多信号融合）──
    // 使用起跳瞬间（takeoff）而非蹲底（crouch）作为参考点，
    // 避免把蹲深算进跳跃高度。

    // 信号1：脚踝上升高度（相对于起跳瞬间）
    const ankleRisePx = this.takeoffAnkleY - this.airborneMinAnkleY;

    // 信号2：髋部上升高度（相对于起跳瞬间）
    const hipRisePx = this.takeoffHipY - this.airborneMinHipY;

    // 取有效的最大上升值（取正值较大的那个）
    const absoluteRisePx = Math.max(ankleRisePx, hipRisePx);

    // 只用有效的上升值
    if (absoluteRisePx < this.MIN_JUMP_HEIGHT_PX) return;

    // 像素 → 厘米
    const heightCm = absoluteRisePx / this.calibration.pixelsPerCm;

    // 合理性检查：原地纵跳一般在 15cm ~ 80cm 之间（普通人 25-45cm，运动员可达 70cm+）
    if (heightCm < 10 || heightCm > 120) return;

    this.currentJumpHeightCm = heightCm;
    this.jumpCount++;

    // 更新最佳成绩
    if (heightCm > this.maxJumpHeightCm) {
      this.maxJumpHeightCm = heightCm;
      this.count = Math.round(heightCm);
    }

    // 重置本次跳跃参数
    this.crouchKneeMin = 180;
    this.crouchAnkleY = 0;
    this.crouchHipY = 0;

    // 更新基准（落地位置可能略有偏移）
    this.calibration.baselineAnkleY = this.landingAnkleY;

    // 1 秒后自动回到 ready 状态
    setTimeout(() => {
      if (this.phase === 'stable') {
        this.phase = 'ready';
        this.lastState = 'ready';
      }
    }, 1000);
  }

  private recalculatePixelsPerCm(): void {
    // 躯干长度 ≈ 身高 × 29%（肩峰到髋关节）
    const TORSO_HEIGHT_RATIO = 0.29;
    const expectedTorsoCm = this.calibration.userHeightCm * TORSO_HEIGHT_RATIO;
    this.calibration.pixelsPerCm = this.calibration.torsoLengthPx / expectedTorsoCm;
  }

  getFeedback(_pose?: Pose): FormFeedback | null {
    switch (this.phase) {
      case 'ready':
        return null;

      case 'crouch': {
        if (this.crouchKneeMin > 115) {
          return {
            type: 'warning',
            message: '下蹲更深一些，蓄力更充分',
          };
        }
        return null;
      }

      case 'takeoff':
        return { type: 'success', message: '起跳！' };

      case 'airborne':
        return { type: 'success', message: '腾空中...' };

      case 'landing': {
        if (this.phaseFrameCount < 4) return null;
        const h = Math.round(this.currentJumpHeightCm);
        if (h > 0 && h < 25) {
          return { type: 'warning', message: '蹬地力量不足，注意摆臂配合' };
        }
        if (h >= 50) {
          return { type: 'success', message: '腾空高度不错！' };
        }
        return null;
      }

      case 'stable': {
        const h = Math.round(this.currentJumpHeightCm);
        if (h <= 0) return null;
        const best = Math.round(this.maxJumpHeightCm);
        let msg = '';
        if (h >= 55) msg = '出色的弹跳！';
        else if (h >= 40) msg = '不错的成绩！';
        else if (h >= 25) msg = '继续加油！';
        else msg = '蹬地更有力一些';

        const suffix = h >= best ? ` 最佳: ${best}cm` : ` 最佳: ${best}cm`;
        return { type: 'success', message: `${h}cm ${msg}${suffix}` };
      }

      default:
        if (!this.calibration.calibrated) {
          return { type: 'warning', message: '请站稳，系统正在标定...' };
        }
        return null;
    }
  }
}
