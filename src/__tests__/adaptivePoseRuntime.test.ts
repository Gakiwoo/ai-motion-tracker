import { createAdaptivePoseRuntime } from '../utils/adaptivePoseRuntime';

describe('adaptivePoseRuntime', () => {
  it('increases active interval when inference is consistently slower than the frame budget', () => {
    const runtime = createAdaptivePoseRuntime({
      baseIntervalMs: 80,
      minIntervalMs: 60,
      maxIntervalMs: 180,
    });

    expect(runtime.recordSample({ inferenceMs: 78, isActive: true })).toBe(80);
    expect(runtime.recordSample({ inferenceMs: 79, isActive: true })).toBe(80);
    expect(runtime.recordSample({ inferenceMs: 80, isActive: true })).toBe(100);
  });

  it('recovers toward the base interval after sustained headroom', () => {
    const runtime = createAdaptivePoseRuntime({
      baseIntervalMs: 80,
      minIntervalMs: 60,
      maxIntervalMs: 180,
    });

    runtime.recordSample({ inferenceMs: 90, isActive: true });
    runtime.recordSample({ inferenceMs: 92, isActive: true });
    expect(runtime.recordSample({ inferenceMs: 95, isActive: true })).toBe(100);

    for (let i = 0; i < 11; i += 1) {
      expect(runtime.recordSample({ inferenceMs: 25, isActive: true })).toBe(100);
    }
    expect(runtime.recordSample({ inferenceMs: 25, isActive: true })).toBe(90);
  });

  it('ignores preview samples and respects configured bounds', () => {
    const runtime = createAdaptivePoseRuntime({
      baseIntervalMs: 170,
      minIntervalMs: 80,
      maxIntervalMs: 180,
    });

    expect(runtime.recordSample({ inferenceMs: 400, isActive: false })).toBe(170);
    runtime.recordSample({ inferenceMs: 170, isActive: true });
    runtime.recordSample({ inferenceMs: 170, isActive: true });
    expect(runtime.recordSample({ inferenceMs: 170, isActive: true })).toBe(180);
    runtime.recordSample({ inferenceMs: 170, isActive: true });
    runtime.recordSample({ inferenceMs: 170, isActive: true });
    expect(runtime.recordSample({ inferenceMs: 170, isActive: true })).toBe(180);
  });
});
