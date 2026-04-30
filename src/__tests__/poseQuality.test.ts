import { analyzePoseQuality } from '../utils/poseQuality';
import { Pose } from '../types';

const coreNames = [
  'left_shoulder',
  'right_shoulder',
  'left_hip',
  'right_hip',
  'left_knee',
  'right_knee',
  'left_ankle',
  'right_ankle',
];

function makePose(options: {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  score?: number;
  missing?: string[];
} = {}): Pose {
  const {
    minX = 160,
    maxX = 320,
    minY = 40,
    maxY = 330,
    score = 0.9,
    missing = [],
  } = options;
  const points = [
    [minX, minY],
    [maxX, minY],
    [minX, minY + (maxY - minY) * 0.35],
    [maxX, minY + (maxY - minY) * 0.35],
    [minX, minY + (maxY - minY) * 0.68],
    [maxX, minY + (maxY - minY) * 0.68],
    [minX, maxY],
    [maxX, maxY],
  ];

  return {
    frameWidth: 480,
    frameHeight: 360,
    keypoints: coreNames.map((name, index) => ({
      name,
      x: points[index][0],
      y: points[index][1],
      score: missing.includes(name) ? 0.1 : score,
    })),
  };
}

describe('analyzePoseQuality', () => {
  it('accepts a fully visible body at a useful camera distance', () => {
    const result = analyzePoseQuality(makePose());

    expect(result.status).toBe('good');
    expect(result.canStart).toBe(true);
    expect(result.message).toContain('准备');
  });

  it('warns when the user is too close to the camera', () => {
    const result = analyzePoseQuality(makePose({ minY: 4, maxY: 358 }));

    expect(result.status).toBe('too_close');
    expect(result.canStart).toBe(false);
  });

  it('warns when the user is too far from the camera', () => {
    const result = analyzePoseQuality(makePose({ minY: 120, maxY: 245 }));

    expect(result.status).toBe('too_far');
    expect(result.canStart).toBe(false);
  });

  it('warns when core lower-body points are missing', () => {
    const result = analyzePoseQuality(makePose({ missing: ['left_ankle', 'right_ankle'] }));

    expect(result.status).toBe('not_visible');
    expect(result.canStart).toBe(false);
  });

  it('uses low landmark confidence as a light or occlusion warning', () => {
    const result = analyzePoseQuality(makePose({ score: 0.42 }));

    expect(result.status).toBe('low_confidence');
    expect(result.canStart).toBe(false);
  });
});
