import { useCallback, useState } from 'react';
import { ExerciseType, Pose } from '../types';
import PoseDetectionService from '../services/PoseDetectionService';

export interface FormFeedback {
  type: 'warning' | 'error' | 'success';
  message: string;
}

export function useExerciseFeedback() {
  const [feedback, setFeedback] = useState<FormFeedback | null>(null);

  const checkSquatsForm = useCallback((pose: Pose): FormFeedback | null => {
    // Check back angle to detect if user is bending back excessively
    const leftShoulder = PoseDetectionService.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = PoseDetectionService.getKeypoint(pose, 'right_shoulder');
    const leftHip = PoseDetectionService.getKeypoint(pose, 'left_hip');
    const rightHip = PoseDetectionService.getKeypoint(pose, 'right_hip');
    const leftKnee = PoseDetectionService.getKeypoint(pose, 'left_knee');
    const rightKnee = PoseDetectionService.getKeypoint(pose, 'right_knee');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip || !leftKnee || !rightKnee) {
      return null;
    }

    // Calculate torso angle (shoulder-hip line relative to vertical)
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;

    const torsoAngle = Math.abs(
      Math.atan2(shoulderMidX - hipMidX, shoulderMidY - hipMidY) * 180 / Math.PI
    );

    // Check knee position relative to toe (knee should not go far past toes)
    const leftKneeAngle = PoseDetectionService.calculateAngle(
      leftShoulder,
      leftKnee,
      leftHip
    );

    // If back is leaning forward more than 45 degrees, warn user
    if (torsoAngle > 45) {
      return {
        type: 'warning',
        message: '背部挺直，不要弓背',
      };
    }

    // If knee is going too far past ankle in squat
    if (leftKneeAngle !== null && leftKneeAngle < 70) {
      return {
        type: 'warning',
        message: '膝盖不要超过脚尖',
      };
    }

    return null;
  }, []);

  const checkJumpForm = useCallback((pose: Pose): FormFeedback | null => {
    // 原地纵跳摸高专用姿态反馈（不依赖 counter 状态）
    const leftShoulder = PoseDetectionService.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = PoseDetectionService.getKeypoint(pose, 'right_shoulder');
    const leftHip = PoseDetectionService.getKeypoint(pose, 'left_hip');
    const rightHip = PoseDetectionService.getKeypoint(pose, 'right_hip');
    const leftKnee = PoseDetectionService.getKeypoint(pose, 'left_knee');
    const rightKnee = PoseDetectionService.getKeypoint(pose, 'right_knee');
    const leftAnkle = PoseDetectionService.getKeypoint(pose, 'left_ankle');
    const rightAnkle = PoseDetectionService.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
        !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return null;
    }

    // 1. 身体前倾检测（纵跳需要保持直立）
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    const torsoAngle = Math.abs(
      Math.atan2(shoulderMidX - hipMidX, shoulderMidY - hipMidY) * 180 / Math.PI
    );

    if (torsoAngle > 30) {
      return {
        type: 'warning',
        message: '保持身体直立，不要过度前倾',
      };
    }

    // 2. 膝盖深度检测（下蹲蓄力阶段）
    const leftKneeAngle = PoseDetectionService.calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = PoseDetectionService.calculateAngle(rightHip, rightKnee, rightAnkle);

    if (leftKneeAngle !== null && rightKneeAngle !== null) {
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

      // 过深的下蹲对膝盖有风险
      if (avgKneeAngle < 75) {
        return {
          type: 'warning',
          message: '下蹲过深，注意膝盖安全',
        };
      }

      // 半蹲蓄力姿态 → 提示摆臂
      if (avgKneeAngle > 100 && avgKneeAngle < 130) {
        return {
          type: 'success',
          message: '蓄力中，准备起跳',
        };
      }
    }

    // 3. 落地缓冲检测（膝盖应微屈缓冲，不应完全锁死）
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;
    const kneeMidY = (leftKnee.y + rightKnee.y) / 2;

    // 膝盖高于脚踝太多说明还在腾空
    if (kneeMidY < ankleMidY - 80) {
      return null;
    }

    // 落地后膝盖过直（无缓冲）→ 提示
    if (leftKneeAngle !== null && rightKneeAngle !== null) {
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
      if (avgKneeAngle > 175) {
        return {
          type: 'warning',
          message: '落地时膝盖微屈缓冲，保护关节',
        };
      }
    }

    // 4. 双脚对称性
    const ankleDiff = Math.abs(leftAnkle.y - rightAnkle.y);
    if (ankleDiff > 25) {
      return {
        type: 'warning',
        message: '双脚同时起跳落地',
      };
    }

    return null;
  }, []);

  const checkLongJumpForm = useCallback((pose: Pose): FormFeedback | null => {
    // 立定跳远专用姿态反馈（不依赖 counter 状态）
    const leftShoulder = PoseDetectionService.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = PoseDetectionService.getKeypoint(pose, 'right_shoulder');
    const leftHip = PoseDetectionService.getKeypoint(pose, 'left_hip');
    const rightHip = PoseDetectionService.getKeypoint(pose, 'right_hip');
    const leftKnee = PoseDetectionService.getKeypoint(pose, 'left_knee');
    const rightKnee = PoseDetectionService.getKeypoint(pose, 'right_knee');
    const leftAnkle = PoseDetectionService.getKeypoint(pose, 'left_ankle');
    const rightAnkle = PoseDetectionService.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
        !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return null;
    }

    // 1. 背部前倾检测
    const shoulderMidX = (leftShoulder.x + rightShoulder.x) / 2;
    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidX = (leftHip.x + rightHip.x) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;

    const torsoAngle = Math.abs(
      Math.atan2(shoulderMidX - hipMidX, shoulderMidY - hipMidY) * 180 / Math.PI
    );

    if (torsoAngle > 45) {
      return {
        type: 'warning',
        message: '身体保持直立，不要过度前倾',
      };
    }

    // 2. 膝盖角度检测（下蹲深度）
    const leftKneeAngle = PoseDetectionService.calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = PoseDetectionService.calculateAngle(rightHip, rightKnee, rightAnkle);

    if (leftKneeAngle !== null && rightKneeAngle !== null) {
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;
      if (avgKneeAngle < 80) {
        return {
          type: 'warning',
          message: '下蹲过深，注意膝盖安全',
        };
      }
      if (avgKneeAngle > 130 && avgKneeAngle < 160) {
        // 半蹲状态 → 提示摆臂蓄力
        return {
          type: 'success',
          message: '准备起跳，注意摆臂配合',
        };
      }
    }

    // 3. 落地双脚对称性检测
    const ankleDiff = Math.abs(leftAnkle.y - rightAnkle.y);
    if (ankleDiff > 30) {
      return {
        type: 'warning',
        message: '尽量双脚同时落地',
      };
    }

    return null;
  }, []);

  const checkSitUpForm = useCallback((pose: Pose): FormFeedback | null => {
    // 仰卧起坐专用姿态反馈（不依赖 counter 状态）
    const leftShoulder = PoseDetectionService.getKeypoint(pose, 'left_shoulder');
    const rightShoulder = PoseDetectionService.getKeypoint(pose, 'right_shoulder');
    const leftHip = PoseDetectionService.getKeypoint(pose, 'left_hip');
    const rightHip = PoseDetectionService.getKeypoint(pose, 'right_hip');
    const leftKnee = PoseDetectionService.getKeypoint(pose, 'left_knee');
    const rightKnee = PoseDetectionService.getKeypoint(pose, 'right_knee');
    const leftAnkle = PoseDetectionService.getKeypoint(pose, 'left_ankle');
    const rightAnkle = PoseDetectionService.getKeypoint(pose, 'right_ankle');

    if (!leftShoulder || !rightShoulder || !leftHip || !rightHip ||
        !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
      return null;
    }

    const shoulderMidY = (leftShoulder.y + rightShoulder.y) / 2;
    const hipMidY = (leftHip.y + rightHip.y) / 2;
    const kneeMidY = (leftKnee.y + rightKnee.y) / 2;
    const ankleMidY = (leftAnkle.y + rightAnkle.y) / 2;

    // ── 计算躯干角度（肩-髋-膝）──
    const calcTrunkAngle = (sx: number, sy: number, hx: number, hy: number, kx: number, ky: number): number | null => {
      const a = Math.atan2(sy - hy, sx - hx);
      const b = Math.atan2(ky - hy, kx - hx);
      let angle = Math.abs(a - b) * 180 / Math.PI;
      if (angle > 180) angle = 360 - angle;
      return angle;
    };

    const leftTrunk = calcTrunkAngle(leftShoulder.x, leftShoulder.y, leftHip.x, leftHip.y, leftKnee.x, leftKnee.y);
    const rightTrunk = calcTrunkAngle(rightShoulder.x, rightShoulder.y, rightHip.x, rightHip.y, rightKnee.x, rightKnee.y);

    if (leftTrunk === null || rightTrunk === null) return null;
    const trunkAngle = (leftTrunk + rightTrunk) / 2;

    // 1. 仰卧姿态：检查膝盖角度是否正确（大小腿应呈约 90°）
    const leftKneeAngle = PoseDetectionService.calculateAngle(leftHip, leftKnee, leftAnkle);
    const rightKneeAngle = PoseDetectionService.calculateAngle(rightHip, rightKnee, rightAnkle);

    if (leftKneeAngle !== null && rightKneeAngle !== null) {
      const avgKneeAngle = (leftKneeAngle + rightKneeAngle) / 2;

      // 大小腿角度太钝 → 腿伸得太直
      if (avgKneeAngle > 130) {
        return {
          type: 'warning',
          message: '膝盖弯曲约90°，大小腿呈直角',
        };
      }
      // 大小腿角度太锐 → 腿收太紧
      if (avgKneeAngle < 50) {
        return {
          type: 'warning',
          message: '脚放远一些，膝盖保持约90°',
        };
      }
    }

    // 2. 臀部离垫检测（髋部相对脚踝距离异常）
    const hipAnkleDist = ankleMidY - hipMidY;
    if (hipAnkleDist < 30) {
      return {
        type: 'error',
        message: '臀部不要离垫！',
      };
    }

    // 3. 起身过程中的姿态反馈
    if (trunkAngle < 140 && trunkAngle > 85) {
      // 正在起身但还没到位 → 鼓励
      return {
        type: 'success',
        message: '继续起身，肘部触膝',
      };
    }

    // 4. 坐起到位反馈
    if (trunkAngle <= 85) {
      return {
        type: 'success',
        message: '到位！保持节奏',
      };
    }

    // 5. 双脚对称性
    const ankleDiff = Math.abs(leftAnkle.y - rightAnkle.y);
    if (ankleDiff > 25) {
      return {
        type: 'warning',
        message: '双脚保持平齐',
      };
    }

    return null;
  }, []);

  const getFeedback = useCallback((pose: Pose, exerciseType: ExerciseType): FormFeedback | null => {
    switch (exerciseType) {
      case 'squats':
        return checkSquatsForm(pose);
      case 'standing_long_jump':
        return checkLongJumpForm(pose);
      case 'vertical_jump':
        return checkJumpForm(pose);
      case 'sit_ups':
        return checkSitUpForm(pose);
      default:
        return null;
    }
  }, [checkSquatsForm, checkJumpForm, checkLongJumpForm, checkSitUpForm]);

  return { feedback, setFeedback, getFeedback };
}
