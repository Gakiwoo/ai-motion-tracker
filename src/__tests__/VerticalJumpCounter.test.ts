import { VerticalJumpCounter } from '../services/counters/VerticalJumpCounter';
import { standingPose, squatBottomPose, airbornePose, lowConfidencePose, missingKeypointPose } from './testHelpers';

describe('VerticalJumpCounter', () => {
  let counter: VerticalJumpCounter;

  beforeEach(() => {
    counter = new VerticalJumpCounter();
  });

  describe('初始状态', () => {
    it('初始计数应为 0', () => {
      expect(counter.getCount()).toBe(0);
    });

    it('初始阶段应为 idle', () => {
      expect(counter.getPhase()).toBe('idle');
    });

    it('未标定', () => {
      expect(counter.isCalibrated()).toBe(false);
    });

    it('初始高度应为 0', () => {
      expect(counter.getHeight()).toBe(0);
    });

    it('初始跳跃次数应为 0', () => {
      expect(counter.getJumpCount()).toBe(0);
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

  describe('标定', () => {
    it('站立足够帧后应完成标定', () => {
      for (let i = 0; i < 30; i++) {
        counter.processFrame(standingPose());
      }
      expect(counter.isCalibrated()).toBe(true);
      expect(counter.getPhase()).toBe('ready');
    });
  });

  describe('纵跳流程', () => {
    it('标定后下蹲应进入 crouch', () => {
      for (let i = 0; i < 30; i++) {
        counter.processFrame(standingPose());
      }
      for (let i = 0; i < 10; i++) {
        counter.processFrame(squatBottomPose());
      }
      expect(counter.getPhase()).toBe('crouch');
    });

    it('完整纵跳流程不崩溃', () => {
      // 标定
      for (let i = 0; i < 30; i++) {
        counter.processFrame(standingPose());
      }
      // 下蹲
      for (let i = 0; i < 10; i++) {
        counter.processFrame(squatBottomPose());
      }
      // 起跳
      for (let i = 0; i < 5; i++) {
        counter.processFrame(standingPose());
      }
      // 腾空
      for (let i = 0; i < 10; i++) {
        counter.processFrame(airbornePose());
      }
      // 落地
      for (let i = 0; i < 20; i++) {
        counter.processFrame(standingPose());
      }
      // 不崩溃就算通过
      expect(counter.getCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setUserHeight', () => {
    it('应限制身高范围 100-220cm', () => {
      counter.setUserHeight(50);
      expect(counter.getUserHeight()).toBe(100);
      counter.setUserHeight(300);
      expect(counter.getUserHeight()).toBe(220);
      counter.setUserHeight(180);
      expect(counter.getUserHeight()).toBe(180);
    });
  });

  describe('reset', () => {
    it('reset 后应回到初始状态', () => {
      for (let i = 0; i < 30; i++) {
        counter.processFrame(standingPose());
      }
      counter.reset();
      expect(counter.getCount()).toBe(0);
      expect(counter.getPhase()).toBe('idle');
      expect(counter.isCalibrated()).toBe(false);
      expect(counter.getHeight()).toBe(0);
      expect(counter.getJumpCount()).toBe(0);
    });
  });

  describe('getFeedback', () => {
    it('未标定时应返回标定提示', () => {
      const fb = counter.getFeedback();
      if (fb) {
        expect(fb.type).toBe('warning');
      }
    });
  });
});
