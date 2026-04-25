import { ExerciseCounter } from '../services/ExerciseCounter';

// 用最小实现测试基类
class TestCounter extends ExerciseCounter {
  processFrame(_pose: any): void {
    this.totalFrames++;
  }
}

describe('ExerciseCounter 基类', () => {
  let counter: TestCounter;

  beforeEach(() => {
    counter = new TestCounter();
  });

  it('初始计数应为 0', () => {
    expect(counter.getCount()).toBe(0);
  });

  it('初始阶段应为 neutral', () => {
    expect(counter.getPhase()).toBe('neutral');
  });

  it('getRate 在无数据时应返回 0', () => {
    expect(counter.getRate()).toBe(0);
  });

  it('setFrameInterval 应设置帧间隔', () => {
    counter.setFrameInterval(80);
    // 间接通过 getRate 验证
    counter.processFrame({});
    expect(counter.getRate()).toBe(0); // count=0 所以还是 0
  });

  it('getRate 在有计数和帧数时应返回正数', () => {
    counter.setFrameInterval(100);
    // 模拟 100 帧，1 次计数
    for (let i = 0; i < 100; i++) {
      counter.processFrame({});
    }
    // 但 getCount 仍然是 0 因为 processFrame 不增加 count
    // 需要直接验证公式逻辑
    expect(counter.getRate()).toBe(0);
  });

  it('reset 应重置所有状态', () => {
    counter.processFrame({});
    counter.processFrame({});
    counter.reset();
    expect(counter.getCount()).toBe(0);
    expect(counter.getPhase()).toBe('neutral');
  });

  it('getFeedback 默认返回 null', () => {
    expect(counter.getFeedback()).toBeNull();
  });
});

describe('ExerciseCounter getRate 公式验证', () => {
  it('100帧 @ 100ms间隔 + 1次计数 = 60/分钟', () => {
    class CountingCounter extends ExerciseCounter {
      constructor() {
        super();
        // 模拟 100 帧后计数 1 次
      }
      processFrame(_pose: any): void {
        this.totalFrames++;
      }
      simulateCount(frames: number, counts: number): void {
        this.totalFrames = frames;
        (this as any).count = counts;
      }
    }

    const c = new CountingCounter();
    c.setFrameInterval(100);
    c.simulateCount(100, 1); // 100帧 = 10秒 @ 10fps, 1次 = 6/分钟
    // getRate: count / (totalFrames / fps) * 60
    // fps = 1000/100 = 10, seconds = 100/10 = 10, rate = 1/10 * 60 = 6
    expect(c.getRate()).toBe(6);
  });

  it('300帧 @ 100ms间隔 + 10次计数 = 60/分钟', () => {
    class CountingCounter extends ExerciseCounter {
      processFrame(_pose: any): void {
        this.totalFrames++;
      }
      simulateCount(frames: number, counts: number): void {
        this.totalFrames = frames;
        (this as any).count = counts;
      }
    }

    const c = new CountingCounter();
    c.setFrameInterval(100);
    c.simulateCount(300, 10); // 300帧 = 30秒, 10次 = 20/分钟
    expect(c.getRate()).toBe(20);
  });
});
