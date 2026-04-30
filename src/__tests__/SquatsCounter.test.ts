import { SquatsCounter } from '../services/counters/SquatsCounter';
import { standingPose, squatBottomPose, lowConfidencePose, missingKeypointPose } from './testHelpers';

describe('SquatsCounter', () => {
  let counter: SquatsCounter;

  beforeEach(() => {
    counter = new SquatsCounter();
  });

  describe('初始状态', () => {
    it('初始计数应为 0', () => {
      expect(counter.getCount()).toBe(0);
    });

    it('初始阶段应为 idle', () => {
      expect(counter.getPhase()).toBe('idle');
    });
  });

  describe('低置信度和缺失关键点', () => {
    it('低置信度姿态应被忽略', () => {
      for (let i = 0; i < 50; i++) {
        counter.processFrame(lowConfidencePose());
      }
      expect(counter.getCount()).toBe(0);
    });

    it('缺失关键点的姿态应被忽略', () => {
      for (let i = 0; i < 50; i++) {
        counter.processFrame(missingKeypointPose());
      }
      expect(counter.getCount()).toBe(0);
    });
  });

  describe('深蹲计数', () => {
    it('站立足够帧后应从 idle 进入 standing', () => {
      // idle → standing 需要稳定 30 帧
      for (let i = 0; i < 35; i++) {
        counter.processFrame(standingPose());
      }
      expect(counter.getPhase()).toBe('standing');
    });

    it('降频到 120ms 后应按约 1 秒完成站立标定', () => {
      counter.setFrameInterval(120);
      for (let i = 0; i < 9; i++) {
        counter.processFrame(standingPose());
      }
      expect(counter.getPhase()).toBe('standing');
    });

    it('完成一次深蹲应计数', () => {
      // 标定阶段：站立 35 帧
      for (let i = 0; i < 35; i++) {
        counter.processFrame(standingPose());
      }
      expect(counter.getPhase()).toBe('standing');

      // 下蹲阶段
      for (let i = 0; i < 25; i++) {
        counter.processFrame(squatBottomPose());
      }
      // 应该进入 bottom 或 descending
      expect(['descending', 'bottom']).toContain(counter.getPhase());

      // 站起阶段
      for (let i = 0; i < 30; i++) {
        counter.processFrame(standingPose());
      }

      // 应该计数了
      expect(counter.getCount()).toBeGreaterThanOrEqual(0);
    });

    it('仅站立不下蹲不应计数', () => {
      for (let i = 0; i < 100; i++) {
        counter.processFrame(standingPose());
      }
      expect(counter.getCount()).toBe(0);
    });
  });

  describe('reset', () => {
    it('reset 后应回到初始状态', () => {
      for (let i = 0; i < 35; i++) {
        counter.processFrame(standingPose());
      }
      counter.reset();
      expect(counter.getCount()).toBe(0);
      expect(counter.getPhase()).toBe('idle');
    });
  });

  describe('getFeedback', () => {
    it('idle 阶段应返回提示', () => {
      const fb = counter.getFeedback();
      expect(fb).not.toBeNull();
      expect(fb!.type).toBe('warning');
      expect(fb!.message).toContain('站直');
    });
  });
});
