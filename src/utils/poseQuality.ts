import { Pose, Keypoint } from '../types';

export type PoseQualityStatus =
  | 'unknown'
  | 'not_visible'
  | 'too_close'
  | 'too_far'
  | 'near_edge'
  | 'low_confidence'
  | 'good';

export interface PoseQualityResult {
  status: PoseQualityStatus;
  canStart: boolean;
  message: string;
  visibilityScore: number;
  averageScore: number;
  bodyHeightRatio: number;
}

const CORE_KEYPOINTS = [
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
];

const MIN_VISIBLE_SCORE = 0.3;
const MIN_CORE_VISIBILITY = 0.75;
const MIN_AVERAGE_SCORE = 0.5;
const MIN_BODY_HEIGHT_RATIO = 0.42;
const MAX_BODY_HEIGHT_RATIO = 0.88;
const EDGE_MARGIN_RATIO = 0.04;

function emptyResult(message: string): PoseQualityResult {
  return {
    status: 'unknown',
    canStart: false,
    message,
    visibilityScore: 0,
    averageScore: 0,
    bodyHeightRatio: 0,
  };
}

function getCoreKeypoints(pose: Pose): Keypoint[] {
  return CORE_KEYPOINTS
    .map((name) => pose.keypoints.find((kp) => kp.name === name))
    .filter((kp): kp is Keypoint => Boolean(kp));
}

export function analyzePoseQuality(pose: Pose | null | undefined): PoseQualityResult {
  if (!pose || pose.keypoints.length === 0) {
    return emptyResult('请站到镜头前，保持全身可见');
  }

  const frameWidth = pose.frameWidth || 480;
  const frameHeight = pose.frameHeight || 360;
  const core = getCoreKeypoints(pose);
  const visibleCore = core.filter((kp) => (kp.score ?? 0) >= MIN_VISIBLE_SCORE);
  const visibilityScore = visibleCore.length / CORE_KEYPOINTS.length;
  const averageScore = core.length === 0
    ? 0
    : core.reduce((sum, kp) => sum + (kp.score ?? 0), 0) / core.length;

  if (visibilityScore <= MIN_CORE_VISIBILITY) {
    return {
      status: 'not_visible',
      canStart: false,
      message: '请让肩、髋、膝、脚踝完整入镜',
      visibilityScore,
      averageScore,
      bodyHeightRatio: 0,
    };
  }

  if (averageScore < MIN_AVERAGE_SCORE) {
    return {
      status: 'low_confidence',
      canStart: false,
      message: '光线或遮挡影响识别，请调整环境',
      visibilityScore,
      averageScore,
      bodyHeightRatio: 0,
    };
  }

  const xs = visibleCore.map((kp) => kp.x);
  const ys = visibleCore.map((kp) => kp.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const bodyHeightRatio = (maxY - minY) / frameHeight;
  const edgeMarginX = frameWidth * EDGE_MARGIN_RATIO;
  const edgeMarginY = frameHeight * EDGE_MARGIN_RATIO;

  if (bodyHeightRatio > MAX_BODY_HEIGHT_RATIO) {
    return {
      status: 'too_close',
      canStart: false,
      message: '离镜头稍远一点，避免动作出框',
      visibilityScore,
      averageScore,
      bodyHeightRatio,
    };
  }

  if (bodyHeightRatio < MIN_BODY_HEIGHT_RATIO) {
    return {
      status: 'too_far',
      canStart: false,
      message: '靠近一点，让身体占据更多画面',
      visibilityScore,
      averageScore,
      bodyHeightRatio,
    };
  }

  if (minX < edgeMarginX || maxX > frameWidth - edgeMarginX || minY < edgeMarginY || maxY > frameHeight - edgeMarginY) {
    return {
      status: 'near_edge',
      canStart: false,
      message: '往画面中间站一点，保持四肢不出框',
      visibilityScore,
      averageScore,
      bodyHeightRatio,
    };
  }

  return {
    status: 'good',
    canStart: true,
    message: '准备好了，点击开始训练',
    visibilityScore,
    averageScore,
    bodyHeightRatio,
  };
}
