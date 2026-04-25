import { KalmanFilter1D, SlidingWindow } from '../utils/filters';

describe('KalmanFilter1D', () => {
  it('初始状态下 filter 返回接近测量值的估计', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    kf.reset(100);
    // 第一次测量后，估计值应该在初始值和测量值之间
    const result = kf.filter(100);
    expect(result).toBeCloseTo(100, 0);
  });

  it('多次输入相同值应收敛到该值', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    kf.reset(0);
    let last = 0;
    for (let i = 0; i < 50; i++) {
      last = kf.filter(100);
    }
    expect(last).toBeCloseTo(100, 0);
  });

  it('应平滑噪声信号', () => {
    const kf = new KalmanFilter1D(0.008, 0.06);
    kf.reset(100);
    const clean = 100;
    const noisy = [98, 103, 97, 105, 100, 102, 96, 104, 99, 101];
    const outputs: number[] = [];
    for (const v of noisy) {
      outputs.push(kf.filter(v));
    }
    // 滤波后输出的方差应小于输入
    const inputVar = variance(noisy);
    const outputVar = variance(outputs);
    expect(outputVar).toBeLessThan(inputVar);
  });

  it('reset 应重置状态', () => {
    const kf = new KalmanFilter1D(0.01, 0.1);
    kf.filter(50);
    kf.filter(60);
    kf.reset(200);
    expect(kf.state).toBe(200);
  });
});

describe('SlidingWindow', () => {
  it('push 后 size 应增长直到 capacity', () => {
    const sw = new SlidingWindow(5);
    expect(sw.size).toBe(0);
    sw.push(1);
    expect(sw.size).toBe(1);
    sw.push(2);
    sw.push(3);
    sw.push(4);
    sw.push(5);
    expect(sw.size).toBe(5);
    expect(sw.isFull).toBe(true);
    // 超出容量，size 不变
    sw.push(6);
    expect(sw.size).toBe(5);
  });

  it('应丢弃最旧的数据', () => {
    const sw = new SlidingWindow(3);
    sw.push(1);
    sw.push(2);
    sw.push(3);
    sw.push(4);
    expect(sw.data).toEqual([2, 3, 4]);
  });

  it('mean 应正确计算均值', () => {
    const sw = new SlidingWindow(5);
    sw.push(10);
    sw.push(20);
    sw.push(30);
    expect(sw.mean()).toBeCloseTo(20, 5);
  });

  it('variance 应正确计算方差', () => {
    const sw = new SlidingWindow(5);
    sw.push(10);
    sw.push(10);
    sw.push(10);
    expect(sw.variance()).toBe(0);
  });

  it('空窗口 mean=0 variance=Infinity', () => {
    const sw = new SlidingWindow(5);
    expect(sw.mean()).toBe(0);
    expect(sw.variance()).toBe(Infinity);
  });

  it('clear 应清空窗口', () => {
    const sw = new SlidingWindow(5);
    sw.push(1);
    sw.push(2);
    sw.clear();
    expect(sw.size).toBe(0);
    expect(sw.isFull).toBe(false);
  });

  it('min/max 应正确计算', () => {
    const sw = new SlidingWindow(5);
    sw.push(3);
    sw.push(1);
    sw.push(4);
    expect(sw.min()).toBe(1);
    expect(sw.max()).toBe(4);
  });
});

function variance(arr: number[]): number {
  const m = arr.reduce((s, v) => s + v, 0) / arr.length;
  return arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length;
}
