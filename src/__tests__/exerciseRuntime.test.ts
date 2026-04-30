import { getExerciseRuntimeProfile } from '../utils/exerciseRuntime';

describe('exercise runtime profile', () => {
  it('uses faster active inference for jump rope', () => {
    const profile = getExerciseRuntimeProfile('jump_rope');

    expect(profile.activePoseIntervalMs).toBe(80);
    expect(profile.previewPoseIntervalMs).toBeGreaterThan(profile.activePoseIntervalMs);
  });

  it('uses slower active inference for low-speed exercises to save battery', () => {
    const squat = getExerciseRuntimeProfile('squats');
    const sitUps = getExerciseRuntimeProfile('sit_ups');

    expect(squat.activePoseIntervalMs).toBe(120);
    expect(sitUps.activePoseIntervalMs).toBe(120);
  });

  it('keeps every interval inside CameraView supported bounds', () => {
    const profiles = [
      getExerciseRuntimeProfile('jump_rope'),
      getExerciseRuntimeProfile('jumping_jacks'),
      getExerciseRuntimeProfile('squats'),
      getExerciseRuntimeProfile('standing_long_jump'),
      getExerciseRuntimeProfile('vertical_jump'),
      getExerciseRuntimeProfile('sit_ups'),
    ];

    profiles.forEach((profile) => {
      expect(profile.activePoseIntervalMs).toBeGreaterThanOrEqual(50);
      expect(profile.activePoseIntervalMs).toBeLessThanOrEqual(300);
      expect(profile.previewPoseIntervalMs).toBeGreaterThanOrEqual(50);
      expect(profile.previewPoseIntervalMs).toBeLessThanOrEqual(300);
    });
  });
});
